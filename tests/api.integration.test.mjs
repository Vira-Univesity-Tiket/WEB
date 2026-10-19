import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createLocalDatabase } from './localDatabase.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';

let fixture, server, base;
before(async () => {
  fixture = await createLocalDatabase();
  const { default: app } = await import('../backend/app.js');
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api1`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await fixture?.cleanup(); });
const request = async (path, { token, body, method = body === undefined ? 'GET' : 'POST', key } = {}) => {
  const response = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000) });
  const data = await response.json();
  return { status: response.status, data };
};
const purchase = (token, seats = 1, schedule = 1, key = randomUUID()) => request('/tickets/reserve', { token, key, body: { schedule_id: schedule, origin_station_id: schedule === 1 ? 1 : 2, destination_station_id: schedule === 1 ? 2 : 3, departure_time: schedule === 1 ? '08:30' : '11:00', seatCount: seats } });

test('API contracts, authentication, role boundaries and health', async () => {
  assert.equal((await request('/tickets')).status, 401);
  let nested = {}; for (let index = 0; index < 40; index++) nested = { nested };
  assert.equal((await request('/auth/login', { body: nested })).status, 413);
  assert.equal((await request('/tickets', { token: fixture.tokens.driver })).status, 403);
  assert.equal((await request('/tickets?student_id=900000002', { token: fixture.tokens.user })).status, 403);
  assert.equal((await request('/admin/settings', { token: fixture.tokens.analyst, body: { commissionPercent: 20 } })).status, 403);
  assert.equal((await request('/health')).status, 200);
  for (const route of ['users', 'stations', 'drivers', 'schedules', 'notifications', 'finance?type=driver', 'settings', 'analysts', 'ideas', 'support/tickets', 'tickets/feedback', 'route-requests']) {
    const result = await request(`/admin/${route}`, { token: fixture.tokens.admin });
    assert.equal(result.status, 200, `${route}: ${JSON.stringify(result.data)}`);
  }
  assert.equal((await request('/auth/me', { token: fixture.tokens.user })).status, 200);
  assert.equal((await request('/wallet/topup', { token: fixture.tokens.user, body: { amount: 1000 } })).status, 410);
});

test('existing sessions cannot bypass account suspension or a changed administrative role', async () => {
  try {
    await fixture.db.query("UPDATE users SET status = 'suspended' WHERE id = 1");
    assert.equal((await request('/tickets', { token: fixture.tokens.user })).status, 403);
    await fixture.db.query("UPDATE drivers SET status = 'inactive' WHERE id = 1");
    assert.equal((await request('/driver/1/dashboard', { token: fixture.tokens.driver })).status, 403);
    await fixture.db.query("UPDATE admin_accounts SET status = 'inactive' WHERE id = 99");
    assert.equal((await request('/admin/users', { token: fixture.tokens.analyst })).status, 403);
    await fixture.db.query("UPDATE admin_accounts SET status = 'active', role = 'admin' WHERE id = 99");
    assert.equal((await request('/admin/users', { token: fixture.tokens.analyst })).status, 403);
  } finally {
    await fixture.db.query("UPDATE users SET status = 'active' WHERE id = 1");
    await fixture.db.query("UPDATE drivers SET status = 'active' WHERE id = 1");
    await fixture.db.query("UPDATE admin_accounts SET status = 'active', role = 'analyst' WHERE id = 99");
  }
});

let group;
test('shared purchase QR, idempotent debit and non-destructive schema rerun', async () => {
  const key = randomUUID();
  const result = await purchase(fixture.tokens.user, 2, 1, key);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  group = result.data.tickets;
  assert.equal(group.length, 2);
  assert.equal(group[0].qrCode, group[1].qrCode);
  assert.match(group[0].qrCode, /^QR-[A-F0-9]{32}$/);
  const replay = await purchase(fixture.tokens.user, 2, 1, key);
  assert.deepEqual(replay.data, result.data);
  assert.equal((await purchase(fixture.tokens.user, 1, 1, key)).status, 409);
  const [[row]] = await fixture.db.query('SELECT balance FROM users WHERE id = 1');
  assert.equal(row.balance, 900000);
  await fixture.initDB();
  const [[preserved]] = await fixture.db.query('SELECT COUNT(*) AS count FROM tickets');
  assert.equal(preserved.count, 2);
});

test('owner driver scans without separate station assignment; replay and cross-driver scans rejected', async () => {
  assert.equal((await request('/driver/scan/qr', { token: fixture.tokens.otherDriver, body: { driverId: 2, qrCode: group[0].qrCode } })).status, 403);
  const result = await request('/driver/scan/qr', { token: fixture.tokens.driver, body: { driverId: 1, qrCode: group[0].qrCode } });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.equal(result.data.scan.count, 2);
  assert.equal(result.data.scan.amount, 10000);
  assert.equal((await request('/driver/scan/qr', { token: fixture.tokens.driver, body: { driverId: 1, qrCode: group[0].qrCode } })).status, 409);
  assert.equal((await request('/driver/scan/qr', { token: fixture.tokens.driver, body: { driverId: 2, qrCode: group[0].qrCode } })).status, 403);
  const tickets = await request('/tickets', { token: fixture.tokens.user });
  assert.equal(tickets.data[0].status, 'expired');
  assert.ok(tickets.data[0].boardedAt);
  const summary = await request('/driver/1/summary', { token: fixture.tokens.driver });
  assert.equal(summary.data.boardedCount, 2);
});

test('trip feedback endpoints enforce ownership, rating, boarding and analyst read-only access', async () => {
  const path = `/tickets/${group[0].id}/feedback`;
  assert.equal((await request(path, { token: fixture.tokens.other, body: { rating: 5, comment: '' } })).status, 404);
  assert.equal((await request(path, { token: fixture.tokens.user, body: { rating: 6, comment: '' } })).status, 400);
  const saved = await request(path, { token: fixture.tokens.user, body: { rating: 5, comment: 'سفر آزمایشی' } });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.ticket.feedbackRating, 5);
  assert.equal((await request(path, { token: fixture.tokens.user, body: { rating: 4, comment: '' } })).status, 409);
  assert.equal((await request(`/admin/tickets/${group[0].id}/feedback/status`, { token: fixture.tokens.analyst, body: { status: 'resolved' } })).status, 403);
  assert.equal((await request(`/admin/tickets/${group[0].id}/feedback/status`, { token: fixture.tokens.admin, body: { status: 'resolved' } })).status, 200);
});

test('Persian manual codes, legacy collision rejection, expired and inactive driver protections', async () => {
  const first = await purchase(fixture.tokens.other);
  const second = await purchase(fixture.tokens.third);
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  const one = first.data.ticket; const two = second.data.ticket;
  await fixture.db.query('UPDATE tickets SET validation_code = ? WHERE id = ?', [one.validationCode, two.id]);
  assert.equal((await request('/driver/scan/code', { token: fixture.tokens.driver, body: { driverId: 1, code: one.validationCode } })).status, 409);
  await fixture.db.query("UPDATE tickets SET validation_code = '0001' WHERE id = ?", [two.id]);
  const code = one.validationCode.replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
  assert.equal((await request('/driver/scan/code', { token: fixture.tokens.driver, body: { driverId: 1, code } })).status, 201);
  await fixture.db.query('UPDATE tickets SET created_at = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE id = ?', [two.id]);
  assert.equal((await request('/driver/scan/qr', { token: fixture.tokens.driver, body: { driverId: 1, qrCode: two.qrCode } })).status, 400);
  await fixture.db.query("UPDATE drivers SET status = 'inactive' WHERE id = 1");
  assert.equal((await request('/driver/scan/qr', { token: fixture.tokens.driver, body: { driverId: 1, qrCode: one.qrCode } })).status, 403);
  await fixture.db.query("UPDATE drivers SET status = 'active' WHERE id = 1");
});

test('concurrent reservations never oversell the first bus for a schedule', async () => {
  const results = await Promise.all([fixture.tokens.user, fixture.tokens.other, fixture.tokens.third].map(token => purchase(token, 1, 2)));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 200, 400], JSON.stringify(results));
  const [buses] = await fixture.db.query('SELECT id, remaining_seats FROM buses WHERE schedule_id = 2');
  assert.equal(buses.length, 1);
  assert.equal(buses[0].remaining_seats, 0);
  const [[seats]] = await fixture.db.query('SELECT COUNT(DISTINCT seat_number) AS count FROM tickets WHERE bus_id = ?', [buses[0].id]);
  assert.equal(seats.count, 2);
  const [tickets] = await fixture.db.query('SELECT qr_code FROM tickets WHERE bus_id = ? LIMIT 1', [buses[0].id]);
  const scans = await Promise.all([1, 2].map(() => request('/driver/scan/qr', { token: fixture.tokens.otherDriver, body: { driverId: 2, qrCode: tickets[0].qr_code } })));
  assert.deepEqual(scans.map(item => item.status).sort(), [201, 409]);
});

test('uploads reject forged MIME and support downloads retain object ownership', async () => {
  const fake = await request('/support/tickets', { token: fixture.tokens.user, body: { title: 'آزمایش ضمیمه', message: 'توضیح', attachments: [{ name: 'x.png', dataUrl: `data:image/png;base64,${Buffer.from('<script>bad</script>').toString('base64')}` }] } });
  assert.equal(fake.status, 400);
  const valid = await request('/support/tickets', { token: fixture.tokens.user, body: { title: 'آزمایش ضمیمه', message: 'توضیح', attachments: [{ name: 'safe.txt', dataUrl: `data:text/plain;base64,${Buffer.from('local test').toString('base64')}` }] } });
  assert.equal(valid.status, 200, JSON.stringify(valid.data));
  const list = await request('/support/tickets', { token: fixture.tokens.user });
  const detail = await request(`/support/tickets/${list.data[0].id}`, { token: fixture.tokens.user });
  const attachmentId = detail.data.messages[0].attachments[0].id;
  assert.equal((await request(`/support/attachments/${attachmentId}/download`, { token: fixture.tokens.other })).status, 403);
  const file = await fetch(`${base}/support/attachments/${attachmentId}/download`, { headers: { Authorization: `Bearer ${fixture.tokens.user}` } });
  assert.equal(file.status, 200); assert.equal(await file.text(), 'local test');
  assert.equal((await request('/auth/update-profile', { token: fixture.tokens.user, body: { language: 'invalid' } })).status, 400);
});

test('price and driver-name changes preserve bus capacity and financial attribution', async () => {
  const [[before]] = await fixture.db.query('SELECT COUNT(*) AS count FROM buses WHERE schedule_id = 1');
  await fixture.db.query('UPDATE schedules SET price = 70000 WHERE id = 1');
  const result = await purchase(fixture.tokens.user);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  const [[afterCount]] = await fixture.db.query('SELECT COUNT(*) AS count FROM buses WHERE schedule_id = 1');
  assert.equal(afterCount.count, before.count);
  await fixture.db.query("UPDATE drivers SET name = 'راننده با نام جدید' WHERE id = 1");
  const schedule = await request('/bus/schedule', { body: { origin: 1, destination: 2 } });
  assert.equal(schedule.status, 200);
  assert.ok(schedule.data[0].remainingSeats < 6);
  const finance = await request('/admin/finance?type=driver', { token: fixture.tokens.admin });
  assert.ok(finance.data.some(row => row.identifier === 'TEST-1' && row.amount === 7000));
  assert.equal((await request('/admin/schedules/1', { token: fixture.tokens.admin, method: 'PUT', body: { driverId: 2, originStationId: 1, destinationStationId: 2, departureTime: '08:30', price: 70000 } })).status, 409);
  await fixture.db.query('UPDATE schedules SET driver_id = 2 WHERE id = 1');
  const historical = await request('/admin/finance?type=driver', { token: fixture.tokens.admin });
  assert.ok(historical.data.some(row => row.identifier === 'TEST-1' && row.amount === 7000));
  await fixture.db.query('UPDATE schedules SET driver_id = 1 WHERE id = 1');
  assert.equal((await request('/admin/finance?type=invalid', { token: fixture.tokens.admin })).status, 400);
  assert.equal((await request('/admin/users/1', { token: fixture.tokens.admin, method: 'DELETE' })).status, 409);
});

test('pending driver registration cannot be replaced without the previous password', async () => {
  const { hashPassword } = await import('../backend/security.js');
  const password = await hashPassword('previous-password');
  await fixture.db.query("INSERT INTO drivers (name, username, password, license_plate, national_code, status) VALUES ('راننده در انتظار', 'pending-test', ?, 'PENDING-1', '1234567891', 'pending')", [password]);
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5xkAAAAASUVORK5CYII=';
  const result = await request('/driver/register', { body: { name: 'تلاش جایگزینی', username: 'pending-test', password: 'different-password', nationalCode: '1234567891', birthDate: '1380/01/01', plateData: { part1: '11', letter: 'ب', part2: '111', part3: '11' }, documents: { nationalCard: image, licenseCard: image, carCard: image } } });
  assert.equal(result.status, 409);
  const [[row]] = await fixture.db.query("SELECT password FROM drivers WHERE username = 'pending-test'");
  assert.equal(row.password, password);
});

test('transactional management, route, support and idea writes complete without borrowing a second pool connection', async () => {
  const driver = await request('/admin/drivers', { token: fixture.tokens.admin, body: { name: 'راننده بررسی اتصال', username: 'driver-pool-test', password: 'local-pool-driver-password', licensePlate: 'TEST-POOL', phone: '09123456789', capacity: 2, assignedStations: [1, 3] } });
  assert.equal(driver.status, 201, JSON.stringify(driver.data));
  const driverId = Number(driver.data.id);
  const login = await request('/driver/login', { body: { username: 'driver-pool-test', password: 'local-pool-driver-password' } });
  assert.equal(login.status, 200);
  const routeBody = { originStationId: 1, destinationStationId: 3, departureTime: '12:00', priceToman: 10000, stationIds: [1, 3] };
  const route = await request('/driver/route-requests', { token: login.data.token, body: routeBody });
  assert.equal(route.status, 201, JSON.stringify(route.data));
  assert.equal((await request(`/admin/route-requests/${route.data.id}/approve`, { token: fixture.tokens.admin, body: { ...routeBody, driverId } })).status, 200);
  const rejected = await request('/driver/route-requests', { token: login.data.token, body: { ...routeBody, departureTime: '13:00' } });
  assert.equal(rejected.status, 201);
  assert.equal((await request(`/admin/route-requests/${rejected.data.id}/reject`, { token: fixture.tokens.admin, body: { adminNote: 'آزمون محلی' } })).status, 200);
  assert.equal((await request('/admin/topup', { token: fixture.tokens.admin, body: { studentId: '900000002', amount: 1000 } })).status, 200);
  assert.equal((await request('/admin/schedules/1', { token: fixture.tokens.admin, method: 'PUT', body: { driverId: 1, originStationId: 1, destinationStationId: 2, departureTime: '08:30', price: 80000 } })).status, 200);
  const idea = await request('/ideas', { token: fixture.tokens.other, body: { title: 'بهبود ایستگاه سرویس', description: 'پیشنهاد محلی برای بررسی جریان ثبت ایده و پاسخ مدیریت', category: 'سرویس' } });
  assert.equal(idea.status, 201, JSON.stringify(idea.data));
  assert.equal((await request(`/admin/ideas/${idea.data.id}`, { token: fixture.tokens.admin, method: 'PUT', body: { status: 'reviewing', adminResponse: 'این پاسخ فقط برای آزمون محلی است.' } })).status, 200);
  const support = await request('/support/tickets', { token: fixture.tokens.other, body: { title: 'بررسی اتصال پایگاه داده', message: 'پیام اول آزمون' } });
  assert.equal(support.status, 200, JSON.stringify(support.data));
  const supportId = support.data.ticket.id;
  assert.equal((await request(`/support/tickets/${supportId}/messages`, { token: fixture.tokens.other, body: { message: 'پیام دوم آزمون' } })).status, 200);
  assert.equal((await request(`/admin/support/tickets/${supportId}/status`, { token: fixture.tokens.admin, body: { status: 'closed' } })).status, 200);
  const txt = await fetch(`${base}/support/tickets/${supportId}/txt`, { headers: { Authorization: `Bearer ${fixture.tokens.other}` }, signal: AbortSignal.timeout(8000) });
  assert.equal(txt.status, 200);
  assert.match(await txt.text(), /پیام دوم آزمون/);
  const [temporary] = await fixture.db.query("INSERT INTO users (name, student_id, national_code) VALUES ('کاربر موقت آزمون', '900000004', '1234567890')");
  assert.equal((await request(`/admin/users/${temporary.insertId}`, { token: fixture.tokens.admin, method: 'DELETE' })).status, 200);
});

test('an unavailable database prevents the production server from accepting traffic', async () => {
  const run = promisify(execFile);
  await assert.rejects(run(process.execPath, ['backend/server.js'], {
    env: { ...process.env, NODE_ENV: 'production', BACKEND_NODE_ENV: 'production', DB_PORT: '1', PORT: '59998' },
    timeout: 15000
  }), error => error.code === 1 && String(error.stderr).includes('Backend bootstrap failed'));
});

test('local gateway simulation binds callback authority and supports repeat topups with the same card', async () => {
  const pending = new Map();
  let next = 0;
  const gateway = http.createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    const input = JSON.parse(text);
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/request') {
      const authority = `A-${randomUUID()}`;
      pending.set(authority, { amount: input.amount, reference: String(++next), verified: false });
      res.end(JSON.stringify({ data: { code: 100, authority } }));
    } else {
      const payment = pending.get(input.authority);
      assert.equal(input.amount, payment.amount);
      const code = payment.verified ? 101 : 100;
      payment.verified = true;
      res.end(JSON.stringify({ data: { code, ref_id: payment.reference, card_pan: '999999******9999', diagnostic: 'x'.repeat(5000) } }));
    }
  });
  gateway.listen(0, '127.0.0.1'); await new Promise(resolve => gateway.once('listening', resolve));
  const url = `http://127.0.0.1:${gateway.address().port}`;
  const keys = ['PAYMENT_GATEWAY', 'ZARINPAL_MERCHANT_ID', 'PAYMENT_CALLBACK_URL', 'PAYMENT_RETURN_URL', 'ZARINPAL_REQUEST_URL', 'ZARINPAL_VERIFY_URL', 'ZARINPAL_STARTPAY_URL'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { PAYMENT_GATEWAY: 'zarinpal', ZARINPAL_MERCHANT_ID: 'local-test-merchant', PAYMENT_CALLBACK_URL: base + '/wallet/topup/callback', PAYMENT_RETURN_URL: 'http://127.0.0.1:3017', ZARINPAL_REQUEST_URL: url + '/request', ZARINPAL_VERIFY_URL: url + '/verify', ZARINPAL_STARTPAY_URL: url + '/pay/' });
  const [[beforeBalance]] = await fixture.db.query('SELECT balance FROM users WHERE id = 1');
  try {
    for (let index = 0; index < 2; index++) {
      const created = await request('/wallet/topup/initiate', { token: fixture.tokens.user, body: { amount: 10000 } });
      assert.equal(created.status, 200, JSON.stringify(created.data));
      const [[payment]] = await fixture.db.query('SELECT authority FROM payment_transactions WHERE id = ?', [created.data.transactionId]);
      const wrong = await request('/wallet/topup/callback', { body: { transactionId: created.data.transactionId, Authority: 'wrong', Status: 'NOK' } });
      assert.equal(wrong.status, 400);
      const callback = { transactionId: created.data.transactionId, Authority: payment.authority, Status: 'OK', RefID: 'forged-client-reference' };
      const verified = await request('/wallet/topup/callback', { body: callback });
      assert.equal(verified.status, 200, JSON.stringify(verified.data));
      assert.equal((await request('/wallet/topup/callback', { body: callback })).data.idempotent, true);
      const [[stored]] = await fixture.db.query('SELECT reference_id, gateway_transaction_id FROM payment_transactions WHERE id = ?', [created.data.transactionId]);
      assert.notEqual(stored.reference_id, 'forged-client-reference');
      assert.notEqual(stored.gateway_transaction_id, '999999******9999');
    }
    const [[afterBalance]] = await fixture.db.query('SELECT balance FROM users WHERE id = 1');
    assert.equal(afterBalance.balance, beforeBalance.balance + 200000);
    const created = await request('/wallet/topup/initiate', { token: fixture.tokens.user, body: { amount: 10000 } });
    assert.equal(created.status, 200);
    const [[payment]] = await fixture.db.query('SELECT authority FROM payment_transactions WHERE id = ?', [created.data.transactionId]);
    await fixture.db.query("INSERT INTO settings (setting_key, setting_value) VALUES ('weekly_wallet_topup_limit_toman', '1000') ON DUPLICATE KEY UPDATE setting_value = '1000'");
    await fixture.db.query("UPDATE users SET status = 'suspended' WHERE id = 1");
    const credited = await request('/wallet/topup/callback', { body: { transactionId: created.data.transactionId, Authority: payment.authority, Status: 'OK' } });
    assert.equal(credited.status, 200, JSON.stringify(credited.data));
    const [[paidBalance]] = await fixture.db.query('SELECT balance FROM users WHERE id = 1');
    assert.equal(paidBalance.balance, beforeBalance.balance + 300000);
    await fixture.db.query("UPDATE users SET status = 'active' WHERE id = 1");

  } finally {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    await new Promise(resolve => gateway.close(resolve));
  }
});
