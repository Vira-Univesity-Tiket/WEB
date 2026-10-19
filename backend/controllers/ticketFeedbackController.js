import { db } from '../db.js';
import { auditLog } from '../security.js';
import { parsePositiveInt, sanitizeText } from '../validation.js';
import { mapTicketForUi } from './ticketController.js';

const statuses = ['pending', 'reviewing', 'resolved'];
const selectFeedback = `SELECT t.id, t.seat_number, t.price_paid, t.status, t.qr_code, t.validation_code, t.created_at,
  b.bus_number, b.origin, b.destination, b.departure_time, u.name AS user_name, u.student_id,
  f.rating AS feedback_rating, f.comment AS feedback_comment, f.status AS feedback_status,
  f.reviewed_by, f.reviewed_at, f.created_at AS feedback_created_at,
  (SELECT MIN(scanned_at) FROM ticket_scans WHERE ticket_id = t.id) AS boarded_at
  FROM tickets t JOIN users u ON u.id = t.user_id JOIN buses b ON b.id = t.bus_id
  LEFT JOIN ticket_feedback f ON f.ticket_id = t.id`;

const mapFeedback = row => ({
  id: String(row.id), ticketId: String(row.id), userName: row.user_name, studentId: row.student_id,
  origin: row.origin, destination: row.destination, departureTime: String(row.departure_time).slice(0, 5),
  date: new Date(row.feedback_created_at).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' }),
  time: new Date(row.feedback_created_at).toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit' }),
  rating: row.feedback_rating, comment: row.feedback_comment, status: row.feedback_status,
  reviewedBy: row.reviewed_by || '', reviewedAt: row.reviewed_at,
  busNumber: row.bus_number, price: mapTicketForUi(row).price
});

export const handleTicketFeedback = async (req, res) => {
  const id = parsePositiveInt(req.params.ticketId);
  const rating = parsePositiveInt(req.body.rating, { max: 5 });
  if (!id.ok || !rating.ok || typeof req.body.comment !== 'string' || req.body.comment.length > 2000) {
    return res.status(400).json({ error: 'امتیاز یا متن نظر معتبر نیست.' });
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(`${selectFeedback} WHERE t.id = ? AND u.student_id = ? FOR UPDATE`, [id.value, req.auth.studentId]);
    if (!rows.length) { await connection.rollback(); return res.status(404).json({ error: 'بلیط یافت نشد.' }); }
    if (!rows[0].boarded_at) { await connection.rollback(); return res.status(409).json({ error: 'ثبت نظر پس از تأیید بلیط توسط راننده امکان‌پذیر است.' }); }
    if (rows[0].feedback_rating) { await connection.rollback(); return res.status(409).json({ error: 'نظر این سفر قبلاً ثبت شده است.' }); }
    const comment = sanitizeText(req.body.comment, 2000);
    await connection.query('INSERT INTO ticket_feedback (ticket_id, rating, comment) VALUES (?, ?, ?)', [id.value, rating.value, comment]);
    const ticket = mapTicketForUi({ ...rows[0], feedback_rating: rating.value, feedback_comment: comment, feedback_status: 'pending' });
    await connection.commit();
    res.json({ success: true, ticket });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
};

export const handleListTicketFeedback = async (req, res) => {
  const status = req.query.status;
  if (status && !statuses.includes(status)) return res.status(400).json({ error: 'وضعیت نظر معتبر نیست.' });
  const [rows] = await db.query(`${selectFeedback} WHERE f.ticket_id IS NOT NULL ${status ? 'AND f.status = ?' : ''} ORDER BY f.created_at DESC LIMIT 500`, status ? [status] : []);
  res.json(rows.map(mapFeedback));
};

export const handleReviewTicketFeedback = async (req, res) => {
  const id = parsePositiveInt(req.params.ticketId);
  const { status, note = '' } = req.body;
  if (!id.ok || !statuses.includes(status) || typeof note !== 'string' || note.length > 2000) return res.status(400).json({ error: 'اطلاعات بررسی نظر معتبر نیست.' });
  const [result] = await db.query('UPDATE ticket_feedback SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = NOW() WHERE ticket_id = ?', [status, sanitizeText(note, 2000), String(req.auth.username || req.auth.sub), id.value]);
  if (!result.affectedRows) return res.status(404).json({ error: 'نظر سفر یافت نشد.' });
  await auditLog(db, req, 'admin.feedback_review', 'ticket', id.value, { status });
  res.json({ success: true });
};
