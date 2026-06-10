
import { db } from '../db.js';
import { auditLog } from '../security.js';
import { parseMoneyToman, rejectUnexpectedFields, validateNationalCode, validatePersianFullName, validateStudentId } from '../validation.js';

const mapAdminUser = (user) => ({
  id: user.id,
  name: user.name,
  studentId: user.student_id,
  nationalCode: user.national_code,
  balance: Number(user.balance || 0),
  province: user.province ?? '',
  city: user.city ?? '',
  language: user.language ?? 'fa',
  avatar: user.avatar ?? '',
  status: user.status || 'active',
  createdAt: user.created_at,
  updatedAt: user.updated_at
});

export const handleGetUsers = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM users ORDER BY id DESC'
    );
    res.json(rows.map(mapAdminUser));
  } catch (error) {
    console.error('-> Get Users Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleTopUpUser = async (req, res) => {
  const { student_id, studentId, amount } = req.body;
  const targetStudentId = student_id || studentId;
  const studentValidation = validateStudentId(targetStudentId);
  const amountValidation = parseMoneyToman(amount, {
    max: Number(process.env.MAX_ADMIN_TOPUP_TOMAN || 50000000)
  });

  if (!targetStudentId) {
    return res.status(400).json({ error: 'student_id required' });
  }
  if (!studentValidation.ok) return res.status(400).json({ error: studentValidation.error });
  if (!amountValidation.ok) {
    await auditLog(db, req, 'admin.invalid_topup_attempt', 'user', studentValidation.value || null, { amount: String(amount).slice(0, 100) });
    return res.status(400).json({ error: amountValidation.error });
  }
  const numericAmount = amountValidation.rial;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [users] = await connection.query(
      'SELECT id, balance FROM users WHERE student_id = ? LIMIT 1',
      [studentValidation.value]
    );

    if (!users || users.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];
    await connection.query(
      'UPDATE users SET balance = balance + ? WHERE id = ?',
      [numericAmount, user.id]
    );

    const trackingNumber = `ADM-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    await connection.query(
      'INSERT INTO transactions (user_id, amount, type, title, tracking_number) VALUES (?, ?, ?, ?, ?)',
      [user.id, numericAmount, 'deposit', 'شارژ کیف پول (ادمین)', trackingNumber]
    );

    await connection.commit();
    await auditLog(db, req, 'admin.user_topup', 'user', user.id, { amount: numericAmount, trackingNumber });

    const [updated] = await connection.query(
      'SELECT balance FROM users WHERE id = ? LIMIT 1',
      [user.id]
    );

    res.json({
      success: true,
      studentId: studentValidation.value,
      balance: Number(updated?.[0]?.balance || 0),
      trackingNumber
    });
  } catch (error) {
    await connection.rollback();
    console.error('-> Top Up Error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

export const handleUpdateUser = async (req, res) => {
  const userId = Number(req.params.userId);
  const unexpected = rejectUnexpectedFields(req.body, ['name', 'studentId', 'nationalCode']);
  if (!unexpected.ok) return res.status(400).json({ error: unexpected.error, fields: unexpected.fields });

  const nameValidation = validatePersianFullName(req.body.name, { min: 3, max: 100 });
  const studentValidation = validateStudentId(req.body.studentId);
  const nationalValidation = validateNationalCode(req.body.nationalCode);

  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid user ID' });
  if (!req.body.name || !req.body.studentId || !req.body.nationalCode) return res.status(400).json({ error: 'Fields required' });
  if (!nameValidation.ok) return res.status(400).json({ error: nameValidation.error });
  if (!studentValidation.ok) return res.status(400).json({ error: studentValidation.error });
  if (!nationalValidation.ok) return res.status(400).json({ error: nationalValidation.error });

  try {
    await db.query(
      'UPDATE users SET name=?, student_id=?, national_code=? WHERE id=?',
      [nameValidation.value, studentValidation.value, nationalValidation.value, userId]
    );
    await auditLog(db, req, 'admin.user_update', 'user', userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Update User Failed', error);
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Student ID or National Code already exists' });
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleDeleteUser = async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid user ID' });

  try {
    await db.query('DELETE FROM users WHERE id=?', [userId]);
    await auditLog(db, req, 'admin.user_delete', 'user', userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete User Failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleToggleUserStatus = async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Invalid user ID' });

  try {
    // Toggle active <-> suspended
    await db.query(
      "UPDATE users SET status = IF(status='active', 'suspended', 'active') WHERE id=?",
      [userId]
    );
    // Get new status
    const [rows] = await db.query('SELECT status FROM users WHERE id=?', [userId]);
    await auditLog(db, req, 'admin.user_toggle_status', 'user', userId, { newStatus: rows[0]?.status });
    res.json({ success: true, newStatus: rows[0]?.status });
  } catch (error) {
    console.error('Toggle User Status Failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};
