import { logError } from '../logging.js';

import { db } from '../db.js';
import { auditLog, issueAuthToken, verifyPassword } from '../security.js';
import { rejectUnexpectedFields, sanitizeText, validateNationalCode, validatePersianFullName, validateStudentId } from '../validation.js';
import { parseUpload } from '../services/uploadValidation.js';

const formatBalance = (balance) => {
  const amountRial = Number(balance || 0);
  const amountToman = Math.round(amountRial / 10);
  return `${amountToman.toLocaleString()} تومان`;
};

const mapUser = (user) => ({
  name: user.name,
  studentId: user.student_id,
  nationalCode: user.national_code,
  province: user.province ?? '',
  city: user.city ?? '',
  balance: formatBalance(user.balance),
  language: ['fa', 'ar', 'en'].includes(user.language) ? user.language : 'fa',
  avatar: user.avatar ?? ''
});

export const handleCurrentUser = async (req, res) => {
  const [rows] = await db.query('SELECT * FROM users WHERE id = ? AND student_id = ? LIMIT 1', [req.auth.sub, req.auth.studentId]);
  if (!rows.length || rows[0].status === 'suspended') return res.status(401).json({ error: 'Authentication required' });
  res.json(mapUser(rows[0]));
};

export const handleLogin = async (req, res) => {
  const studentValidation = validateStudentId(req.body.student_id);
  const nationalValidation = validateNationalCode(req.body.national_code);

  if (!req.body.student_id || !req.body.national_code) {
    return res.status(400).json({ error: "Credentials required" });
  }
  if (!studentValidation.ok) return res.status(400).json({ error: studentValidation.error });
  if (!nationalValidation.ok) return res.status(400).json({ error: nationalValidation.error });

  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE student_id = ? AND national_code = ? LIMIT 1',
      [studentValidation.value, nationalValidation.value]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (rows[0].status === 'suspended') {
      return res.status(403).json({ error: 'User suspended' });
    }

    const token = issueAuthToken({
      sub: rows[0].id.toString(),
      role: 'user',
      studentId: rows[0].student_id
    });

    res.json({ ...mapUser(rows[0]), authToken: token, token });
  } catch (error) {
    logError("-> Login Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

export const handleRegister = async (req, res) => {
  const unexpected = rejectUnexpectedFields(req.body, ['name', 'student_id', 'national_code']);
  if (!unexpected.ok) return res.status(400).json({ error: unexpected.error, fields: unexpected.fields });

  const nameValidation = validatePersianFullName(req.body.name, { min: 3, max: 100 });
  const studentValidation = validateStudentId(req.body.student_id);
  const nationalValidation = validateNationalCode(req.body.national_code);

  if (!req.body.name || !req.body.student_id || !req.body.national_code) {
    return res.status(400).json({ error: "Fields required" });
  }
  if (!nameValidation.ok) return res.status(400).json({ error: nameValidation.error });
  if (!studentValidation.ok) return res.status(400).json({ error: studentValidation.error });
  if (!nationalValidation.ok) return res.status(400).json({ error: nationalValidation.error });

  try {
    await db.query(
      'INSERT INTO users (name, student_id, national_code) VALUES (?, ?, ?)',
      [nameValidation.value, studentValidation.value, nationalValidation.value]
    );

    const [rows] = await db.query(
      'SELECT * FROM users WHERE student_id = ? LIMIT 1',
      [studentValidation.value]
    );

    if (!rows || rows.length === 0) {
      return res.status(500).json({ error: "User created but not found" });
    }

    const token = issueAuthToken({
      sub: rows[0].id.toString(),
      role: 'user',
      studentId: rows[0].student_id
    });

    await auditLog(db, req, 'user.register', 'user', rows[0].id, { studentId: studentValidation.value });
    res.json({ ...mapUser(rows[0]), authToken: token, token });
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: "Student ID or National Code already exists" });
    }
    logError("-> Register Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

export const handleUpdateProfile = async (req, res) => {
  const { province, city, avatar, language } = req.body;
  const student_id = req.auth?.studentId || req.body.student_id;

  if (!student_id) return res.status(400).json({ error: "student_id required" });
  if (req.auth?.role === 'user' && req.auth.studentId !== student_id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const updates = [];
  const values = [];

  if (language !== undefined && !['fa', 'ar', 'en'].includes(language)) return res.status(400).json({ error: 'زبان انتخاب‌شده معتبر نیست.' });

  if (province !== undefined) { updates.push('province = ?'); values.push(sanitizeText(province, 50)); }
  if (city !== undefined) { updates.push('city = ?'); values.push(sanitizeText(city, 50)); }
  if (avatar !== undefined) {
    if (avatar !== '' && !parseUpload(avatar, { maxBytes: 512 * 1024, allowedMime: ['image/png', 'image/jpeg', 'image/webp'] }).ok) {
      return res.status(400).json({ error: 'تصویر پروفایل باید PNG، JPEG یا WebP و حداکثر ۵۱۲ کیلوبایت باشد.' });
    }
    updates.push('avatar = ?'); values.push(avatar);
  }
  if (language !== undefined) { updates.push('language = ?'); values.push(language); }

  if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });

  values.push(student_id);

  try {
    const [result] = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE student_id = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await auditLog(db, req, 'user.update_profile', 'user', req.auth?.sub, { studentId: student_id });
    res.json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    logError("-> Update Profile Error:", error);
    res.status(500).json({ error: "Could not update user" });
  }
};

export const handleAdminLogin = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const normalizedUsername = sanitizeText(username, 50);
    const normalizedPassword = String(password);
    const [accounts] = await db.query(
      `SELECT id, username, password_hash, role, status
       FROM admin_accounts
       WHERE username = ?
       LIMIT 1`,
      [normalizedUsername]
    );

    if (accounts && accounts.length > 0) {
      const account = accounts[0];
      const verification = await verifyPassword(normalizedPassword, account.password_hash);
      if (!verification.ok || account.status !== 'active') {
        req.auth = { role: account.role, sub: account.username };
        await auditLog(db, req, `${account.role}.login_failed`, 'admin_account', account.id, { username: normalizedUsername });
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      await db.query('UPDATE admin_accounts SET last_login_at = NOW() WHERE id = ?', [account.id]);
      const token = issueAuthToken({
        sub: String(account.id),
        role: account.role,
        username: account.username
      });
      req.auth = { role: account.role, sub: account.username };
      await auditLog(db, req, `${account.role}.login`, 'admin_account', account.id, { username: account.username });
      return res.json({ success: true, role: account.role, username: account.username, authToken: token, token });
    }
  } catch (error) {
    logError('Admin account login check failed:', error);
  }
  req.auth = { role: 'admin', sub: String(username || '') };
  await auditLog(db, req, 'admin.login_failed', 'admin_account', username || null, { username: String(username || '') });
  return res.status(401).json({ error: 'Invalid credentials' });
};
