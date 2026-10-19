import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function createLocalDatabase() {
  const url = new URL(process.env.VIRA_TEST_DB_URL || 'mysql://root@127.0.0.1:33317');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Tests require an isolated loopback MySQL server.');
  const database = `vira_test_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
  Object.assign(process.env, {
    NODE_ENV: 'test', BACKEND_NODE_ENV: 'test', VIRA_TEST_DB_URL: url.href,
    DB_HOST: url.hostname, DB_PORT: url.port || '33317', DB_USER: decodeURIComponent(url.username),
    DB_PASSWORD: decodeURIComponent(url.password), DB_NAME: database,
    DB_CONN_LIMIT: process.env.VIRA_TEST_POOL_SIZE || '4',
    JWT_SECRET: crypto.randomBytes(32).toString('hex'), SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
    ADMIN_USERNAME: 'test-admin', ADMIN_PASSWORD: 'local-admin-test-password', SEED_DEMO_DATA: 'false',
    CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:3017', HEALTH_HTML_ENABLED: 'false',
    TICKET_STORAGE_ROOT: await mkdtemp(path.join(os.tmpdir(), 'vira-tickets-'))
  });
  const root = await mysql.createConnection({ host: url.hostname, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await root.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const { db, initDB } = await import('../backend/db.js');
  await initDB();
  const { hashPassword, issueAuthToken } = await import('../backend/security.js');
  const password = await hashPassword('local-driver-test-password');
  await db.query("INSERT INTO admin_accounts (id, username, password_hash, role, status) VALUES (99, 'test-analyst', ?, 'analyst', 'active')", [password]);
  await db.query("INSERT INTO stations (name, lat, lng) VALUES ('ایستگاه آزمایشی یک', 35.7, 51.3), ('ایستگاه آزمایشی دو', 35.8, 51.4), ('ایستگاه آزمایشی سه', 35.9, 51.5)");
  await db.query("INSERT INTO drivers (name, username, password, license_plate, status, capacity) VALUES ('راننده آزمایش', 'driver-test', ?, 'TEST-1', 'active', 6), ('راننده دوم', 'driver-other', ?, 'TEST-2', 'active', 2)", [password, password]);
  await db.query("INSERT INTO schedules (driver_id, origin_station_id, destination_station_id, departure_time, price, status) VALUES (1, 1, 2, '08:30:00', 50000, 'active'), (2, 2, 3, '11:00:00', 50000, 'active')");
  await db.query("INSERT INTO users (name, student_id, national_code, balance) VALUES ('مسافر آزمایش یک', '900000001', '1234567891', 1000000), ('مسافر آزمایش دو', '900000002', '0084575948', 1000000), ('مسافر آزمایش سه', '900000003', '0013549386', 1000000)");
  const tokens = {
    user: issueAuthToken({ sub: '1', studentId: '900000001', role: 'user' }),
    other: issueAuthToken({ sub: '2', studentId: '900000002', role: 'user' }),
    third: issueAuthToken({ sub: '3', studentId: '900000003', role: 'user' }),
    driver: issueAuthToken({ sub: '1', driverId: '1', role: 'driver' }),
    otherDriver: issueAuthToken({ sub: '2', driverId: '2', role: 'driver' }),
    admin: issueAuthToken({ sub: '1', username: 'test-admin', role: 'admin' }),
    analyst: issueAuthToken({ sub: '99', username: 'test-analyst', role: 'analyst' })
  };
  return { db, initDB, tokens, cleanup: async () => {
    await db.end();
    await root.query(`DROP DATABASE \`${database}\``);
    await root.end();
    await rm(process.env.TICKET_STORAGE_ROOT, { recursive: true, force: true });
  } };
}
