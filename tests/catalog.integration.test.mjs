import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, stat, rm, rmdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { createLocalDatabase } from './localDatabase.mjs';
import { importNajafabadCatalog } from '../backend/services/najafabadCatalogService.js';
import { verifyPassword } from '../backend/security.js';

let fixture, server, base, catalog, database;
let privateCredentials = [];
before(async () => {
  fixture = await createLocalDatabase();
  database = process.env.DB_NAME;
  catalog = JSON.parse(await readFile(new URL('../backend/data/najafabad-services.json', import.meta.url), 'utf8'));
  const { default: app } = await import('../backend/app.js');
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api1`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await fixture?.cleanup(); });
const request = async (path, body, token = fixture.tokens.user) => {
  const response = await fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': randomUUID() },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000)
  });
  return { status: response.status, data: await response.json() };
};
const counts = async () => {
  const [[row]] = await fixture.db.query('SELECT (SELECT COUNT(*) FROM drivers) AS drivers, (SELECT COUNT(*) FROM stations) AS stations, (SELECT COUNT(*) FROM schedules) AS schedules, (SELECT COUNT(*) FROM tickets) AS tickets');
  return row;
};
const smallCatalog = prefix => ({
  version: 1, universityKey: `${prefix}-university`,
  stations: [
    { key: `${prefix}-university`, name: `دانشگاه ${prefix}`, lat: 32.6673, lng: 51.3922, coordinateRole: 'boarding-point' },
    { key: `${prefix}-city`, name: `مبدا ${prefix}`, lat: 32.6351, lng: 51.3637, coordinateRole: 'boarding-point' }
  ],
  drivers: [{ name: 'راننده آزمون', username: `${prefix}-driver`, licensePlate: `${prefix}-plate`, capacity: 25 }],
  services: [
    { originKey: `${prefix}-city`, destinationKey: `${prefix}-university`, driverUsername: `${prefix}-driver`, licensePlate: `${prefix}-plate`, capacity: 25, departureTime: '07:25', priceToman: 15000 },
    { originKey: `${prefix}-university`, destinationKey: `${prefix}-city`, driverUsername: `${prefix}-driver`, licensePlate: `${prefix}-plate`, capacity: 25, departureTime: '16:25', priceToman: 17000 }
  ]
});

test('dry-run plans the entire catalog without creating accounts, stations or services', async () => {
  const original = await counts();
  const result = await importNajafabadCatalog(fixture.db, catalog);
  assert.deepEqual(result, { mode: 'dry-run', drivers: { create: 60, reuse: 0 }, stations: { create: 21, reuse: 0 }, services: { create: 120, reuse: 0 } });
  assert.deepEqual(await counts(), original);
});

test('explicit import creates 60 securely provisioned drivers and 120 services; rerunning preserves all rows', async () => {
  const initial = await counts();
  const [[wallet]] = await fixture.db.query('SELECT balance FROM users WHERE id = 1');
  const result = await importNajafabadCatalog(fixture.db, catalog, { apply: true, confirmDatabase: database, persistCredentials: async credentials => { privateCredentials = credentials; } });
  assert.equal(result.drivers.create, 60); assert.equal(result.services.create, 120);
  assert.deepEqual(await counts(), { drivers: initial.drivers + 60, stations: initial.stations + 21, schedules: initial.schedules + 120, tickets: initial.tickets });
  assert.equal(privateCredentials.length, 60);
  assert.equal(new Set(privateCredentials.map(row => row.password)).size, 60);
  const [[driver]] = await fixture.db.query('SELECT password FROM drivers WHERE username = ?', [privateCredentials[0].username]);
  assert.notEqual(driver.password, privateCredentials[0].password);
  assert.equal((await verifyPassword(privateCredentials[0].password, driver.password)).ok, true);
  const [[assignments]] = await fixture.db.query('SELECT COUNT(*) AS count FROM driver_station_assignments');
  assert.equal(assignments.count, 60);
  const beforeRepeat = await counts();
  const repeat = await importNajafabadCatalog(fixture.db, catalog, { apply: true, confirmDatabase: database, persistCredentials: async () => assert.fail('Existing driver passwords must not change') });
  assert.deepEqual(repeat, { mode: 'applied', drivers: { create: 0, reuse: 60 }, stations: { create: 0, reuse: 21 }, services: { create: 0, reuse: 120 } });
  assert.deepEqual(await counts(), beforeRepeat);
  const [[preserved]] = await fixture.db.query('SELECT balance FROM users WHERE id = 1');
  assert.equal(preserved.balance, wallet.balance);
});

test('all 20 cities expose three outbound and return buses and allow both tickets with correct wallet debit', async () => {
  await fixture.db.query('UPDATE users SET balance = 100000000 WHERE id = 2');
  const [stations] = await fixture.db.query('SELECT id, name FROM stations');
  const stationId = key => stations.find(row => row.name === catalog.stations.find(station => station.key === key).name).id;
  const university = stationId(catalog.universityKey);
  let spentRial = 0;
  for (const station of catalog.stations.filter(row => row.key !== catalog.universityKey)) {
    const purchased = [];
    for (const [origin, destination] of [[stationId(station.key), university], [university, stationId(station.key)]]) {
      const options = await request('/bus/schedule', { origin, destination }, fixture.tokens.other);
      assert.equal(options.status, 200);
      assert.equal(options.data.length, 3);
      assert.deepEqual(options.data.map(row => row.remainingSeats).sort((a, b) => a - b), [23, 32, 44]);
      const selected = options.data[0];
      const purchase = await request('/tickets/reserve', { schedule_id: selected.id, origin_station_id: origin, destination_station_id: destination, departure_time: selected.departureTime, seatCount: 1 }, fixture.tokens.other);
      assert.equal(purchase.status, 200, JSON.stringify(purchase.data));
      purchased.push(purchase.data.ticket);
      spentRial += selected.price * 10;
    }
    if (station.key === 'najafabad') {
      const credentials = privateCredentials.find(row => row.username === 'vira-naj-01-1');
      const login = await request('/driver/login', credentials);
      assert.equal(login.status, 200);
      for (const ticket of purchased) {
        const scan = await request('/driver/scan/qr', { driverId: login.data.id, qrCode: ticket.qrCode }, login.data.authToken);
        assert.equal(scan.status, 201, JSON.stringify(scan.data));
        assert.equal((await request('/driver/scan/qr', { driverId: login.data.id, qrCode: ticket.qrCode }, login.data.authToken)).status, 409);
      }
    }
  }
  const [[wallet]] = await fixture.db.query('SELECT balance FROM users WHERE id = 2');
  assert.equal(wallet.balance, 100000000 - spentRial);
  assert.equal((await counts()).tickets, 40);
});

test('a late schedule conflict rolls back new drivers, stations and services together', async () => {
  const manifest = smallCatalog('rollback');
  manifest.services.push(
    { ...manifest.services[0], driverUsername: 'driver-test', licensePlate: 'TEST-1', capacity: 6, departureTime: '08:30' },
    { ...manifest.services[1], driverUsername: 'driver-test', licensePlate: 'TEST-1', capacity: 6, departureTime: '17:10' }
  );
  const initial = await counts();
  await assert.rejects(importNajafabadCatalog(fixture.db, manifest, { apply: true, confirmDatabase: database, persistCredentials: async () => assert.fail('Conflicted import cannot publish credentials') }), /DRIVER_SCHEDULE_CONFLICT/);
  assert.deepEqual(await counts(), initial);
});

test('database confirmation and private credential storage failures prevent any import', async () => {
  const initial = await counts();
  await assert.rejects(importNajafabadCatalog(fixture.db, smallCatalog('wrongdb'), { apply: true, confirmDatabase: 'different_database' }), /DATABASE_CONFIRMATION_MISMATCH/);
  await assert.rejects(importNajafabadCatalog(fixture.db, smallCatalog('nooutput'), { apply: true, confirmDatabase: database }), /PRIVATE_CREDENTIALS_OUTPUT_REQUIRED/);
  await assert.rejects(importNajafabadCatalog(fixture.db, smallCatalog('diskerror'), { apply: true, confirmDatabase: database, persistCredentials: async () => { throw new Error('Private storage unavailable'); } }), /Private storage unavailable/);
  assert.deepEqual(await counts(), initial);
});

test('two concurrent imports serialize and do not create duplicate fleets or routes', async () => {
  const pool = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database, connectionLimit: 2, decimalNumbers: true, charset: 'utf8mb4' });
  let credentialWrites = 0;
  try {
    const manifest = smallCatalog('concurrent');
    const result = await Promise.all([1, 2].map(() => importNajafabadCatalog(pool, manifest, { apply: true, confirmDatabase: database, persistCredentials: async credentials => { credentialWrites += credentials.length; } })));
    assert.deepEqual(result.map(row => row.drivers.create).sort(), [0, 1]);
    assert.deepEqual(result.map(row => row.services.create).sort(), [0, 2]);
    assert.equal(credentialWrites, 1);
  } finally { await pool.end(); }
});

test('inactive drivers and changed vehicle capacities cannot be overwritten by another import', async () => {
  const username = catalog.drivers[0].username;
  try {
    await fixture.db.query("UPDATE drivers SET status = 'inactive' WHERE username = ?", [username]);
    await assert.rejects(importNajafabadCatalog(fixture.db, catalog, { apply: true, confirmDatabase: database }), /ACTIVE_DRIVER_REQUIRED/);
    await fixture.db.query("UPDATE drivers SET status = 'active', capacity = 24 WHERE username = ?", [username]);
    await assert.rejects(importNajafabadCatalog(fixture.db, catalog, { apply: true, confirmDatabase: database }), /DRIVER_VEHICLE_MISMATCH/);
  } finally { await fixture.db.query("UPDATE drivers SET status = 'active', capacity = 23 WHERE username = ?", [username]); }
});

test('deployment CLI saves usable credentials privately and never prints passwords or resets existing accounts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vira-catalog-cli-'));
  const manifestFile = path.join(directory, 'catalog.json');
  const privateRoot = path.join(os.homedir(), '.vira-private');
  const rootExisted = await stat(privateRoot).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
  let credentialsFile;
  try {
    await writeFile(manifestFile, JSON.stringify(smallCatalog('clitest')));
    const args = ['backend/scripts/import-najafabad-services.mjs', '--file', manifestFile, '--apply', '--confirm-database', database];
    const run = () => promisify(execFile)(process.execPath, args, { cwd: new URL('..', import.meta.url), env: process.env, timeout: 10000 });
    const first = await run();
    credentialsFile = first.stdout.split('\n').find(line => line.startsWith('Private driver credentials: ')).slice('Private driver credentials: '.length);
    assert.equal(path.dirname(path.dirname(credentialsFile)), privateRoot);
    assert.equal((await stat(credentialsFile)).mode & 0o777, 0o600);
    assert.equal((await stat(path.dirname(credentialsFile))).mode & 0o777, 0o700);
    const { credentials } = JSON.parse(await readFile(credentialsFile, 'utf8'));
    assert.equal(credentials.length, 1);
    assert.equal(first.stdout.includes(credentials[0].password), false);
    assert.equal(first.stderr.includes(credentials[0].password), false);
    assert.equal((await request('/driver/login', credentials[0])).status, 200);
    const second = await run();
    assert.equal(second.stdout.includes('Private driver credentials:'), false);
    assert.ok(second.stdout.includes('"create":0,"reuse":1'));
    assert.equal((await request('/driver/login', credentials[0])).status, 200);
  } finally {
    await rm(directory, { recursive: true, force: true });
    if (credentialsFile) await rm(path.dirname(credentialsFile), { recursive: true, force: true });
    if (!rootExisted) await rmdir(privateRoot).catch(error => { if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error; });
  }
});
