import { db } from '../db.js';
import { auditLog } from '../security.js';
import {
  parsePositiveInt,
  rejectUnexpectedFields,
  sanitizePlainText,
  validateIdeaDescription,
  validateIdeaTitle
} from '../validation.js';

const IDEA_STATUSES = ['submitted', 'reviewing', 'approved', 'rejected', 'done'];
const IDEA_STATUS_FA = {
  submitted: 'ثبت شده',
  reviewing: 'درحال بررسی',
  approved: 'تایید شده',
  rejected: 'رد شده',
  done: 'انجام شد'
};

const mapIdea = (row) => ({
  id: String(row.id),
  title: row.title,
  description: row.description,
  category: row.category || '',
  status: row.status,
  adminResponse: row.admin_response || '',
  adminNote: row.admin_note || '',
  reviewedBy: row.reviewed_by || '',
  reviewedAt: row.reviewed_at || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapAdminIdea = (row) => ({
  ...mapIdea(row),
  user: {
    id: String(row.user_id),
    name: row.user_name,
    studentId: row.user_student_id,
    nationalCode: row.user_national_code
  }
});

const insertStatusHistory = async (conn, { ideaId, fromStatus, toStatus, actorRole, actorId, note }) => {
  await conn.query(
    `INSERT INTO user_idea_status_history (idea_id, from_status, to_status, actor_role, actor_id, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [ideaId, fromStatus || null, toStatus, actorRole, actorId ? String(actorId) : null, note || null]
  );
};

const createUserNotification = async (conn, { userId, title, message, type = 'info', entityType = null, entityId = null }) => {
  await conn.query(
    `INSERT INTO user_notifications (user_id, title, message, type, entity_type, entity_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, title, message, type, entityType, entityId]
  );
};

// --------------------
// User endpoints
// --------------------
export const handleCreateIdea = async (req, res) => {
  const unexpected = rejectUnexpectedFields(req.body, ['title', 'description', 'category']);
  if (!unexpected.ok) return res.status(400).json({ error: unexpected.error, fields: unexpected.fields });

  const titleValidation = validateIdeaTitle(req.body.title);
  const descriptionValidation = validateIdeaDescription(req.body.description);
  const category = sanitizePlainText(req.body.category, 60);

  if (!titleValidation.ok) return res.status(400).json({ error: titleValidation.error });
  if (!descriptionValidation.ok) return res.status(400).json({ error: descriptionValidation.error });

  const userId = Number(req.auth?.sub);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'INVALID_USER_ID' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO user_ideas (user_id, title, description, category, status)
       VALUES (?, ?, ?, ?, 'submitted')`,
      [userId, titleValidation.value, descriptionValidation.value, category || null]
    );
    const ideaId = result.insertId;
    await insertStatusHistory(conn, { ideaId, fromStatus: null, toStatus: 'submitted', actorRole: 'user', actorId: userId });
    await conn.commit();

    await auditLog(db, req, 'idea.create', 'user_idea', ideaId, { title: titleValidation.value });
    const [rows] = await db.query('SELECT * FROM user_ideas WHERE id = ? LIMIT 1', [ideaId]);
    return res.status(201).json(mapIdea(rows[0]));
  } catch (error) {
    await conn.rollback();
    console.error('Create Idea Error:', error);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

export const handleListMyIdeas = async (req, res) => {
  const userId = Number(req.auth?.sub);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'INVALID_USER_ID' });

  const pageValidation = parsePositiveInt(req.query.page, { min: 1, max: 1_000_000, error: 'INVALID_NUMBER' });
  const pageSizeValidation = parsePositiveInt(req.query.pageSize, { min: 1, max: 50, error: 'INVALID_NUMBER' });
  const page = pageValidation.ok ? pageValidation.value : 1;
  const pageSize = pageSizeValidation.ok ? pageSizeValidation.value : 20;
  const offset = (page - 1) * pageSize;

  try {
    const [rows] = await db.query(
      `SELECT * FROM user_ideas
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, pageSize, offset]
    );
    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total FROM user_ideas WHERE user_id = ? AND deleted_at IS NULL`,
      [userId]
    );
    res.json({ items: rows.map(mapIdea), page, pageSize, total: Number(countRows?.[0]?.total || 0) });
  } catch (error) {
    console.error('List Ideas Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleUpdateMyIdea = async (req, res) => {
  const ideaId = Number(req.params.id);
  if (!Number.isFinite(ideaId)) return res.status(400).json({ error: 'Invalid ID' });

  const unexpected = rejectUnexpectedFields(req.body, ['title', 'description', 'category']);
  if (!unexpected.ok) return res.status(400).json({ error: unexpected.error, fields: unexpected.fields });

  const titleValidation = validateIdeaTitle(req.body.title);
  const descriptionValidation = validateIdeaDescription(req.body.description);
  const category = sanitizePlainText(req.body.category, 60);
  if (!titleValidation.ok) return res.status(400).json({ error: titleValidation.error });
  if (!descriptionValidation.ok) return res.status(400).json({ error: descriptionValidation.error });

  const userId = Number(req.auth?.sub);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'INVALID_USER_ID' });

  try {
    const [rows] = await db.query(
      `SELECT id, status FROM user_ideas WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1`,
      [ideaId, userId]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'IDEA_NOT_FOUND' });
    if (rows[0].status !== 'submitted') return res.status(409).json({ error: 'IDEA_NOT_EDITABLE' });

    await db.query(
      `UPDATE user_ideas SET title = ?, description = ?, category = ? WHERE id = ?`,
      [titleValidation.value, descriptionValidation.value, category || null, ideaId]
    );
    await auditLog(db, req, 'idea.update', 'user_idea', ideaId);
    const [updated] = await db.query('SELECT * FROM user_ideas WHERE id = ? LIMIT 1', [ideaId]);
    res.json(mapIdea(updated[0]));
  } catch (error) {
    console.error('Update Idea Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleDeleteMyIdea = async (req, res) => {
  const ideaId = Number(req.params.id);
  if (!Number.isFinite(ideaId)) return res.status(400).json({ error: 'Invalid ID' });

  const userId = Number(req.auth?.sub);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'INVALID_USER_ID' });

  try {
    const [rows] = await db.query(
      `SELECT id, status FROM user_ideas WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1`,
      [ideaId, userId]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'IDEA_NOT_FOUND' });
    if (rows[0].status !== 'submitted') return res.status(409).json({ error: 'IDEA_NOT_DELETABLE' });

    await db.query(`UPDATE user_ideas SET deleted_at = NOW() WHERE id = ?`, [ideaId]);
    await auditLog(db, req, 'idea.delete', 'user_idea', ideaId);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete Idea Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// --------------------
// Admin endpoints
// --------------------
export const handleAdminListIdeas = async (req, res) => {
  const pageValidation = parsePositiveInt(req.query.page, { min: 1, max: 1_000_000, error: 'INVALID_NUMBER' });
  const pageSizeValidation = parsePositiveInt(req.query.pageSize, { min: 1, max: 100, error: 'INVALID_NUMBER' });
  const page = pageValidation.ok ? pageValidation.value : 1;
  const pageSize = pageSizeValidation.ok ? pageSizeValidation.value : 20;
  const offset = (page - 1) * pageSize;

  const status = String(req.query.status || '').trim();
  const q = sanitizePlainText(req.query.q, 120);
  const user = sanitizePlainText(req.query.user, 50); // student_id or name substring
  const fromDate = String(req.query.from || '').trim();
  const toDate = String(req.query.to || '').trim();

  const where = ["i.deleted_at IS NULL"];
  const params = [];

  if (status) {
    if (!IDEA_STATUSES.includes(status)) return res.status(400).json({ error: 'INVALID_IDEA_STATUS' });
    where.push('i.status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(i.title LIKE ? OR i.description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (user) {
    where.push('(u.student_id LIKE ? OR u.name LIKE ?)');
    params.push(`%${user}%`, `%${user}%`);
  }
  if (fromDate) {
    where.push('i.created_at >= ?');
    params.push(fromDate);
  }
  if (toDate) {
    where.push('i.created_at <= ?');
    params.push(toDate);
  }

  try {
    const [rows] = await db.query(
      `SELECT i.*, u.name AS user_name, u.student_id AS user_student_id, u.national_code AS user_national_code
       FROM user_ideas i
       JOIN users u ON u.id = i.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY i.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM user_ideas i
       JOIN users u ON u.id = i.user_id
       WHERE ${where.join(' AND ')}`,
      params
    );
    res.json({ items: rows.map(mapAdminIdea), page, pageSize, total: Number(countRows?.[0]?.total || 0) });
  } catch (error) {
    console.error('Admin List Ideas Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleAdminGetIdeaDetail = async (req, res) => {
  const ideaId = Number(req.params.id);
  if (!Number.isFinite(ideaId)) return res.status(400).json({ error: 'Invalid ID' });

  try {
    const [rows] = await db.query(
      `SELECT i.*, u.name AS user_name, u.student_id AS user_student_id, u.national_code AS user_national_code
       FROM user_ideas i
       JOIN users u ON u.id = i.user_id
       WHERE i.id = ? LIMIT 1`,
      [ideaId]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'IDEA_NOT_FOUND' });

    const [history] = await db.query(
      `SELECT id, from_status AS fromStatus, to_status AS toStatus, actor_role AS actorRole, actor_id AS actorId, note, created_at AS createdAt
       FROM user_idea_status_history
       WHERE idea_id = ?
       ORDER BY created_at ASC`,
      [ideaId]
    );
    res.json({ idea: mapAdminIdea(rows[0]), history });
  } catch (error) {
    console.error('Admin Get Idea Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleAdminUpdateIdea = async (req, res) => {
  const ideaId = Number(req.params.id);
  if (!Number.isFinite(ideaId)) return res.status(400).json({ error: 'Invalid ID' });

  const unexpected = rejectUnexpectedFields(req.body, ['status', 'adminResponse', 'adminNote']);
  if (!unexpected.ok) return res.status(400).json({ error: unexpected.error, fields: unexpected.fields });

  const nextStatus = String(req.body.status || '').trim();
  if (!nextStatus) return res.status(400).json({ error: 'REQUIRED_STATUS' });
  if (!IDEA_STATUSES.includes(nextStatus)) return res.status(400).json({ error: 'INVALID_IDEA_STATUS' });

  const adminResponse = sanitizePlainText(req.body.adminResponse, 5000);
  const adminNote = sanitizePlainText(req.body.adminNote, 255);
  const adminId = req.auth?.username || req.auth?.sub || 'admin';

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `SELECT id, user_id, status, admin_response
       FROM user_ideas
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [ideaId]
    );
    if (!rows || rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'IDEA_NOT_FOUND' });
    }

    const idea = rows[0];
    const fromStatus = idea.status;

    await conn.query(
      `UPDATE user_ideas
       SET status = ?, admin_response = ?, admin_note = ?,
           reviewed_by = COALESCE(reviewed_by, ?),
           reviewed_at = COALESCE(reviewed_at, NOW())
       WHERE id = ?`,
      [nextStatus, adminResponse || null, adminNote || null, String(adminId), ideaId]
    );

    if (fromStatus !== nextStatus) {
      await insertStatusHistory(conn, {
        ideaId,
        fromStatus,
        toStatus: nextStatus,
        actorRole: 'admin',
        actorId: adminId,
        note: adminNote || null
      });
    }

    if (adminResponse && adminResponse !== (idea.admin_response || '')) {
      await createUserNotification(conn, {
        userId: idea.user_id,
        title: 'پاسخ ادمین',
        message: 'برای ایده شما پاسخ ثبت شد.',
        type: 'info',
        entityType: 'idea',
        entityId: String(ideaId)
      });
    }

    if (fromStatus !== nextStatus) {
      await createUserNotification(conn, {
        userId: idea.user_id,
        title: 'به‌روزرسانی وضعیت ایده',
        message: `وضعیت ایده شما به «${IDEA_STATUS_FA[nextStatus] || nextStatus}» تغییر کرد.`,
        type: nextStatus === 'approved' || nextStatus === 'done' ? 'success' : nextStatus === 'rejected' ? 'warning' : 'info',
        entityType: 'idea',
        entityId: String(ideaId)
      });
    }

    await conn.commit();
    await auditLog(db, req, 'admin.idea_update', 'user_idea', ideaId, { fromStatus, toStatus: nextStatus });

    const [updated] = await db.query(
      `SELECT i.*, u.name AS user_name, u.student_id AS user_student_id, u.national_code AS user_national_code
       FROM user_ideas i
       JOIN users u ON u.id = i.user_id
       WHERE i.id = ? LIMIT 1`,
      [ideaId]
    );
    res.json(mapAdminIdea(updated[0]));
  } catch (error) {
    await conn.rollback();
    console.error('Admin Update Idea Error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
};

// --------------------
// User notification inbox
// --------------------
export const handleGetMyNotifications = async (req, res) => {
  const userId = Number(req.auth?.sub);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'INVALID_USER_ID' });

  const pageValidation = parsePositiveInt(req.query.page, { min: 1, max: 1_000_000, error: 'INVALID_NUMBER' });
  const pageSizeValidation = parsePositiveInt(req.query.pageSize, { min: 1, max: 50, error: 'INVALID_NUMBER' });
  const page = pageValidation.ok ? pageValidation.value : 1;
  const pageSize = pageSizeValidation.ok ? pageSizeValidation.value : 20;
  const offset = (page - 1) * pageSize;

  try {
    const [rows] = await db.query(
      `SELECT * FROM user_notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, pageSize, offset]
    );
    const [countRows] = await db.query(
      `SELECT COUNT(*) AS total FROM user_notifications WHERE user_id = ?`,
      [userId]
    );
    res.json({
      items: rows.map((r) => ({
        id: String(r.id),
        title: r.title,
        message: r.message,
        type: r.type,
        entityType: r.entity_type,
        entityId: r.entity_id,
        isRead: Boolean(r.is_read),
        createdAt: r.created_at
      })),
      page,
      pageSize,
      total: Number(countRows?.[0]?.total || 0)
    });
  } catch (error) {
    console.error('List Notifications Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleMarkNotificationRead = async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid ID' });
  const userId = Number(req.auth?.sub);
  if (!Number.isFinite(userId)) return res.status(400).json({ error: 'INVALID_USER_ID' });

  try {
    await db.query(`UPDATE user_notifications SET is_read = 1 WHERE id = ? AND user_id = ?`, [id, userId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Mark Notification Read Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
