import { test } from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { normalizeQrPayload, serviceDate } from '../backend/services/ticketScanService.js';
import { parseUpload } from '../backend/services/uploadValidation.js';
import { authenticate, issueAuthToken, verifyAuthToken } from '../backend/security.js';
import { parsePositiveInt } from '../backend/validation.js';
import { csvCell } from '../utils/csv';

test('the software decoder reads actual ticket QR pixels, including legacy numeric QR', () => {
  for (const value of ['QR-4A67003B93C7A53052AB89C3F6110DD4', '1234']) {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'H' });
    const scale = 6; const quiet = 4; const size = (qr.modules.size + quiet * 2) * scale;
    const pixels = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const mx = Math.floor(x / scale) - quiet; const my = Math.floor(y / scale) - quiet;
      const black = mx >= 0 && my >= 0 && mx < qr.modules.size && my < qr.modules.size && qr.modules.get(my, mx);
      const offset = (y * size + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = black ? 0 : 255; pixels[offset + 3] = 255;
    }
    assert.equal(jsQR(pixels, size, size)?.data, value);
  }
});

test('QR payload normalization preserves compatibility and bounds untrusted input', () => {
  assert.equal(normalizeQrPayload('{"qrCode":"QR-EXISTING"}'), 'QR-EXISTING');
  assert.equal(normalizeQrPayload('https://example.test/ticket?code=۱۲۳۴'), '1234');
  assert.equal(normalizeQrPayload('"QR-EXISTING"'), 'QR-EXISTING');
  assert.equal(normalizeQrPayload('QR-' + 'x'.repeat(2050)), '');
  assert.equal(normalizeQrPayload({ code: 1234 }), '');
  assert.equal(serviceDate(new Date('2026-10-19T20:31:00Z')), '2026-10-20');
});

test('session signatures and expiry are validated and URL/body tokens are rejected', () => {
  process.env.JWT_SECRET = 'local-unit-test-secret-with-more-than-32-characters';
  const token = issueAuthToken({ sub: '1', role: 'driver', driverId: '1' });
  assert.equal(verifyAuthToken(token)?.driverId, '1');
  assert.equal(verifyAuthToken(token + 'bad'), null);
  let status = 0;
  const response = { status: (value: number) => { status = value; return response; }, json: () => undefined };
  authenticate({ get: () => '', body: { authToken: token }, query: { authToken: token } }, response, () => assert.fail('query/body token accepted'));
  assert.equal(status, 401);
});

test('uploads validate signatures, canonical base64 and bounded numeric input', () => {
  const options = { maxBytes: 1024, allowedMime: ['image/png', 'text/plain'] };
  assert.equal(parseUpload(`data:image/png;base64,${Buffer.from('not a png').toString('base64')}`, options).ok, false);
  assert.equal(parseUpload('data:text/plain;base64,SGVsbG8=', options).ok, true);
  assert.equal(parseUpload('data:text/plain;base64,SGVsbG8=!!!', options).ok, false);
  assert.equal(parsePositiveInt('9'.repeat(100_000)).ok, false);
});

test('a failed purchase request is never retried automatically', async () => {
  const originalFetch = globalThis.fetch;
  let purchases = 0;
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url) === '/runtime-config.json') return new Response(JSON.stringify({ apiBasePath: '/api1', retryCount: 2 }));
    purchases += 1; throw new TypeError('Failed to fetch');
  }) as typeof fetch;
  try {
    const { reserveTicket } = await import('../services/apiService.ts');
    await assert.rejects(reserveTicket({ seatCount: 1 }, 'local-test-purchase-key'));
    assert.equal(purchases, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('CSV exports quote delimiters and neutralize spreadsheet formulas', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell(-12), '"-12"');
});
