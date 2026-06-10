import path from 'path';
import { promises as fs } from 'fs';
import { db } from '../db.js';
import { auditLog } from '../security.js';
import { sanitizeText } from '../validation.js';

const TICKET_ROOT = process.env.TICKET_STORAGE_ROOT
  ? path.resolve(process.env.TICKET_STORAGE_ROOT)
  : path.resolve(process.cwd(), 'storage', 'tickets');

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain'
]);

const MAX_FILE_BYTES = Number(process.env.SUPPORT_TICKET_MAX_FILE_BYTES || 5 * 1024 * 1024); // 5MB
const MAX_FILES_PER_MESSAGE = Number(process.env.SUPPORT_TICKET_MAX_FILES || 5);

const ensureDir = async (p) => {
  await fs.mkdir(p, { recursive: true });
};

const safeSegment = (value, fallback = 'user') => {
  const cleaned = String(value || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '')
    .slice(0, 64);
  return cleaned || fallback;
};

const tehranStamp = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '00';
  const y = get('year');
  const m = get('month');
  const d = get('day');
  const hh = get('hour');
  const mm = get('minute');
  const ss = get('second');
  return { date: `${y}-${m}-${d}`, time: `${hh}-${mm}-${ss}` };
};

const parseDataUrl = (dataUrl) => {
  if (typeof dataUrl !== 'string') return { ok: false, error: 'فایل نامعتبر است.' };
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return { ok: false, error: 'فرمت فایل نامعتبر است.' };
  const mime = m[1];
  if (!ALLOWED_MIME.has(mime)) return { ok: false, error: 'فرمت فایل مجاز نیست.' };
  const base64 = m[2];
  let buf;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    return { ok: false, error: 'فایل نامعتبر است.' };
  }
  if (!buf.length || buf.length > MAX_FILE_BYTES) return { ok: false, error: 'حجم فایل بیش از حد مجاز است.' };
  return { ok: true, mime, buffer: buf };
};

const extForMime = (mime) => {
  switch (mime) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/webp': return 'webp';
    case 'application/pdf': return 'pdf';
    case 'text/plain': return 'txt';
    default: return 'bin';
  }
};

const getUserByStudentId = async (studentId) => {
  const [rows] = await db.query('SELECT id, student_id, name FROM users WHERE student_id = ? LIMIT 1', [studentId]);
  return rows?.[0] || null;
};

const getTicketStoragePath = async (ticketId) => {
  const [rows] = await db.query('SELECT storage_path FROM support_tickets WHERE id = ? LIMIT 1', [ticketId]);
  return rows?.[0]?.storage_path || null;
};

const writeTicketTxt = async (ticketId) => {
  const storagePath = await getTicketStoragePath(ticketId);
  if (!storagePath) return null;
  const absDir = path.join(TICKET_ROOT, storagePath);
  await ensureDir(absDir);

  const [[ticket]] = await db.query(
    `SELECT st.id, st.title, st.status, st.created_at, st.closed_at,
            u.student_id, u.name
     FROM support_tickets st
     JOIN users u ON u.id = st.user_id
     WHERE st.id = ? LIMIT 1`,
    [ticketId]
  );
  if (!ticket) return null;

  const [messages] = await db.query(
    `SELECT m.id, m.sender_role, m.sender_id, m.message, m.created_at
     FROM support_ticket_messages m
     WHERE m.ticket_id = ?
     ORDER BY m.id ASC`,
    [ticketId]
  );

  const [attachments] = await db.query(
    `SELECT a.id, a.message_id, a.original_name, a.mime_type, a.size_bytes, a.created_at, a.uploader_role, a.uploader_id
     FROM support_ticket_attachments a
     WHERE a.ticket_id = ?
     ORDER BY a.id ASC`,
    [ticketId]
  );

  const [history] = await db.query(
    `SELECT h.from_status, h.to_status, h.actor_role, h.actor_id, h.note, h.created_at
     FROM support_ticket_status_history h
     WHERE h.ticket_id = ?
     ORDER BY h.id ASC`,
    [ticketId]
  );

  const lines = [];
  lines.push(`عنوان: ${ticket.title}`);
  lines.push(`شناسه تیکت: ${ticket.id}`);
  lines.push(`کاربر: ${ticket.name} (${ticket.student_id})`);
  lines.push(`وضعیت: ${ticket.status}`);
  lines.push(`تاریخ ایجاد: ${new Date(ticket.created_at).toLocaleString('fa-IR')}`);
  lines.push(`تاریخ بسته شدن: ${ticket.closed_at ? new Date(ticket.closed_at).toLocaleString('fa-IR') : '-'}`);
  lines.push('');
  lines.push('--- پیام‌ها ---');
  for (const m of messages) {
    const who = m.sender_role === 'admin' ? `ادمین(${m.sender_id || '-'})` : `کاربر(${ticket.student_id})`;
    lines.push(`[${new Date(m.created_at).toLocaleString('fa-IR')}] ${who}`);
    lines.push(String(m.message || '').replace(/\r\n/g, '\n'));
    const atts = attachments.filter((a) => a.message_id === m.id);
    if (atts.length) {
      lines.push('ضمیمه‌ها:');
      for (const a of atts) {
        lines.push(`- ${a.original_name} | ${a.mime_type} | ${a.size_bytes} bytes | ${new Date(a.created_at).toLocaleString('fa-IR')}`);
      }
    }
    lines.push('');
  }
  lines.push('--- تاریخچه وضعیت‌ها ---');
  for (const h of history) {
    lines.push(`[${new Date(h.created_at).toLocaleString('fa-IR')}] ${h.from_status || '-'} -> ${h.to_status} توسط ${h.actor_role}(${h.actor_id || '-'})${h.note ? ` | ${h.note}` : ''}`);
  }
  lines.push('');

  const txtPath = path.join(absDir, 'ticket.txt');
  await fs.writeFile(txtPath, lines.join('\n'), { encoding: 'utf8' });
  return txtPath;
};

export const handleCreateSupportTicket = async (req, res) => {
  const studentId = req.auth?.studentId;
  if (!studentId) return res.status(400).json({ error: 'student_id required' });

  const user = await getUserByStudentId(studentId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const title = sanitizeText(req.body?.title, 80);
  const message = sanitizeText(req.body?.message || req.body?.description, 4000);
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

  if (!title || !message) return res.status(400).json({ error: 'تکمیل عنوان و توضیحات الزامی است.' });
  if (attachments.length > MAX_FILES_PER_MESSAGE) return res.status(400).json({ error: 'تعداد فایل‌های ضمیمه بیش از حد مجاز است.' });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const stamp = tehranStamp(new Date());
    const userSegment = safeSegment(user.student_id, 'user');

    const [ticketResult] = await connection.query(
      `INSERT INTO support_tickets (user_id, title, status, storage_path)
       VALUES (?, ?, 'open', '')`,
      [user.id, title]
    );
    const ticketId = ticketResult.insertId;
    const storagePath = path.join(userSegment, `${ticketId}*${stamp.date}*${stamp.time}`);
    const absDir = path.join(TICKET_ROOT, storagePath);
    await ensureDir(absDir); // must exist even with no files

    await connection.query(
      'UPDATE support_tickets SET storage_path = ? WHERE id = ?',
      [storagePath, ticketId]
    );

    const [msgResult] = await connection.query(
      `INSERT INTO support_ticket_messages (ticket_id, sender_role, sender_id, message)
       VALUES (?, 'user', ?, ?)`,
      [ticketId, user.student_id, message]
    );
    const messageId = msgResult.insertId;

    for (const f of attachments) {
      const originalName = sanitizeText(f?.name || 'file', 120) || 'file';
      const parsed = parseDataUrl(f?.dataUrl);
      if (!parsed.ok) {
        await connection.rollback();
        return res.status(400).json({ error: parsed.error });
      }
      const ext = extForMime(parsed.mime);
      const storedName = `${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
      const relFile = path.join(storagePath, storedName);
      const absFile = path.join(TICKET_ROOT, relFile);
      await fs.writeFile(absFile, parsed.buffer, { flag: 'wx' });

      await connection.query(
        `INSERT INTO support_ticket_attachments
          (ticket_id, message_id, original_name, stored_name, mime_type, size_bytes, rel_path, uploader_role, uploader_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?)`,
        [ticketId, messageId, originalName, storedName, parsed.mime, parsed.buffer.length, relFile, user.student_id]
      );
    }

    await connection.query(
      `INSERT INTO support_ticket_status_history (ticket_id, from_status, to_status, actor_role, actor_id, note)
       VALUES (?, NULL, 'open', 'user', ?, NULL)`,
      [ticketId, user.student_id]
    );

    await connection.commit();
    await auditLog(db, req, 'support.ticket_create', 'support_ticket', ticketId, { title });

    res.json({
      success: true,
      ticket: {
        id: String(ticketId),
        title,
        status: 'open',
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Create support ticket error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

export const handleListSupportTickets = async (req, res) => {
  const studentId = req.auth?.studentId;
  if (!studentId) return res.status(400).json({ error: 'student_id required' });
  const user = await getUserByStudentId(studentId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const status = String(req.query.status || '').trim();
  const isClosedBucket = status === 'closed';

  const [rows] = await db.query(
    `SELECT id, title, status, created_at, updated_at, closed_at
     FROM support_tickets
     WHERE user_id = ?
       AND (${isClosedBucket ? "status = 'closed'" : "status <> 'closed'"})
     ORDER BY id DESC
     LIMIT 200`,
    [user.id]
  );
  res.json(rows.map((r) => ({
    id: String(r.id),
    title: r.title,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    closedAt: r.closed_at
  })));
};

export const handleGetSupportTicket = async (req, res) => {
  const ticketId = Number(req.params.ticketId);
  if (!Number.isFinite(ticketId)) return res.status(400).json({ error: 'Invalid ID' });

  const role = req.auth?.role;
  const studentId = req.auth?.studentId;

  const [ticketRows] = await db.query(
    `SELECT st.id, st.user_id, st.title, st.status, st.created_at, st.updated_at, st.closed_at,
            u.student_id, u.name
     FROM support_tickets st
     JOIN users u ON u.id = st.user_id
     WHERE st.id = ? LIMIT 1`,
    [ticketId]
  );
  if (!ticketRows.length) return res.status(404).json({ error: 'تیکت یافت نشد' });
  const ticket = ticketRows[0];

  if (role === 'user' && studentId && studentId !== ticket.student_id) return res.status(403).json({ error: 'Forbidden' });

  const [messages] = await db.query(
    `SELECT id, sender_role, sender_id, message, created_at
     FROM support_ticket_messages
     WHERE ticket_id = ?
     ORDER BY id ASC`,
    [ticketId]
  );

  const [attachments] = await db.query(
    `SELECT id, message_id, original_name, mime_type, size_bytes, created_at
     FROM support_ticket_attachments
     WHERE ticket_id = ?
     ORDER BY id ASC`,
    [ticketId]
  );

  res.json({
    id: String(ticket.id),
    title: ticket.title,
    status: ticket.status,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
    closedAt: ticket.closed_at,
    user: { studentId: ticket.student_id, name: ticket.name },
    messages: messages.map((m) => ({
      id: String(m.id),
      senderRole: m.sender_role,
      senderId: m.sender_id,
      message: m.message,
      createdAt: m.created_at,
      attachments: attachments
        .filter((a) => a.message_id === m.id)
        .map((a) => ({
          id: String(a.id),
          originalName: a.original_name,
          mimeType: a.mime_type,
          sizeBytes: a.size_bytes,
          createdAt: a.created_at
        }))
    }))
  });
};

export const handleAddSupportTicketMessage = async (req, res) => {
  const ticketId = Number(req.params.ticketId);
  if (!Number.isFinite(ticketId)) return res.status(400).json({ error: 'Invalid ID' });

  const role = req.auth?.role;
  const studentId = req.auth?.studentId;
  const adminId = req.auth?.sub ? String(req.auth.sub) : null;

  const text = sanitizeText(req.body?.message, 4000);
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
  if (!text) return res.status(400).json({ error: 'متن پیام الزامی است.' });
  if (attachments.length > MAX_FILES_PER_MESSAGE) return res.status(400).json({ error: 'تعداد فایل‌های ضمیمه بیش از حد مجاز است.' });

  const [ticketRows] = await db.query(
    `SELECT st.id, st.user_id, st.status, st.storage_path, u.student_id
     FROM support_tickets st
     JOIN users u ON u.id = st.user_id
     WHERE st.id = ? LIMIT 1`,
    [ticketId]
  );
  if (!ticketRows.length) return res.status(404).json({ error: 'تیکت یافت نشد' });
  const ticket = ticketRows[0];

  if (role === 'user' && studentId && studentId !== ticket.student_id) return res.status(403).json({ error: 'Forbidden' });
  if (role === 'user' && ticket.status === 'closed') return res.status(400).json({ error: 'تیکت بسته است.' });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const senderRole = role === 'admin' ? 'admin' : 'user';
    const senderId = senderRole === 'admin' ? adminId : studentId;

    const [msgResult] = await connection.query(
      `INSERT INTO support_ticket_messages (ticket_id, sender_role, sender_id, message)
       VALUES (?, ?, ?, ?)`,
      [ticketId, senderRole, senderId, text]
    );
    const messageId = msgResult.insertId;

    const storagePath = ticket.storage_path || (await getTicketStoragePath(ticketId));
    const absDir = path.join(TICKET_ROOT, storagePath || '');
    await ensureDir(absDir);

    for (const f of attachments) {
      const originalName = sanitizeText(f?.name || 'file', 120) || 'file';
      const parsed = parseDataUrl(f?.dataUrl);
      if (!parsed.ok) {
        await connection.rollback();
        return res.status(400).json({ error: parsed.error });
      }
      const ext = extForMime(parsed.mime);
      const storedName = `${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
      const relFile = path.join(storagePath, storedName);
      const absFile = path.join(TICKET_ROOT, relFile);
      await fs.writeFile(absFile, parsed.buffer, { flag: 'wx' });

      await connection.query(
        `INSERT INTO support_ticket_attachments
          (ticket_id, message_id, original_name, stored_name, mime_type, size_bytes, rel_path, uploader_role, uploader_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ticketId, messageId, originalName, storedName, parsed.mime, parsed.buffer.length, relFile, senderRole, senderId]
      );
    }

    // Update status auto transitions
    if (senderRole === 'admin' && ticket.status !== 'answered') {
      await connection.query('UPDATE support_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['answered', ticketId]);
      await connection.query(
        `INSERT INTO support_ticket_status_history (ticket_id, from_status, to_status, actor_role, actor_id, note)
         VALUES (?, ?, 'answered', 'admin', ?, NULL)`,
        [ticketId, ticket.status, adminId]
      );
    } else if (senderRole === 'user' && ticket.status === 'answered') {
      await connection.query('UPDATE support_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['in_progress', ticketId]);
      await connection.query(
        `INSERT INTO support_ticket_status_history (ticket_id, from_status, to_status, actor_role, actor_id, note)
         VALUES (?, 'answered', 'in_progress', 'user', ?, NULL)`,
        [ticketId, studentId]
      );
    } else {
      await connection.query('UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [ticketId]);
    }

    await connection.commit();
    await auditLog(db, req, 'support.ticket_message', 'support_ticket', ticketId, { senderRole });

    await writeTicketTxt(ticketId); // keep TXT updated on every message
    res.json({ success: true, messageId: String(messageId) });
  } catch (error) {
    await connection.rollback();
    console.error('Add support ticket message error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

export const handleAdminListSupportTickets = async (req, res) => {
  const status = String(req.query.status || '').trim();
  const where = status ? 'WHERE st.status = ?' : 'WHERE 1=1';
  const params = status ? [status] : [];
  const [rows] = await db.query(
    `SELECT st.id, st.title, st.status, st.created_at, st.updated_at, st.closed_at,
            u.student_id, u.name
     FROM support_tickets st
     JOIN users u ON u.id = st.user_id
     ${where}
     ORDER BY st.id DESC
     LIMIT 500`,
    params
  );
  res.json(rows.map((r) => ({
    id: String(r.id),
    title: r.title,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    closedAt: r.closed_at,
    user: { studentId: r.student_id, name: r.name }
  })));
};

export const handleAdminSetSupportTicketStatus = async (req, res) => {
  const ticketId = Number(req.params.ticketId);
  if (!Number.isFinite(ticketId)) return res.status(400).json({ error: 'Invalid ID' });
  const toStatus = String(req.body?.status || '').trim();
  const note = sanitizeText(req.body?.note || '', 255);
  const adminId = req.auth?.sub ? String(req.auth.sub) : null;

  if (!['open', 'in_progress', 'answered', 'closed'].includes(toStatus)) {
    return res.status(400).json({ error: 'وضعیت نامعتبر است.' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT status FROM support_tickets WHERE id = ? LIMIT 1 FOR UPDATE', [ticketId]);
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'تیکت یافت نشد' });
    }
    const fromStatus = rows[0].status;
    if (fromStatus === toStatus) {
      await connection.rollback();
      return res.json({ success: true });
    }

    await connection.query(
      'UPDATE support_tickets SET status = ?, closed_at = IF(? = \"closed\", CURRENT_TIMESTAMP, NULL), updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [toStatus, toStatus, ticketId]
    );
    await connection.query(
      `INSERT INTO support_ticket_status_history (ticket_id, from_status, to_status, actor_role, actor_id, note)
       VALUES (?, ?, ?, 'admin', ?, ?)`,
      [ticketId, fromStatus, toStatus, adminId, note || null]
    );

    await connection.commit();
    await auditLog(db, req, 'support.ticket_status_change', 'support_ticket', ticketId, { fromStatus, toStatus });

    // Generate/update TXT on close or reopen
    await writeTicketTxt(ticketId);
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Set support ticket status error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

export const handleDownloadSupportAttachment = async (req, res) => {
  const attachmentId = Number(req.params.attachmentId);
  if (!Number.isFinite(attachmentId)) return res.status(400).json({ error: 'Invalid ID' });

  const [rows] = await db.query(
    `SELECT a.ticket_id, a.original_name, a.rel_path, st.user_id, u.student_id
     FROM support_ticket_attachments a
     JOIN support_tickets st ON st.id = a.ticket_id
     JOIN users u ON u.id = st.user_id
     WHERE a.id = ? LIMIT 1`,
    [attachmentId]
  );
  if (!rows.length) return res.status(404).json({ error: 'فایل یافت نشد' });
  const a = rows[0];

  const role = req.auth?.role;
  if (role === 'user' && req.auth?.studentId && req.auth.studentId !== a.student_id) return res.status(403).json({ error: 'Forbidden' });
  if (role !== 'admin' && role !== 'user') return res.status(403).json({ error: 'Forbidden' });

  const abs = path.join(TICKET_ROOT, a.rel_path);
  // Ensure path stays under root
  if (!abs.startsWith(TICKET_ROOT)) return res.status(403).json({ error: 'Forbidden' });

  try {
    await auditLog(db, req, 'support.attachment_download', 'support_ticket', a.ticket_id, { attachmentId });
    res.download(abs, a.original_name || `attachment-${attachmentId}`);
  } catch (e) {
    res.status(404).json({ error: 'فایل یافت نشد' });
  }
};

export const handleDownloadSupportTicketTxt = async (req, res) => {
  const ticketId = Number(req.params.ticketId);
  if (!Number.isFinite(ticketId)) return res.status(400).json({ error: 'Invalid ID' });

  const [rows] = await db.query(
    `SELECT st.storage_path, u.student_id
     FROM support_tickets st
     JOIN users u ON u.id = st.user_id
     WHERE st.id = ? LIMIT 1`,
    [ticketId]
  );
  if (!rows.length) return res.status(404).json({ error: 'تیکت یافت نشد' });
  const t = rows[0];
  const role = req.auth?.role;
  if (role === 'user' && req.auth?.studentId && req.auth.studentId !== t.student_id) return res.status(403).json({ error: 'Forbidden' });
  if (role !== 'admin' && role !== 'user') return res.status(403).json({ error: 'Forbidden' });

  const absDir = path.join(TICKET_ROOT, t.storage_path);
  const absFile = path.join(absDir, 'ticket.txt');
  try {
    await writeTicketTxt(ticketId);
    await auditLog(db, req, 'support.ticket_txt_download', 'support_ticket', ticketId);
    res.download(absFile, `ticket-${ticketId}.txt`);
  } catch {
    res.status(404).json({ error: 'فایل یافت نشد' });
  }
};

