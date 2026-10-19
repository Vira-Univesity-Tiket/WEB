import { db } from './db.js';
import { parsePositiveInt } from './validation.js';

// A signed session does not grant continued access after suspension or a role change.
export const requireActiveAccount = async (req, res, next) => {
  const id = parsePositiveInt(req.auth?.sub);
  if (!id.ok) return res.status(403).json({ error: 'Forbidden' });
  const { role } = req.auth;
  let rows;
  if (role === 'admin' || role === 'analyst') {
    [rows] = await db.query('SELECT id FROM admin_accounts WHERE id = ? AND username = ? AND role = ? AND status = \'active\' LIMIT 1', [id.value, req.auth.username, role]);
  } else if (role === 'driver') {
    if (String(req.auth.driverId) !== String(id.value)) return res.status(403).json({ error: 'Forbidden' });
    [rows] = await db.query("SELECT id FROM drivers WHERE id = ? AND status = 'active' LIMIT 1", [id.value]);
  } else if (role === 'user') {
    [rows] = await db.query("SELECT id FROM users WHERE id = ? AND student_id = ? AND status = 'active' LIMIT 1", [id.value, req.auth.studentId]);
  }
  if (!rows?.length) return res.status(403).json({ error: 'حساب غیرفعال است یا دسترسی آن تغییر کرده است؛ دوباره وارد شوید.' });
  next();
};
