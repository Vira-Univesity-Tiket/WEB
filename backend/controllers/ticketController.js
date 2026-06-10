
import crypto from 'crypto';
import { db } from '../db.js';
import { auditLog } from '../security.js';
import { parsePositiveInt, parseTime, rejectUnexpectedFields } from '../validation.js';

const normalizeTime = (timeStr) => {
  if (!timeStr) return '00:00:00';
  if (timeStr.length === 5) return `${timeStr}:00`;
  return timeStr;
};

// Converted to Toman (divide by 10)
const formatToman = (value) => `${Math.round(Number(value || 0) / 10).toLocaleString('fa-IR')} تومان`;

const mapTicketForUi = (row) => ({
  id: row.id.toString(),
  origin: row.origin,
  destination: row.destination,
  date: new Date(row.created_at).toLocaleDateString('fa-IR'),
  time: row.departure_time?.toString().slice(0, 5) || '',
  busNumber: row.bus_number,
  seatNumber: row.seat_number,
  price: formatToman(row.price_paid),
  status: row.status,
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

const generateValidationCode = () => String(Math.floor(1000 + Math.random() * 9000));

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
  const quantityValidation = parsePositiveInt(seatCount || 1, {
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

  const connection = await db.getConnection();
  try {
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
    const depTime = timeValidation.value;
    const [scheduleRows] = await connection.query(
      `SELECT s.id, s.price, d.capacity, d.name AS driver_name, d.license_plate,
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
      'SELECT id, remaining_seats, total_seats FROM buses WHERE schedule_id = ? AND origin_station_id = ? AND destination_station_id = ? AND departure_time = ? AND price = ? AND DATE(created_at) = CURDATE() LIMIT 1 FOR UPDATE',
      [scheduleValidation.value, originValidation.value, destinationValidation.value, depTime, numericPriceRial]
    );

    let busId;
    let totalSeats = 30; // Fallback default

    if (existingBus.length > 0) {
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
        `INSERT INTO buses (schedule_id, origin_station_id, destination_station_id, bus_number, origin, destination, departure_time, price, total_seats, remaining_seats)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [scheduleValidation.value, originValidation.value, destinationValidation.value, busNumber, originName, destinationName, depTime, numericPriceRial, totalSeats, totalSeats]
      );
      busId = busInsert.insertId;
    }

    // --- OPTIMIZED BATCH SEAT ALLOCATION ---
    const [occupiedRows] = await connection.query(
      'SELECT seat_number FROM tickets WHERE bus_id = ? AND status = ?',
      [busId, 'active']
    );
    
    const occupiedSeats = new Set(occupiedRows.map(r => Number(r.seat_number)));
    const createdTicketIds = [];
    
    if (occupiedSeats.size + quantity > totalSeats) {
        await connection.rollback();
        return res.status(400).json({ error: 'ظرفیت تکمیل است' });
    }

    const sharedQrCode = `QR-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const sharedValidationCode = generateValidationCode();

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
          `INSERT INTO tickets (user_id, bus_id, seat_number, price_paid, status, qr_code, validation_code)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [user.id, busId, seatNumber, numericPriceRial, 'active', sharedQrCode, sharedValidationCode]
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

    await connection.commit();
    await auditLog(db, req, 'ticket.reserve', 'ticket', createdTicketIds.join(','), {
      studentId: student_id,
      quantity,
      amount: totalPriceRial,
      busNumber,
      scheduleId: scheduleValidation.value
    });

    const ticketPlaceholders = createdTicketIds.map(() => '?').join(',');
    const [ticketRows] = await connection.query(
      `SELECT t.id, t.seat_number, t.price_paid, t.status, t.qr_code, t.validation_code, t.created_at,
              b.bus_number, b.origin, b.destination, b.departure_time
       FROM tickets t
       JOIN buses b ON b.id = t.bus_id
       WHERE t.id IN (${ticketPlaceholders})`,
      createdTicketIds
    );

    const [balanceRows] = await connection.query('SELECT balance FROM users WHERE id = ? LIMIT 1', [user.id]);
    const [txRows] = await connection.query('SELECT * FROM transactions WHERE id = ? LIMIT 1', [txInsert.insertId]);

    res.json({
      success: true,
      balance: Number(balanceRows?.[0]?.balance || currentBalance - totalPriceRial),
      tickets: ticketRows.map(mapTicketForUi),
      ticket: mapTicketForUi(ticketRows[0]),
      transaction: mapTransactionForUi(txRows[0])
    });
  } catch (error) {
    await connection.rollback();
    console.error('Reserve Ticket Critical Error:', error);
    
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
              b.bus_number, b.origin, b.destination, b.departure_time
       FROM tickets t
       JOIN users u ON u.id = t.user_id
       JOIN buses b ON b.id = t.bus_id
       WHERE u.student_id = ?
       ORDER BY t.id DESC`,
      [studentId]
    );

    res.json(rows.map(mapTicketForUi));
  } catch (error) {
    console.error('Get tickets failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};
