import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parseUpload } from '../backend/services/uploadValidation.js';
import { sanitizeText, sanitizePlainText, validateIdeaDescription } from '../backend/validation.js';

const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url));

test('multiline content retains paragraphs, normalizes CRLF and replaces tabs without allowing control bytes', () => {
  const input = 'first line\r\nsecond line\tvalue\u0000\u0008';
  assert.equal(sanitizeText(input, 4000, { multiline: true }), 'first line\nsecond line value');
  assert.equal(sanitizePlainText(input, 4000, { multiline: true }), 'first line\nsecond line value');
  assert.equal(validateIdeaDescription('پاراگراف اول\r\nپاراگراف دوم').value, 'پاراگراف اول\nپاراگراف دوم');
  assert.equal(sanitizeText('name\nvalue'), 'namevalue');
  assert.equal(sanitizePlainText('<script>text</script>'), 'scripttext/script');
});

test('complete image/PDF structures decode while signature-only, truncated and oversized images are rejected', async () => {
  const sharp = backendRequire('sharp');
  const { PDFDocument } = backendRequire('pdf-lib');
  const options = { maxBytes: 2 * 1024 * 1024, allowedMime: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] };
  const check = (mime: string, bytes: Uint8Array) => parseUpload(`data:${mime};base64,${Buffer.from(bytes).toString('base64')}`, options);
  for (const [mime, signature] of [
    ['image/png', Buffer.from([137,80,78,71,13,10,26,10])],
    ['image/jpeg', Buffer.from([255,216,255])],
    ['application/pdf', Buffer.from('%PDF-')],
  ] as const) assert.equal((await check(mime, signature)).ok, false, mime);
  for (const format of ['png', 'jpeg', 'webp']) {
    const bytes = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#1261df' } }).toFormat(format).toBuffer();
    assert.equal((await check(`image/${format}`, bytes)).ok, true, format);
    assert.equal((await check(`image/${format}`, bytes.subarray(0, Math.floor(bytes.length / 2)))).ok, false, `truncated ${format}`);
  }
  const document = await PDFDocument.create();
  document.addPage([100, 100]);
  assert.equal((await check('application/pdf', await document.save())).ok, true);
  const tooManyPixels = await sharp({ create: { width: 5000, height: 4000, channels: 3, background: '#fff' } }).png().toBuffer();
  assert.equal((await check('image/png', tooManyPixels)).ok, false);
});
