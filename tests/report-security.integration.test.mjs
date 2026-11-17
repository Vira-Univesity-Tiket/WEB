import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalDatabase } from './localDatabase.mjs';

let fixture, server, base;
before(async () => {
  fixture = await createLocalDatabase();
  const { default: app } = await import('../backend/app.js');
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api1`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await fixture?.cleanup(); });
const request = async (path, { token, body, method = body === undefined ? 'GET' : 'POST' } = {}) => {
  const response = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000) });
  return { status: response.status, data: await response.json() };
};
const login = (username, password) => request('/admin/login', { body: { username, password } });
const edit = (id, suffix, body, token = fixture.tokens.admin) => request(`/admin/analysts/${id}${suffix}`, { method: 'PUT', body, token });

test('password reset revokes the verified credential snapshot; fresh credentials still work', async () => {
  const previous = await login('test-analyst', 'local-driver-test-password');
  assert.equal(previous.status, 200);
  assert.equal((await edit(99, '/reset-password', { password: 'new-regression-password' })).status, 200);
  for (const path of ['/admin/users', '/admin/ideas', '/admin/finance?type=driver']) {
    assert.equal((await request(path, { token: previous.data.token })).status, 403);
  }
  assert.equal((await login('test-analyst', 'local-driver-test-password')).status, 401);
  const fresh = await login('test-analyst', 'new-regression-password');
  assert.equal(fresh.status, 200);
  assert.equal((await request('/admin/users', { token: fresh.data.token })).status, 200);
  // Restoring an account's old visible attributes cannot revive its old session.
  assert.equal((await edit(99, '/status', {})).status, 200);
  assert.equal((await edit(99, '/status', {})).status, 200);
  assert.equal((await request('/admin/users', { token: fresh.data.token })).status, 403);
  const renamed = await login('test-analyst', 'new-regression-password');
  assert.equal((await edit(99, '', { username: 'temporary-name', role: 'analyst' })).status, 200);
  assert.equal((await edit(99, '', { username: 'test-analyst', role: 'analyst' })).status, 200);
  assert.equal((await request('/admin/users', { token: renamed.data.token })).status, 403);
});

test('last admin is preserved under individual and concurrent role/status changes', async () => {
  assert.equal((await edit(1, '', { username: 'test-admin', role: 'analyst' })).status, 409);
  assert.equal((await edit(1, '/status', {})).status, 409);
  assert.equal((await edit(1, '', { username: 'test-admin', role: 'admin' })).status, 200);
  const accounts = [];
  for (const username of ['brm-admin-one', 'brm-admin-two']) {
    const created = await request('/admin/analysts', { token: fixture.tokens.admin, body: { username, password: 'concurrency-password', role: 'admin' } });
    assert.equal(created.status, 201);
    const session = await login(username, 'concurrency-password');
    accounts.push({ ...created.data, token: session.data.token });
  }
  try {
    // Restrict only this isolated fixture to the two racing administrators.
    await fixture.db.query("UPDATE admin_accounts SET status = 'inactive' WHERE id = 1");
    const results = await Promise.all([
      edit(accounts[0].id, '', { username: accounts[0].username, role: 'analyst' }, accounts[0].token),
      edit(accounts[1].id, '/status', {}, accounts[1].token),
    ]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    const [[remaining]] = await fixture.db.query("SELECT COUNT(*) AS count FROM admin_accounts WHERE role = 'admin' AND status = 'active'");
    assert.equal(remaining.count, 1);
  } finally { await fixture.db.query("UPDATE admin_accounts SET status = 'active' WHERE id = 1"); }
});

test('driver credential resets and restored status invalidate old driver sessions', async () => {
  const old = await request('/driver/login', { body: { username: 'driver-test', password: 'local-driver-test-password' } });
  assert.equal(old.status, 200);
  const body = { name: 'راننده آزمایش', username: 'driver-test', licensePlate: 'TEST-1', capacity: 6, password: 'new-driver-regression-password' };
  assert.equal((await request('/admin/drivers/1', { method: 'PUT', token: fixture.tokens.admin, body })).status, 200);
  assert.equal((await request('/driver/1/dashboard', { token: old.data.token })).status, 403);
  const fresh = await request('/driver/login', { body: { username: 'driver-test', password: 'new-driver-regression-password' } });
  assert.equal(fresh.status, 200);
  for (let index = 0; index < 2; index++) assert.equal((await request('/admin/drivers/1/status', { method: 'PUT', token: fixture.tokens.admin, body: {} })).status, 200);
  assert.equal((await request('/driver/1/dashboard', { token: fresh.data.token })).status, 403);
  const current = await request('/driver/login', { body: { username: 'driver-test', password: 'new-driver-regression-password' } });
  assert.equal((await request('/admin/driver-requests/1/reject', { token: fixture.tokens.admin, body: { reason: 'بررسی آزمایشی' } })).status, 200);
  assert.equal((await request('/admin/driver-requests/1/approve', { token: fixture.tokens.admin, body: {} })).status, 200);
  assert.equal((await request('/driver/1/dashboard', { token: current.data.token })).status, 403);
});

test('server logout is idempotent, rejects copied-token replay for every role and retains other sessions', async () => {
  const { issueAuthToken } = await import('../backend/security.js');
  const admin = await login('test-admin', 'local-admin-test-password');
  const user = issueAuthToken({ sub: '1', studentId: '900000001', role: 'user' });
  const currentDriver = await request('/driver/login', { body: { username: 'driver-test', password: 'new-driver-regression-password' } });
  const driver = currentDriver.data.token;
  for (const [token, path] of [[admin.data.token, '/admin/users'], [user, '/tickets'], [driver, '/driver/1/dashboard']]) {
    assert.equal((await request(path, { token })).status, 200);
    assert.equal((await request('/auth/logout', { token, body: {} })).status, 200);
    assert.equal((await request('/auth/logout', { token, body: {} })).status, 200);
    assert.equal((await request(path, { token })).status, 401);
  }
  assert.equal((await request('/tickets', { token: fixture.tokens.user })).status, 200);
  const [[count]] = await fixture.db.query('SELECT COUNT(*) AS count FROM revoked_auth_sessions');
  assert.equal(count.count, 3);
  await fixture.initDB();
  const [[preserved]] = await fixture.db.query('SELECT COUNT(*) AS count FROM users');
  assert.equal(preserved.count, 3);
  assert.equal((await request('/tickets', { token: user })).status, 401);
});
