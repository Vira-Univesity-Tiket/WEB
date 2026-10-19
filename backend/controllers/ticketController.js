import { logError } from '../logging.js';

import crypto from 'crypto';
import { db } from '../db.js';
import { auditLog } from '../security.js';
import { parsePositiveInt, parseTime, rejectUnexpectedFields } from '../validation.js';

import { serviceDate } from '../services/ticketScanService.js';

const normalizeTime = (timeStr) => {
  if (!timeStr) return '00:00:00';
  if (timeStr.length === 5) return `${timeStr}:00`;
  return timeStr;
};

// Converted to Toman (divide by 10)
const formatToman = (value) => `${Math.round(Number(value || 0) / 10).toLocaleString('fa-IR')} تومان`;

export const mapTicketForUi = (row) => ({
  id: row.id.toString(),
  origin: row.origin,
  destination: row.destination,
  date: new Date(row.created_at).toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' }),
  time: row.departure_time?.toString().slice(0, 5) || '',
  busNumber: row.bus_number,
  seatNumber: row.seat_number,
  price: formatToman(row.price_paid),
  status: row.status === 'active' && (row.boarded_at || serviceDate(new Date(row.created_at)) !== serviceDate()) ? 'expired' : row.status,
  boardedAt: row.boarded_at || null,
  passengerCount: Number(row.passenger_count || 1),
  feedbackRating: row.feedback_rating || null,
  feedbackComment: row.feedback_comment || '',
  feedbackStatus: row.feedback_status || 'pending',
  qrCode: row.qr_code,
  validationCode: row.validation_code
});

const mapTransactionForUi = (row) => {
  const createdAt = row.created_at ? new Date(row.created_at) : new Date();
  return {
    id: row.id?.toString() ?? `TX-${Date.now()}`,
    title: row.title,
    amount: Math.round(Number(row.amount || 0) / 10), // Toman
    type: row.type,
    date: createdAt.toLocaleDateString('fa-IR'),
    time: createdAt.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    trackingNumber: row.tracking_number
  };
};

const generateValidationCode = async (connection, day) => {
  // A single row lock serializes code allocation across schedules; shared seats keep one code.
  await connection.query("INSERT IGNORE INTO settings (setting_key, setting_value) VALUES ('ticket_code_lock', '1')");
  await connection.query("SELECT setting_value FROM settings WHERE setting_key = 'ticket_code_lock' FOR UPDATE");
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const code = String(crypto.randomInt(1000, 10000));
    const [rows] = await connection.query('SELECT id FROM tickets WHERE validation_code = ? AND DATE(created_at) = ? LIMIT 1 FOR UPDATE', [code, day]);
    if (!rows.length) return code;
  }
  throw new Error('No validation code available');
};

export const handleReserveTicket = async (req, res) => {
  const fieldsValidation = rejectUnexpectedFields(req.body, [
    'authToken',
    'student_id',
    'schedule_id',
    'scheduleId',
    'origin_station_id',
    'originStationId',
    'destination_station_id',
    'destinationStationId',
    'origin',
    'destination',
    'departure_time',
    'seatCount'
  ]);
  if (!fieldsValidation.ok) return res.status(400).json({ error: fieldsValidation.error });

  const {
    schedule_id,
    scheduleId,
    origin_station_id,
    originStationId,
    destination_station_id,
    destinationStationId,
    departure_time,
    seatCount
  } = req.body;
  const student_id = req.auth?.studentId || req.body.student_id;
  const quantityValidation = parsePositiveInt(seatCount ?? 1, {
    min: 1,
    max: Number(process.env.MAX_TICKET_SEATS_PER_PURCHASE || 6),
    error: 'SEAT_LIMIT'
  });
  if (!quantityValidation.ok) return res.status(400).json({ error: quantityValidation.error });
  const quantity = quantityValidation.value;

  if (!student_id) return res.status(400).json({ error: 'student_id required' });
  const scheduleValidation = parsePositiveInt(schedule_id || scheduleId, { error: 'SCHEDULE_NOT_FOUND' });
  const originValidation = parsePositiveInt(origin_station_id || originStationId || req.body.origin, { error: 'INVALID_STATION_IDS' });
  const destinationValidation = parsePositiveInt(destination_station_id || destinationStationId || req.body.destination, { error: 'INVALID_STATION_IDS' });
  const timeValidation = parseTime(departure_time);
  if (!scheduleValidation.ok || !originValidation.ok || !destinationValidation.ok || !timeValidation.ok) {
    return res.status(400).json({ error: 'origin, destination, departure_time, bus_number required' });
  }

  const purchaseTime = new Date();
  const purchaseDay = serviceDate(purchaseTime);
  const requestKey = req.get('idempotency-key') || crypto.randomUUID();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(requestKey)) return res.status(400).json({ error: 'شناسه درخواست معتبر نیست.' });
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify([scheduleValidation.value, originValidation.value, destinationValidation.value, timeValidation.value, quantity])).digest('hex');
  const connection = await db.getConnection();
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.beginTransaction();

    const [users] = await connection.query(
      "SELECT id, balance, status FROM users WHERE student_id = ? LIMIT 1 FOR UPDATE",
      [student_id]
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
    const [previous] = await connection.query('SELECT payload_hash, response FROM ticket_purchase_requests WHERE user_id = ? AND request_key = ?', [user.id, requestKey]);
    if (previous.length) {
      await connection.rollback();
      if (previous[0].payload_hash !== payloadHash) return res.status(409).json({ error: 'شناسه این درخواست برای خرید دیگری استفاده شده است.' });
      return res.json(typeof previous[0].response === 'string' ? JSON.parse(previous[0].response) : previous[0].response);
    }
    const depTime = timeValidation.value;
    await connection.query('SELECT id FROM schedules WHERE id = ? FOR UPDATE', [scheduleValidation.value]);
    const [scheduleRows] = await connection.query(
      `SELECT s.id, s.driver_id, s.price, d.capacity, d.name AS driver_name, d.license_plate,
              o.id AS origin_id, o.name AS origin_name, o.is_active AS origin_active,
              ds.id AS destination_id, ds.name AS destination_name, ds.is_active AS destination_active
       FROM schedules s
       JOIN stations o ON o.id = s.origin_station_id
       JOIN stations ds ON ds.id = s.destination_station_id
       JOIN drivers d ON d.id = s.driver_id
       WHERE s.status = 'active'
         AND d.status = 'active'
         AND s.id = ?
         AND s.origin_station_id = ?
         AND s.destination_station_id = ?
         AND s.departure_time = ?
       LIMIT 1`,
      [scheduleValidation.value, originValidation.value, destinationValidation.value, depTime]
    );

    if (!scheduleRows.length) {
      await connection.rollback();
      return res.status(400).json({ error: 'Invalid bus schedule' });
    }
    if (!scheduleRows[0].origin_active || !scheduleRows[0].destination_active) {
      await connection.rollback();
      return res.status(400).json({ error: 'INACTIVE_STATION' });
    }

    const numericPriceRial = Number(scheduleRows[0].price);
    const totalPriceRial = numericPriceRial * quantity;
    if (!Number.isFinite(numericPriceRial) || numericPriceRial <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Invalid schedule price' });
    }

    const currentBalance = Number(user.balance || 0);
    if (currentBalance < totalPriceRial) {
      await connection.rollback();
      return res.status(400).json({ error: 'موجودی کافی نیست' });
    }

    // Check existing bus FOR TODAY
    const originName = scheduleRows[0].origin_name;
    const destinationName = scheduleRows[0].destination_name;
    const busNumber = `${scheduleRows[0].driver_name} - ${scheduleRows[0].license_plate}`;

    const [existingBus] = await connection.query(
      'SELECT id, driver_id, remaining_seats, total_seats FROM buses WHERE schedule_id = ? AND origin_station_id = ? AND destination_station_id = ? AND departure_time = ? AND DATE(created_at) = ? LIMIT 1 FOR UPDATE',
      [scheduleValidation.value, originValidation.value, destinationValidation.value, depTime, purchaseDay]
    );

    let busId;
    let totalSeats = 30; // Fallback default

    if (existingBus.length > 0) {
      if (existingBus[0].driver_id != null && Number(existingBus[0].driver_id) !== Number(scheduleRows[0].driver_id)) {
        await connection.rollback();
        return res.status(409).json({ error: 'راننده این سرویس تغییر کرده است؛ برنامه جدیدی انتخاب کنید.' });
      }
      busId = existingBus[0].id;
      totalSeats = Number(existingBus[0].total_seats || 30);
      if (existingBus[0].remaining_seats < quantity) {
         await connection.rollback();
         return res.status(400).json({ error: 'ظرفیت تکمیل است' });
      }
    } else {
      // Find Driver Capacity based on bus_number string
      totalSeats = Number(scheduleRows[0].capacity) || 30;

      const [busInsert] = await connection.query(
        `INSERT INTO buses (schedule_id, driver_id, origin_station_id, destination_station_id, bus_number, origin, destination, departure_time, price, total_seats, remaining_seats, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [scheduleValidation.value, scheduleRows[0].driver_id, originValidation.value, destinationValidation.value, busNumber, originName, destinationName, depTime, numericPriceRial, totalSeats, totalSeats, purchaseTime]
      );
      busId = busInsert.insertId;
    }

    // --- OPTIMIZED BATCH SEAT ALLOCATION ---
    const [occupiedRows] = await connection.query(
      "SELECT seat_number FROM tickets WHERE bus_id = ? AND status <> 'cancelled'",
      [busId]
    );
    
    const occupiedSeats = new Set(occupiedRows.map(r => Number(r.seat_number)));
    const createdTicketIds = [];
    
    if (occupiedSeats.size + quantity > totalSeats) {
        await connection.rollback();
        return res.status(400).json({ error: 'ظرفیت تکمیل است' });
    }

    const sharedQrCode = `QR-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
    const sharedValidationCode = await generateValidationCode(connection, purchaseDay);

    for (let i = 0; i < quantity; i++) {
        let seatNumber = 1;
        while (occupiedSeats.has(seatNumber)) {
            seatNumber++;
        }
        
        if (seatNumber > totalSeats) {
             throw new Error('Seat overflow during assignment'); 
        }

        occupiedSeats.add(seatNumber);

        const [ticketInsert] = await connection.query(
          `INSERT INTO tickets (user_id, bus_id, seat_number, price_paid, status, qr_code, validation_code, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [user.id, busId, seatNumber, numericPriceRial, 'active', sharedQrCode, sharedValidationCode, purchaseTime]
        );
        createdTicketIds.push(ticketInsert.insertId);
    }

    await connection.query('UPDATE buses SET remaining_seats = remaining_seats - ? WHERE id = ?', [quantity, busId]);
    await connection.query('UPDATE users SET balance = balance - ? WHERE id = ?', [totalPriceRial, user.id]);

    const trackingNumber = `TCK-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const [txInsert] = await connection.query(
      'INSERT INTO transactions (user_id, amount, type, title, tracking_number) VALUES (?, ?, ?, ?, ?)',
      [user.id, totalPriceRial, 'withdraw', `خرید ${quantity} بلیط اتوبوس`, trackingNumber]
    );

    const ticketPlaceholders = createdTicketIds.map(() => '?').join(',');
    const [ticketRows] = await connection.query(
      `SELECT t.id, t.seat_number, t.price_paid, t.status, t.qr_code, t.validation_code, t.created_at,
              (SELECT COUNT(*) FROM tickets grouped WHERE grouped.qr_code = t.qr_code AND grouped.user_id = t.user_id AND grouped.bus_id = t.bus_id AND grouped.status <> 'cancelled') AS passenger_count,
              (SELECT MIN(scanned_at) FROM ticket_scans WHERE ticket_id = t.id) AS boarded_at,
              f.rating AS feedback_rating, f.comment AS feedback_comment, f.status AS feedback_status,
              b.bus_number, b.origin, b.destination, b.departure_time
       FROM tickets t
       JOIN buses b ON b.id = t.bus_id
       LEFT JOIN ticket_feedback f ON f.ticket_id = t.id
       WHERE t.id IN (${ticketPlaceholders})`,
      createdTicketIds
    );

    const [balanceRows] = await connection.query('SELECT balance FROM users WHERE id = ? LIMIT 1', [user.id]);
    const [txRows] = await connection.query('SELECT * FROM transactions WHERE id = ? LIMIT 1', [txInsert.insertId]);

    const response = {
      success: true,
      balance: Number(balanceRows?.[0]?.balance || currentBalance - totalPriceRial),
      tickets: ticketRows.map(mapTicketForUi),
      ticket: mapTicketForUi(ticketRows[0]),
      transaction: mapTransactionForUi(txRows[0])
    };
    await connection.query('INSERT INTO ticket_purchase_requests (user_id, request_key, payload_hash, response) VALUES (?, ?, ?, ?)', [user.id, requestKey, payloadHash, JSON.stringify(response)]);
    await connection.commit();
    await auditLog(connection, req, 'ticket.reserve', 'ticket', createdTicketIds.join(','), {
      studentId: student_id,
      quantity,
      amount: totalPriceRial,
      busNumber,
      scheduleId: scheduleValidation.value
    });

    res.json(response);
  } catch (error) {
    await connection.rollback();
    console.error('Reserve ticket failed:', error.code || 'UNEXPECTED_ERROR');
    
    if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code)) return res.status(409).json({ error: 'درخواست هم‌زمان دیگری در حال پردازش است؛ دوباره تلاش کنید.' });
    if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'TICKET_DUPLICATE' });
    }
    res.status(500).json({ error: 'RESERVE_FAILED' });
  } finally {
    connection.release();
  }
};

export const handleGetTickets = async (req, res) => {
  const rawStudentId = req.query.student_id ?? req.body?.student_id;
  const requestedStudentId = Array.isArray(rawStudentId) ? rawStudentId[0] : rawStudentId;
  const studentId = req.auth?.role === 'user' ? req.auth.studentId : requestedStudentId;
  if (!studentId) return res.status(400).json({ error: 'student_id required' });
  if (req.auth?.role === 'user' && requestedStudentId && requestedStudentId !== req.auth.studentId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const [rows] = await db.query(
      `SELECT t.id, t.seat_number, t.price_paid, t.status, t.qr_code, t.validation_code, t.created_at,
              (SELECT COUNT(*) FROM tickets grouped WHERE grouped.qr_code = t.qr_code AND grouped.user_id = t.user_id AND grouped.bus_id = t.bus_id AND grouped.status <> 'cancelled') AS passenger_count,
              (SELECT MIN(scanned_at) FROM ticket_scans WHERE ticket_id = t.id) AS boarded_at,
              f.rating AS feedback_rating, f.comment AS feedback_comment, f.status AS feedback_status,
              b.bus_number, b.origin, b.destination, b.departure_time
       FROM tickets t
       JOIN users u ON u.id = t.user_id
       JOIN buses b ON b.id = t.bus_id
       LEFT JOIN ticket_feedback f ON f.ticket_id = t.id
       WHERE u.student_id = ?
       ORDER BY t.id DESC`,
      [studentId]
    );

    res.json(rows.map(mapTicketForUi));
  } catch (error) {
    logError('Get tickets failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};
