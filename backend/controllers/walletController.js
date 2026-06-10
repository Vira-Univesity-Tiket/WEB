import { db } from '../db.js';
import { auditLog } from '../security.js';
import { parseMoneyToman } from '../validation.js';
import { getSetting } from '../settingsStore.js';
import {
  requestZarinpalPayment,
  verifyPaymentSignature,
  verifyZarinpalPayment,
  getPaymentConfig,
  getPaymentAvailability
} from '../services/paymentGatewayService.js';

const TOPUP_GATEWAY = 'zarinpal';

const mapTransaction = (row) => {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  return {
    id: row.id?.toString() ?? `TX-${Date.now()}`,
    title: row.title,
    amount: Math.round(Number(row.amount || 0) / 10),
    type: row.type,
    date: createdAt.toLocaleDateString('fa-IR'),
    time: createdAt.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    trackingNumber: row.tracking_number
  };
};

const toSafeJson = (value) => {
  try {
    return JSON.stringify(value).slice(0, 4000);
  } catch {
    return '{}';
  }
};

const makeWalletTrackingNumber = (referenceId) => {
  const base = String(referenceId || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 24);
  return `PAY-${base || Date.now().toString()}`;
};

const toClientTopupStatus = (status) => {
  if (status === 'pending') return 'pending';
  if (status === 'success') return 'success';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'expired') return 'expired';
  return 'failed';
};

const topupDescription = (tomanAmount) => `شارژ کیف پول ویرا - ${Number(tomanAmount).toLocaleString('fa-IR')} تومان`;

const getTopupExpiryMinutes = async () => {
  const raw = await getSetting('payment_topup_expiry_minutes');
  const n = Number(raw || 20);
  if (!Number.isFinite(n) || n < 5 || n > 120) return 20;
  return Math.floor(n);
};

const enforceWeeklyLimit = async (connection, userId, rialAmount) => {
  const weeklyLimitTomanRaw = await getSetting('weekly_wallet_topup_limit_toman');
  const weeklyLimitToman = weeklyLimitTomanRaw ? Number(weeklyLimitTomanRaw) : 0;
  if (!Number.isFinite(weeklyLimitToman) || weeklyLimitToman <= 0) {
    return { ok: true };
  }

  const weeklyLimitRial = Math.round(weeklyLimitToman * 10);
  const [sumRows] = await connection.query(
    `SELECT COALESCE(SUM(t.amount), 0) AS total_rial
     FROM transactions t
     WHERE t.user_id = ?
       AND t.type = 'deposit'
       AND YEARWEEK(t.created_at, 3) = YEARWEEK(NOW(), 3)
     FOR UPDATE`,
    [userId]
  );
  const usedRial = Number(sumRows?.[0]?.total_rial || 0);
  if (usedRial + rialAmount > weeklyLimitRial) {
    const remainingRial = Math.max(0, weeklyLimitRial - usedRial);
    return {
      ok: false,
      message: `سقف شارژ هفتگی کیف پول تکمیل شده است. سقف: ${Math.round(weeklyLimitToman).toLocaleString('fa-IR')} تومان؛ باقی‌مانده: ${Math.round(Math.floor(remainingRial / 10)).toLocaleString('fa-IR')} تومان.`
    };
  }
  return { ok: true };
};

const extractCallbackFields = (req) => {
  const merged = { ...(req.query || {}), ...(req.body || {}) };
  const transactionIdRaw = merged.transactionId ?? merged.transaction_id ?? merged.tx ?? merged.id;
  const authorityRaw = merged.Authority ?? merged.authority ?? merged.token;
  const statusRaw = merged.Status ?? merged.status;
  const refIdRaw = merged.RefID ?? merged.ref_id ?? merged.refId;

  const transactionId = transactionIdRaw ? Number(String(transactionIdRaw).trim()) : null;
  const authority = authorityRaw ? String(authorityRaw).trim() : '';
  const gatewayStatus = statusRaw ? String(statusRaw).trim().toUpperCase() : '';
  const refId = refIdRaw ? String(refIdRaw).trim() : '';

  return { transactionId, authority, gatewayStatus, refId, merged };
};

const resolvePaymentByCallback = async (connection, transactionId, authority) => {
  if (transactionId && Number.isFinite(transactionId)) {
    const [rows] = await connection.query(
      `SELECT id, user_id, amount, status, gateway, authority, gateway_transaction_id, reference_id, created_at
       FROM payment_transactions
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [transactionId]
    );
    if (rows.length > 0) return rows[0];
  }

  if (authority) {
    const [rows] = await connection.query(
      `SELECT id, user_id, amount, status, gateway, authority, gateway_transaction_id, reference_id, created_at
       FROM payment_transactions
       WHERE gateway = ? AND authority = ?
       LIMIT 1
       FOR UPDATE`,
      [TOPUP_GATEWAY, authority]
    );
    if (rows.length > 0) return rows[0];
  }
  return null;
};

const markPaymentState = async (connection, paymentId, nextStatus, callbackPayload, referenceId = null, gatewayTxId = null) => {
  await connection.query(
    `UPDATE payment_transactions
     SET status = ?,
         callback_payload = ?,
         reference_id = COALESCE(?, reference_id),
         gateway_transaction_id = COALESCE(?, gateway_transaction_id),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [nextStatus, toSafeJson(callbackPayload), referenceId, gatewayTxId, paymentId]
  );
};

const callbackResponseMessage = (status, fallback = '') => {
  if (status === 'success') return 'پرداخت با موفقیت تایید شد.';
  if (status === 'pending') return 'پرداخت در وضعیت انتظار تایید است.';
  if (status === 'cancelled') return 'پرداخت توسط کاربر لغو شد.';
  if (status === 'expired') return 'مهلت پرداخت به پایان رسیده است.';
  return fallback || 'پرداخت ناموفق بود.';
};

const ensurePaymentAvailable = async (req, res, action = 'initiate') => {
  const availability = getPaymentAvailability();
  if (availability.enabled) return true;
  await auditLog(db, req, `payment.${action}.disabled`, 'payment_transaction', null, {
    reasons: availability.reasons
  });
  res.status(503).json({
    error: 'زیرساخت پرداخت در حال حاضر فعال نیست. لطفاً بعداً تلاش کنید.',
    code: 'PAYMENT_UNAVAILABLE'
  });
  return false;
};

const appendQuery = (url, params) => {
  const target = new URL(url);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    target.searchParams.set(key, String(value));
  });
  return target.toString();
};

const shouldRedirectToFrontend = (req) => req.method === 'GET';

const replyCallback = (req, res, payload) => {
  if (!shouldRedirectToFrontend(req)) {
    return res.status(payload.success ? 200 : 400).json(payload);
  }
  const config = getPaymentConfig();
  const redirectUrl = appendQuery(config.returnUrl, {
    topupTransactionId: payload.transactionId,
    topupStatus: payload.status,
    topupReferenceId: payload.referenceId || '',
    topupMessage: payload.message || ''
  });
  return res.redirect(302, redirectUrl);
};

export const handleGetTransactions = async (req, res) => {
  const rawStudentId = req.query.student_id ?? req.body?.student_id;
  const requestedStudentId = Array.isArray(rawStudentId) ? rawStudentId[0] : rawStudentId;
  const studentId = req.auth?.role === 'user' ? req.auth.studentId : requestedStudentId;
  if (!studentId) return res.status(400).json({ error: 'student_id required' });
  if (req.auth?.role === 'user' && requestedStudentId && requestedStudentId !== req.auth.studentId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const [rows] = await db.query(
      `SELECT t.id, t.amount, t.type, t.title, t.tracking_number, t.created_at
       FROM transactions t
       JOIN users u ON u.id = t.user_id
       WHERE u.student_id = ?
       ORDER BY t.id DESC`,
      [studentId]
    );
    res.json(rows.map(mapTransaction));
  } catch (error) {
    console.error('-> Get Transactions Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleTopUpDeprecated = (_req, res) => {
  res.status(410).json({
    error: 'مسیر شارژ مستقیم غیرفعال شده است. از مسیر /wallet/topup/initiate استفاده کنید.',
    code: 'TOPUP_DIRECT_DISABLED'
  });
};

export const handleTopUpInitiate = async (req, res) => {
  if (!(await ensurePaymentAvailable(req, res, 'initiate'))) return;
  const { amount } = req.body || {};
  const studentId = req.auth?.studentId;
  const amountValidation = parseMoneyToman(amount, {
    min: Number(process.env.MIN_WALLET_TOPUP_TOMAN || 10000),
    max: Number(process.env.MAX_WALLET_TOPUP_TOMAN || 50000000)
  });
  if (!studentId) return res.status(400).json({ error: 'student_id required' });
  if (!amountValidation.ok) {
    await auditLog(db, req, 'payment.initiate.invalid_amount', 'payment_transaction', null, { amount: String(amount || '').slice(0, 100) });
    return res.status(400).json({ error: amountValidation.error });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.query(
      `SELECT id, status
       FROM users
       WHERE student_id = ?
       LIMIT 1
       FOR UPDATE`,
      [studentId]
    );
    if (!users.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'User not found' });
    }
    const user = users[0];
    if (user.status === 'suspended') {
      await connection.rollback();
      return res.status(403).json({ error: 'User suspended' });
    }

    const weeklyLimitCheck = await enforceWeeklyLimit(connection, user.id, amountValidation.rial);
    if (!weeklyLimitCheck.ok) {
      await connection.rollback();
      await auditLog(db, req, 'payment.initiate.weekly_limit_rejected', 'payment_transaction', null, {
        userId: user.id,
        amountRial: amountValidation.rial
      });
      return res.status(429).json({ error: weeklyLimitCheck.message });
    }

    const [insertResult] = await connection.query(
      `INSERT INTO payment_transactions (user_id, amount, status, gateway)
       VALUES (?, ?, 'pending', ?)`,
      [user.id, amountValidation.rial, TOPUP_GATEWAY]
    );
    const paymentId = insertResult.insertId;
    const callbackUrl = `${getPaymentConfig().callbackUrl}?transactionId=${paymentId}`;
    const gatewayRequest = await requestZarinpalPayment({
      amountRial: amountValidation.rial,
      description: topupDescription(amountValidation.toman),
      callbackUrl,
      metadata: { studentId, transactionId: String(paymentId) }
    });

    await connection.query(
      `UPDATE payment_transactions
       SET authority = ?, payment_url = ?, callback_payload = ?
       WHERE id = ?`,
      [gatewayRequest.authority, gatewayRequest.paymentUrl, toSafeJson({ request: gatewayRequest.gatewayPayload }), paymentId]
    );
    await connection.commit();

    const expiryMinutes = await getTopupExpiryMinutes();
    const expiresAt = new Date(Date.now() + (expiryMinutes * 60 * 1000)).toISOString();
    await auditLog(db, req, 'payment.initiate', 'payment_transaction', paymentId, {
      userId: user.id,
      amountRial: amountValidation.rial,
      gateway: TOPUP_GATEWAY,
      authority: gatewayRequest.authority
    });

    res.json({
      success: true,
      transactionId: String(paymentId),
      paymentUrl: gatewayRequest.paymentUrl,
      expiresAt
    });
  } catch (error) {
    await connection.rollback();
    console.error('Topup initiate failed:', error);
    await auditLog(db, req, 'payment.initiate.failed', 'payment_transaction', null, {
      message: String(error?.message || 'unknown')
    });
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

export const handleTopUpCallback = async (req, res) => {
  if (!(await ensurePaymentAvailable(req, res, 'callback'))) return;
  const signatureCheck = verifyPaymentSignature(req);
  if (!signatureCheck.ok) {
    await auditLog(db, req, 'payment.callback.invalid_signature', 'payment_transaction', null, { reason: signatureCheck.reason });
    return res.status(401).json({ error: 'Forbidden' });
  }

  const { transactionId, authority, gatewayStatus, refId, merged } = extractCallbackFields(req);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const payment = await resolvePaymentByCallback(connection, transactionId, authority);
    if (!payment) {
      await connection.rollback();
      return res.status(404).json({ error: 'Invalid ID' });
    }

    await auditLog(db, req, 'payment.callback.received', 'payment_transaction', payment.id, {
      transactionId: payment.id,
      authority: authority || payment.authority,
      status: gatewayStatus || null
    });

    if (payment.status === 'success') {
      await connection.commit();
      await auditLog(db, req, 'payment.duplicate_callback', 'payment_transaction', payment.id, {
        reason: 'already_success'
      });
      return replyCallback(req, res, {
        success: true,
        transactionId: String(payment.id),
        status: 'success',
        message: callbackResponseMessage('success'),
        idempotent: true
      });
    }

    if (payment.status !== 'pending') {
      await connection.commit();
      return replyCallback(req, res, {
        success: true,
        transactionId: String(payment.id),
        status: toClientTopupStatus(payment.status),
        message: callbackResponseMessage(toClientTopupStatus(payment.status), 'وضعیت پرداخت قبلاً نهایی شده است.'),
        idempotent: true
      });
    }

    if (gatewayStatus === 'NOK') {
      await markPaymentState(connection, payment.id, 'cancelled', merged, refId || null, null);
      await connection.commit();
      await auditLog(db, req, 'payment.verify.failed', 'payment_transaction', payment.id, { reason: 'gateway_status_nok' });
      return replyCallback(req, res, {
        success: false,
        transactionId: String(payment.id),
        status: 'cancelled',
        message: callbackResponseMessage('cancelled')
      });
    }

    const verifyResult = await verifyZarinpalPayment({
      amountRial: Number(payment.amount),
      authority: payment.authority || authority
    });

    if (!verifyResult.success) {
      await markPaymentState(connection, payment.id, 'failed', { callback: merged, verify: verifyResult.gatewayPayload }, refId || verifyResult.referenceId || null, verifyResult.gatewayTransactionId || null);
      await connection.commit();
      await auditLog(db, req, 'payment.verify.failed', 'payment_transaction', payment.id, {
        code: verifyResult.code,
        message: verifyResult.message || null
      });
      return replyCallback(req, res, {
        success: false,
        transactionId: String(payment.id),
        status: 'failed',
        message: callbackResponseMessage('failed')
      });
    }

    const [users] = await connection.query(
      `SELECT id, status
       FROM users
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [payment.user_id]
    );
    if (!users.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'User not found' });
    }
    if (users[0].status === 'suspended') {
      await markPaymentState(connection, payment.id, 'failed', { callback: merged, verify: verifyResult.gatewayPayload, reason: 'user_suspended' }, refId || verifyResult.referenceId || null, verifyResult.gatewayTransactionId || null);
      await connection.commit();
      return res.status(403).json({ error: 'User suspended' });
    }

    const weeklyLimitCheck = await enforceWeeklyLimit(connection, payment.user_id, Number(payment.amount));
    if (!weeklyLimitCheck.ok) {
      await markPaymentState(connection, payment.id, 'failed', { callback: merged, verify: verifyResult.gatewayPayload, reason: 'weekly_limit' }, refId || verifyResult.referenceId || null, verifyResult.gatewayTransactionId || null);
      await connection.commit();
      return replyCallback(req, res, {
        success: false,
        transactionId: String(payment.id),
        status: 'failed',
        message: weeklyLimitCheck.message
      });
    }

    const referenceId = refId || verifyResult.referenceId || '';
    const trackingNumber = makeWalletTrackingNumber(referenceId);

    await connection.query(
      'UPDATE users SET balance = balance + ? WHERE id = ?',
      [Number(payment.amount), payment.user_id]
    );
    await connection.query(
      `INSERT INTO transactions (user_id, amount, type, title, tracking_number)
       VALUES (?, ?, 'deposit', ?, ?)`,
      [payment.user_id, Number(payment.amount), 'شارژ کیف پول (پرداخت آنلاین)', trackingNumber]
    );
    await connection.query(
      `UPDATE payment_transactions
       SET status = 'success',
           gateway_transaction_id = COALESCE(?, gateway_transaction_id),
           reference_id = COALESCE(?, reference_id),
           callback_payload = ?,
           verified_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [verifyResult.gatewayTransactionId || null, referenceId || null, toSafeJson({ callback: merged, verify: verifyResult.gatewayPayload }), payment.id]
    );

    await connection.commit();
    await auditLog(db, req, 'wallet.topup.applied', 'payment_transaction', payment.id, {
      userId: payment.user_id,
      amountRial: Number(payment.amount),
      trackingNumber
    });
    await auditLog(db, req, 'payment.verify.success', 'payment_transaction', payment.id, {
      referenceId: referenceId || null
    });

    return replyCallback(req, res, {
      success: true,
      transactionId: String(payment.id),
      status: 'success',
      message: callbackResponseMessage('success'),
      referenceId: referenceId || null
    });
  } catch (error) {
    await connection.rollback();
    console.error('Topup callback failed:', error);
    await auditLog(db, req, 'payment.callback.failed', 'payment_transaction', transactionId || null, {
      message: String(error?.message || 'unknown')
    });
    return res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

export const handleTopUpStatus = async (req, res) => {
  if (!(await ensurePaymentAvailable(req, res, 'status'))) return;
  const txId = Number(req.params.transactionId);
  if (!Number.isFinite(txId)) return res.status(400).json({ error: 'Invalid ID' });
  if (!req.auth?.studentId) return res.status(400).json({ error: 'student_id required' });

  try {
    const [rows] = await db.query(
      `SELECT pt.id, pt.status, pt.reference_id, pt.verified_at, pt.created_at, pt.updated_at
       FROM payment_transactions pt
       JOIN users u ON u.id = pt.user_id
       WHERE pt.id = ? AND u.student_id = ?
       LIMIT 1`,
      [txId, req.auth.studentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Invalid ID' });
    const row = rows[0];
    res.json({
      transactionId: String(row.id),
      status: toClientTopupStatus(row.status),
      message: callbackResponseMessage(toClientTopupStatus(row.status)),
      referenceId: row.reference_id || null,
      verifiedAt: row.verified_at || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (error) {
    console.error('Topup status failed:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleSupportTicket = (req, res) => {
  (async () => {
    try {
      const studentId = req.auth?.studentId;
      const title = String(req.body?.title || 'درخواست پشتیبانی').slice(0, 80);
      const message = String(req.body?.message || req.body?.description || 'ثبت درخواست پشتیبانی').slice(0, 4000);

      if (!studentId) {
        return res.json({ success: true, ticketId: `TKT-${Date.now()}`, message: 'SUPPORT_TICKET_CREATED' });
      }

      const [userRows] = await db.query('SELECT id, student_id FROM users WHERE student_id = ? LIMIT 1', [studentId]);
      const user = userRows?.[0];
      if (!user) {
        return res.json({ success: true, ticketId: `TKT-${Date.now()}`, message: 'SUPPORT_TICKET_CREATED' });
      }

      const [ticketResult] = await db.query(
        `INSERT INTO support_tickets (user_id, title, status, storage_path)
         VALUES (?, ?, 'open', '')`,
        [user.id, title]
      );
      const ticketId = ticketResult.insertId;
      await db.query(
        `INSERT INTO support_ticket_messages (ticket_id, sender_role, sender_id, message)
         VALUES (?, 'user', ?, ?)`,
        [ticketId, user.student_id, message]
      );
      await db.query(
        `INSERT INTO support_ticket_status_history (ticket_id, from_status, to_status, actor_role, actor_id, note)
         VALUES (?, NULL, 'open', 'user', ?, NULL)`,
        [ticketId, user.student_id]
      );

      res.json({
        success: true,
        ticketId: `TKT-${ticketId}`,
        message: 'SUPPORT_TICKET_CREATED'
      });
    } catch {
      res.json({ success: true, ticketId: `TKT-${Date.now()}`, message: 'SUPPORT_TICKET_CREATED' });
    }
  })();
};
