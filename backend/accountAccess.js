import { db } from './db.js';
import { parsePositiveInt } from './validation.js';
import { optionalAuth } from './security.js';

// A signed session does not grant continued access after suspension or a role change.
const accountAccessStatus = async (req) => {
  const id = parsePositiveInt(req.auth?.sub);
  if (!id.ok) return 403;
  const [revoked] = await db.query('SELECT jti FROM revoked_auth_sessions WHERE jti = ? AND expires_at > UNIX_TIMESTAMP() LIMIT 1', [req.auth.jti || '']);
  if (revoked.length) return 401;
  const { role } = req.auth;
  let rows;
  if (role === 'admin' || role === 'analyst') {
    [rows] = await db.query('SELECT id FROM admin_accounts WHERE id = ? AND username = ? AND role = ? AND status = \'active\' AND auth_version = ? LIMIT 1', [id.value, req.auth.username, role, req.auth.authVersion ?? 0]);
  } else if (role === 'driver') {
    if (String(req.auth.driverId) !== String(id.value)) return 403;
    [rows] = await db.query("SELECT id FROM drivers WHERE id = ? AND status = 'active' AND auth_version = ? LIMIT 1", [id.value, req.auth.authVersion ?? 0]);
  } else if (role === 'user') {
    [rows] = await db.query("SELECT id FROM users WHERE id = ? AND student_id = ? AND status = 'active' LIMIT 1", [id.value, req.auth.studentId]);
  }
  return rows?.length ? 200 : 403;
};

export const requireActiveAccount = async (req, res, next) => {
  const status = await accountAccessStatus(req);
  if (status !== 200) return res.status(status).json({ error: 'نشست پایان یافته یا دسترسی حساب تغییر کرده است؛ دوباره وارد شوید.', code: 'AUTH_REQUIRED' });
  return next();
};

export const optionalActiveAccount = async (req, res, next) => {
  optionalAuth(req, res, () => {});
  if (!req.auth) return next();
  // Invalidated sessions receive the public audience rather than token-derived roles.
  if (await accountAccessStatus(req) !== 200) req.auth = null;
  return next();
};

export const handleLogout = async (req, res) => {
  if (!/^[a-f0-9]{32}$/.test(req.auth.jti || '')) return res.status(400).json({ error: 'نشست معتبر نیست.' });
  await db.query('INSERT IGNORE INTO revoked_auth_sessions (jti, expires_at) VALUES (?, ?)', [req.auth.jti, req.auth.exp]);
  await db.query('DELETE FROM revoked_auth_sessions WHERE expires_at <= UNIX_TIMESTAMP() LIMIT 1000');
  return res.json({ success: true });
};
