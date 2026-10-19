import { normalizeDigits } from '../validation.js';

export const serviceDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(date);

export const normalizeQrPayload = (input) => {
  if (typeof input !== 'string' && typeof input !== 'number') return '';
  const raw = normalizeDigits(input).trim();
  if (!raw || raw.length > 2048) return '';
  let candidate = raw;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') candidate = parsed;
    else if (parsed && typeof parsed === 'object') {
      candidate = parsed.qrCode || parsed.qr || parsed.validationCode || parsed.validation_code || parsed.code || parsed.value || '';
    }
  } catch {
    // Plain QR tokens and URL payloads are supported for existing tickets.
  }
  if (candidate === raw && raw.includes('=')) {
    const params = new URLSearchParams(raw.includes('?') ? raw.slice(raw.indexOf('?') + 1).split('#')[0] : raw);
    candidate = params.get('qrCode') || params.get('qr') || params.get('validationCode') || params.get('validation_code') || params.get('code') || params.get('value') || raw;
  }
  if (typeof candidate !== 'string' && typeof candidate !== 'number') return '';
  const value = normalizeDigits(candidate).trim();
  return value.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value) ? value : '';
};

export const mapScan = (row, count = 1) => ({
  id: row.id,
  ticketId: String(row.ticket_id),
  qrCode: row.qr_code,
  validationCode: row.validation_code,
  passengerName: row.passenger_name,
  amount: Math.round(Number(row.price_paid || 0) / 10),
  scannedAt: row.scanned_at,
  method: row.scan_method,
  count
});

export const scanTicket = async (pool, { driverId, value, method }) => {
  const field = /^\d{4}$/.test(value) ? 'validation_code' : 'qr_code';
  const connection = await pool.getConnection();
  const day = serviceDate();
  const reject = async (status, error) => {
    await connection.rollback();
    return { status, payload: { error } };
  };
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.beginTransaction();
    const [drivers] = await connection.query('SELECT id, status FROM drivers WHERE id = ? LIMIT 1', [driverId]);
    if (!drivers.length || drivers[0].status !== 'active') return await reject(403, 'حساب راننده فعال نیست.');
    const [stations] = await connection.query('SELECT station_id FROM driver_station_assignments WHERE driver_id = ?', [driverId]);
    const stationIds = new Set(stations.map(row => Number(row.station_id)));

    // Lock the tickets, including shared QR purchases, before testing/recording scans.
    const [locked] = await connection.query(`SELECT id FROM tickets WHERE ${field} = ? ORDER BY id FOR UPDATE`, [value]);
    if (!locked.length) return await reject(404, 'کد بلیط یافت نشد.');

    const [candidates] = await connection.query(
      `SELECT t.id, t.user_id, t.bus_id, t.qr_code, t.validation_code, t.price_paid, t.status,
              DATE_FORMAT(t.created_at, '%Y-%m-%d') AS service_date, u.name AS passenger_name,
              COALESCE(b.driver_id, sc.driver_id) AS driver_id, COALESCE(b.origin_station_id, sc.origin_station_id) AS origin_station_id,
              COALESCE(b.destination_station_id, sc.destination_station_id) AS destination_station_id
       FROM tickets t JOIN users u ON u.id = t.user_id JOIN buses b ON b.id = t.bus_id
       LEFT JOIN schedules sc ON sc.id = b.schedule_id
       WHERE t.id IN (${locked.map(() => '?').join(',')}) ORDER BY t.id`, locked.map(row => row.id)
    );
    if (!candidates.length) return await reject(404, 'کد بلیط یافت نشد.');
    const covered = candidates.filter(ticket => Number(ticket.driver_id) === driverId ||
      [ticket.origin_station_id, ticket.destination_station_id].some(id => id != null && stationIds.has(Number(id))));
    if (!covered.length) return await reject(403, 'این بلیط برای سرویس یا ایستگاه تحت پوشش شما نیست.');
    const active = covered.filter(ticket => ticket.status === 'active' && ticket.service_date === day);
    if (!active.length) return await reject(400, 'این بلیط لغو شده یا اعتبار روز سفر آن به پایان رسیده است.');
    if (new Set(active.map(ticket => `${ticket.qr_code}:${ticket.user_id}:${ticket.bus_id}`)).size > 1) {
      return await reject(409, 'این کد دستی با چند بلیط تطبیق دارد؛ لطفاً QR بلیط را اسکن کنید.');
    }
    const ids = active.map(ticket => ticket.id);
    const [scans] = await connection.query(`SELECT id FROM ticket_scans WHERE ticket_id IN (${ids.map(() => '?').join(',')}) LIMIT 1`, ids);
    if (scans.length) return await reject(409, 'این بلیط قبلاً اسکن شده است.');
    let firstId;
    for (const ticket of active) {
      const [result] = await connection.query(
        `INSERT INTO ticket_scans (ticket_id, driver_id, scan_method, scanned_value, passenger_count, service_date)
         VALUES (?, ?, ?, ?, 1, ?)`, [ticket.id, driverId, method, value, day]
      );
      firstId ??= result.insertId;
    }
    const [rows] = await connection.query('SELECT scanned_at FROM ticket_scans WHERE id = ?', [firstId]);
    const scan = mapScan({
      ...active[0], id: firstId, ticket_id: active[0].id, scan_method: method,
      scanned_at: rows[0].scanned_at,
      price_paid: active.reduce((sum, ticket) => sum + Number(ticket.price_paid), 0)
    }, active.length);
    await connection.commit();
    return { status: 201, payload: { success: true, scan } };
  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') return { status: 409, payload: { error: 'این بلیط قبلاً اسکن شده است.' } };
    throw error;
  } finally {
    connection.release();
  }
};
