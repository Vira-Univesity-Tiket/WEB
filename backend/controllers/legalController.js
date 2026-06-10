import { db } from '../db.js';
import { auditLog } from '../security.js';
import { sanitizeText } from '../validation.js';

const normalizeAudience = (input) => {
  const audience = String(input || '').trim();
  if (audience === 'user' || audience === 'driver') return audience;
  return null;
};

export const handleGetLegalContent = async (req, res) => {
  const audience = normalizeAudience(req.query.audience);
  if (!audience) return res.status(400).json({ error: 'audience نامعتبر است.' });

  try {
    const [rows] = await db.query(
      `SELECT audience, content, updated_by, updated_at
       FROM legal_contents
       WHERE audience = ? AND is_active = 1
       ORDER BY id DESC
       LIMIT 1`,
      [audience]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'محتوای قوانین یافت نشد.' });
    }
    return res.json({
      audience: rows[0].audience,
      content: rows[0].content,
      updatedBy: rows[0].updated_by || null,
      updatedAt: rows[0].updated_at
    });
  } catch (error) {
    console.error('Get legal content error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};

export const handleUpsertLegalContent = async (req, res) => {
  const audience = normalizeAudience(req.body?.audience);
  const content = sanitizeText(req.body?.content, 60_000);
  if (!audience) return res.status(400).json({ error: 'audience نامعتبر است.' });
  if (!content) return res.status(400).json({ error: 'متن قوانین الزامی است.' });

  try {
    await db.query(
      `INSERT INTO legal_contents (audience, content, is_active, updated_by)
       VALUES (?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
      [audience, content, req.auth?.username || req.auth?.sub || 'admin']
    );
    await auditLog(db, req, 'admin.legal_update', 'legal_contents', audience, { audience });
    return res.json({ success: true });
  } catch (error) {
    console.error('Upsert legal content error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
};
