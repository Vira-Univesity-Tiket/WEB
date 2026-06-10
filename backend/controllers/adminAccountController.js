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
    console.error('List analysts failed:', error);
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
    console.error('Create analyst failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleUpdateAnalyst = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'INVALID_ID' });
  const unexpected = rejectUnexpectedFields(req.body, ['username', 'role']);
  if (!unexpected.ok) return res.status(400).json({ error: unexpected.error, fields: unexpected.fields });
  const username = sanitizeText(req.body.username, 50);
  const role = req.body.role === 'admin' ? 'admin' : 'analyst';
  if (!username) return res.status(400).json({ error: 'FIELDS_REQUIRED' });

  try {
    await db.query(
      `UPDATE admin_accounts SET username = ?, role = ?, updated_by = ? WHERE id = ?`,
      [username, role, req.auth?.username || req.auth?.sub || 'admin', id]
    );
    await auditLog(db, req, 'admin.account_update', 'admin_account', id, { username, role });
    res.json({ success: true });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'DUPLICATE_DRIVER' });
    console.error('Update analyst failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleToggleAnalystStatus = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'INVALID_ID' });
  try {
    await db.query(`UPDATE admin_accounts SET status = IF(status='active','inactive','active'), updated_by = ? WHERE id = ?`, [req.auth?.username || req.auth?.sub || 'admin', id]);
    const [rows] = await db.query('SELECT status FROM admin_accounts WHERE id = ? LIMIT 1', [id]);
    await auditLog(db, req, 'admin.account_toggle_status', 'admin_account', id, { newStatus: rows[0]?.status });
    res.json({ success: true, newStatus: rows[0]?.status });
  } catch (error) {
    console.error('Toggle analyst status failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleResetAnalystPassword = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'INVALID_ID' });
  const unexpected = rejectUnexpectedFields(req.body, ['password']);
  if (!unexpected.ok) return res.status(400).json({ error: unexpected.error, fields: unexpected.fields });
  const password = String(req.body.password || '');
  if (password.length < 6) return res.status(400).json({ error: 'FIELDS_REQUIRED' });
  try {
    const hashed = await hashPassword(password);
    await db.query(`UPDATE admin_accounts SET password_hash = ?, updated_by = ? WHERE id = ?`, [hashed, req.auth?.username || req.auth?.sub || 'admin', id]);
    await auditLog(db, req, 'admin.account_reset_password', 'admin_account', id);
    res.json({ success: true });
  } catch (error) {
    console.error('Reset analyst password failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleAnalystLoginLogs = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'INVALID_ID' });
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
    console.error('Get analyst login logs failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

