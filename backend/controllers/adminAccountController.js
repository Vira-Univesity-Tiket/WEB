import { logError } from '../logging.js';
import { db } from '../db.js';
import { auditLog, hashPassword } from '../security.js';
import { rejectUnexpectedFields, sanitizeText } from '../validation.js';

const mapAccount = (row) => ({
  id: row.id,
  username: row.username,
  role: row.role,
  status: row.status,
  createdBy: row.created_by || '',
  updatedBy: row.updated_by || '',
  lastLoginAt: row.last_login_at || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const handleListAnalysts = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, username, role, status, created_by, updated_by, last_login_at, created_at, updated_at
       FROM admin_accounts
       WHERE role = 'analyst'
       ORDER BY id DESC`
    );
    res.json(rows.map(mapAccount));
  } catch (error) {
    logError('List analysts failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleCreateAnalyst = async (req, res) => {
  const unexpected = rejectUnexpectedFields(req.body, ['username', 'password', 'role']);
  if (!unexpected.ok) return res.status(400).json({ error: unexpected.error, fields: unexpected.fields });

  const username = sanitizeText(req.body.username, 50);
  const password = String(req.body.password || '');
  const role = req.body.role === 'admin' ? 'admin' : 'analyst';
  if (!username || password.length < 6) return res.status(400).json({ error: 'FIELDS_REQUIRED' });

  try {
    const hashed = await hashPassword(password);
    const [result] = await db.query(
      `INSERT INTO admin_accounts (username, password_hash, role, status, created_by, updated_by)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      [username, hashed, role, req.auth?.username || req.auth?.sub || 'admin', req.auth?.username || req.auth?.sub || 'admin']
    );
    await auditLog(db, req, 'admin.account_create', 'admin_account', result.insertId, { username, role });
    const [rows] = await db.query(
      `SELECT id, username, role, status, created_by, updated_by, last_login_at, created_at, updated_at
       FROM admin_accounts WHERE id = ? LIMIT 1`,
      [result.insertId]
    );
    res.status(201).json(mapAccount(rows[0]));
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'DUPLICATE_DRIVER' });
    logError('Create analyst failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleUpdateAnalyst = async (req, res) => {
  const id = Number(req.params.id);
  if ((!Number.isSafeInteger(id) || id <= 0)) return res.status(400).json({ error: 'INVALID_ID' });
  const unexpected = rejectUnexpectedFields(req.body, ['username', 'role']);
  if (!unexpected.ok) return res.status(400).json({ error: unexpected.error, fields: unexpected.fields });
  const username = sanitizeText(req.body.username, 50);
  const role = req.body.role === 'admin' ? 'admin' : 'analyst';
  if (!username) return res.status(400).json({ error: 'FIELDS_REQUIRED' });

  return mutateAccount(req, res, id, async (connection, target, accounts) => {
    preserveActiveAdmin(accounts, target, role, target.status);
    const changed = target.username !== username || target.role !== role;
    await connection.query('UPDATE admin_accounts SET username = ?, role = ?, auth_version = auth_version + ?, updated_by = ? WHERE id = ?', [username, role, changed ? 1 : 0, req.auth.username, id]);
    await auditLog(connection, req, 'admin.account_update', 'admin_account', id, { username, role });
    return { success: true };
  });
};

export const handleToggleAnalystStatus = async (req, res) => {
  const id = Number(req.params.id);
  if ((!Number.isSafeInteger(id) || id <= 0)) return res.status(400).json({ error: 'INVALID_ID' });
  return mutateAccount(req, res, id, async (connection, target, accounts) => {
    const newStatus = target.status === 'active' ? 'inactive' : 'active';
    preserveActiveAdmin(accounts, target, target.role, newStatus);
    await connection.query('UPDATE admin_accounts SET status = ?, auth_version = auth_version + 1, updated_by = ? WHERE id = ?', [newStatus, req.auth.username, id]);
    await auditLog(connection, req, 'admin.account_toggle_status', 'admin_account', id, { newStatus });
    return { success: true, newStatus };
  });
};

export const handleResetAnalystPassword = async (req, res) => {
  const id = Number(req.params.id);
  if ((!Number.isSafeInteger(id) || id <= 0)) return res.status(400).json({ error: 'INVALID_ID' });
  const unexpected = rejectUnexpectedFields(req.body, ['password']);
  if (!unexpected.ok) return res.status(400).json({ error: unexpected.error, fields: unexpected.fields });
  const password = String(req.body.password || '');
  if (password.length < 6) return res.status(400).json({ error: 'FIELDS_REQUIRED' });
  try {
    const hashed = await hashPassword(password);
    return await mutateAccount(req, res, id, async (connection) => {
      await connection.query('UPDATE admin_accounts SET password_hash = ?, auth_version = auth_version + 1, updated_by = ? WHERE id = ?', [hashed, req.auth.username, id]);
      await auditLog(connection, req, 'admin.account_reset_password', 'admin_account', id);
      return { success: true };
    });
  } catch (error) {
    logError('Reset analyst password failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const preserveActiveAdmin = (accounts, target, role, status) => {
  if (target.role === 'admin' && target.status === 'active' && (role !== 'admin' || status !== 'active') && accounts.filter(account => account.role === 'admin' && account.status === 'active').length <= 1) {
    throw Object.assign(new Error('حداقل یک مدیر فعال باید باقی بماند.'), { httpStatus: 409, code: 'LAST_ACTIVE_ADMIN' });
  }
};

const mutateAccount = async (req, res, id, mutation) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    // One stable lock order serializes role/status changes, including concurrent
    // transitions against the last two administrators. No account data is deleted.
    const [accounts] = await connection.query('SELECT id, username, role, status, auth_version FROM admin_accounts ORDER BY id FOR UPDATE');
    const actor = accounts.find(account => String(account.id) === req.auth.sub);
    if (!actor || actor.role !== 'admin' || actor.status !== 'active' || actor.username !== req.auth.username || actor.auth_version !== (req.auth.authVersion ?? 0)) {
      throw Object.assign(new Error('دسترسی حساب تغییر کرده است؛ دوباره وارد شوید.'), { httpStatus: 403 });
    }
    const target = accounts.find(account => account.id === id);
    if (!target) throw Object.assign(new Error('User not found'), { httpStatus: 404 });
    const result = await mutation(connection, target, accounts);
    await connection.commit();
    return res.json(result);
  } catch (error) {
    await connection.rollback();
    if (error.httpStatus) return res.status(error.httpStatus).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'DUPLICATE_DRIVER' });
    logError('Administrative account mutation failed:', error);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

export const handleAnalystLoginLogs = async (req, res) => {
  const id = Number(req.params.id);
  if ((!Number.isSafeInteger(id) || id <= 0)) return res.status(400).json({ error: 'INVALID_ID' });
  try {
    const [accounts] = await db.query('SELECT username FROM admin_accounts WHERE id = ? LIMIT 1', [id]);
    if (!accounts || accounts.length === 0) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    const username = accounts[0].username;
    const [rows] = await db.query(
      `SELECT id, action, ip_address AS ipAddress, user_agent AS userAgent, created_at AS createdAt
       FROM audit_logs
       WHERE actor_id = ? AND action IN ('analyst.login','analyst.login_failed','admin.login','admin.login_failed')
       ORDER BY created_at DESC
       LIMIT 200`,
      [username]
    );
    res.json(rows);
  } catch (error) {
    logError('Get analyst login logs failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

