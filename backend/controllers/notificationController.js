import { logError } from '../logging.js';

import { db } from '../db.js';
import { auditLog, isSafeText } from '../security.js';

const mapNotification = (row) => ({
  id: row.id.toString(),
  title: row.title,
  message: row.message,
  type: row.type,
  status: row.status,
  audience: row.audience || 'both',
  date: new Date(row.created_at).toLocaleDateString('fa-IR'),
  isoDate: row.created_at
});

// For Users (Public/Protected)
export const handleGetActiveNotification = async (req, res) => {
  try {
    const role = req.auth?.role;
    const sql =
      role === 'driver'
        ? "SELECT * FROM notifications WHERE status = 'active' AND audience IN ('driver','both') ORDER BY created_at DESC LIMIT 1"
        : role === 'user'
          ? "SELECT * FROM notifications WHERE status = 'active' AND audience IN ('student','both') ORDER BY created_at DESC LIMIT 1"
          : "SELECT * FROM notifications WHERE status = 'active' AND audience = 'both' ORDER BY created_at DESC LIMIT 1";

    const [rows] = await db.query(sql);
    if (rows.length === 0) return res.json(null);
    res.json(mapNotification(rows[0]));
  } catch (error) {
    logError('Get Active Notification Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Admin: Get All
export const handleGetNotifications = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM notifications ORDER BY created_at DESC");
    res.json(rows.map(mapNotification));
  } catch (error) {
    logError('Get All Notifications Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Admin: Create
export const handleCreateNotification = async (req, res) => {
  const { title, message, type, audience } = req.body;
  if (!isSafeText(title, 255) || !isSafeText(message, 5000)) {
    return res.status(400).json({ error: 'Title and message required' });
  }
  const notifType = type || 'info';
  const notifAudience = audience || 'both';
  if (!['student', 'driver', 'both'].includes(notifAudience)) {
    return res.status(400).json({ error: 'INVALID_AUDIENCE' });
  }

  try {
    const [result] = await db.query(
      "INSERT INTO notifications (title, message, type, audience, status) VALUES (?, ?, ?, ?, 'active')",
      [title, message, notifType, notifAudience]
    );
    const [rows] = await db.query("SELECT * FROM notifications WHERE id = ?", [result.insertId]);
    await auditLog(db, req, 'admin.notification_create', 'notification', result.insertId);
    res.status(201).json(mapNotification(rows[0]));
  } catch (error) {
    logError('Create Notification Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Admin: Update
export const handleUpdateNotification = async (req, res) => {
  const id = Number(req.params.id);
  const { title, message, type, audience } = req.body;
  
  if (!id) return res.status(400).json({ error: 'Invalid ID' });
  if (!isSafeText(title, 255) || !isSafeText(message, 5000)) {
    return res.status(400).json({ error: 'Title and message required' });
  }
  const notifAudience = audience || 'both';
  if (!['student', 'driver', 'both'].includes(notifAudience)) {
    return res.status(400).json({ error: 'INVALID_AUDIENCE' });
  }

  try {
    await db.query(
      "UPDATE notifications SET title = ?, message = ?, type = ?, audience = ? WHERE id = ?",
      [title, message, type || 'info', notifAudience, id]
    );
    await auditLog(db, req, 'admin.notification_update', 'notification', id);
    res.json({ success: true });
  } catch (error) {
    logError('Update Notification Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Admin: Toggle Status (Active/Archived)
export const handleToggleNotificationStatus = async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  try {
    await db.query(
      "UPDATE notifications SET status = IF(status='active', 'archived', 'active') WHERE id = ?",
      [id]
    );
    const [rows] = await db.query("SELECT status FROM notifications WHERE id = ?", [id]);
    await auditLog(db, req, 'admin.notification_toggle_status', 'notification', id, { newStatus: rows[0]?.status });
    res.json({ success: true, newStatus: rows[0]?.status });
  } catch (error) {
    logError('Toggle Notification Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Admin: Delete
export const handleDeleteNotification = async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  try {
    await db.query("DELETE FROM notifications WHERE id = ?", [id]);
    await auditLog(db, req, 'admin.notification_delete', 'notification', id);
    res.json({ success: true });
  } catch (error) {
    logError('Delete Notification Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
