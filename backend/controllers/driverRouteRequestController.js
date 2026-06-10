import { db } from '../db.js';
import { auditLog } from '../security.js';
import { parsePositiveInt, parseTime } from '../validation.js';

const toToman = (rial) => Math.round(Number(rial || 0) / 10);
const toRial = (toman) => Math.round(Number(toman || 0) * 10);

const mapRequest = (row) => ({
  id: row.id.toString(),
  driverId: row.driver_id?.toString(),
  driverName: row.driver_name,
  licensePlate: row.license_plate,
  originStationId: row.origin_station_id?.toString(),
  destinationStationId: row.destination_station_id?.toString(),
  originName: row.origin_name,
  destinationName: row.destination_name,
  departureTime: row.departure_time?.toString().slice(0, 5) || '',
  price: toToman(row.price),
  status: row.status,
  adminNote: row.admin_note || '',
  approvedScheduleId: row.approved_schedule_id ? row.approved_schedule_id.toString() : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const handleDriverCreateRouteRequest = async (req, res) => {
  const driverId = Number(req.auth?.driverId);
  if (!Number.isFinite(driverId)) return res.status(400).json({ error: 'Invalid driver id' });

  const originValidation = parsePositiveInt(req.body?.originStationId, { error: 'INVALID_STATION_IDS' });
  const destValidation = parsePositiveInt(req.body?.destinationStationId, { error: 'INVALID_STATION_IDS' });
  const timeValidation = parseTime(req.body?.departureTime);
  const priceValidation = parsePositiveInt(req.body?.priceToman, { min: 1000, max: 50000000, error: 'INVALID_AMOUNT' });

  if (!originValidation.ok || !destValidation.ok) return res.status(400).json({ error: 'INVALID_STATION_IDS' });
  if (!timeValidation.ok) return res.status(400).json({ error: timeValidation.error });
  if (!priceValidation.ok) return res.status(400).json({ error: priceValidation.error });
  if (originValidation.value === destValidation.value) return res.status(400).json({ error: 'مسیر نامعتبر است.' });

  const stationIds = Array.isArray(req.body?.stationIds) ? req.body.stationIds : [];

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [driverRows] = await connection.query('SELECT id, status FROM drivers WHERE id = ? LIMIT 1 FOR UPDATE', [driverId]);
    if (!driverRows.length) { await connection.rollback(); return res.status(404).json({ error: 'Driver not found' }); }
    if (driverRows[0].status !== 'active') { await connection.rollback(); return res.status(403).json({ error: 'حساب کاربری شما غیرفعال است' }); }

    // Validate stations exist & active
    const [stations] = await connection.query(
      'SELECT id, is_active FROM stations WHERE id IN (?, ?) LIMIT 2',
      [originValidation.value, destValidation.value]
    );
    if (stations.length < 2 || stations.some(s => !s.is_active)) {
      await connection.rollback();
      return res.status(400).json({ error: 'Station not found' });
    }

    // Prevent duplicates: existing schedule or pending request with same key
    const [dupSchedule] = await connection.query(
      `SELECT id FROM schedules WHERE driver_id=? AND origin_station_id=? AND destination_station_id=? AND departure_time=? LIMIT 1`,
      [driverId, originValidation.value, destValidation.value, timeValidation.value]
    );
    if (dupSchedule.length) { await connection.rollback(); return res.status(409).json({ error: 'مسیر تکراری است.' }); }

    const [dupReq] = await connection.query(
      `SELECT id FROM driver_route_requests
       WHERE driver_id=? AND origin_station_id=? AND destination_station_id=? AND departure_time=?
         AND status='pending' LIMIT 1`,
      [driverId, originValidation.value, destValidation.value, timeValidation.value]
    );
    if (dupReq.length) { await connection.rollback(); return res.status(409).json({ error: 'درخواست مشابه قبلاً ثبت شده است.' }); }

    const rialPrice = toRial(priceValidation.value);
    const [result] = await connection.query(
      `INSERT INTO driver_route_requests (driver_id, origin_station_id, destination_station_id, departure_time, price, station_ids, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [driverId, originValidation.value, destValidation.value, timeValidation.value, rialPrice, JSON.stringify(stationIds)]
    );
    await connection.commit();
    await auditLog(db, req, 'driver.route_request_create', 'driver_route_request', result.insertId, {
      originStationId: originValidation.value,
      destinationStationId: destValidation.value,
      departureTime: timeValidation.value,
      priceRial: rialPrice
    });
    res.status(201).json({ success: true, id: result.insertId.toString() });
  } catch (error) {
    await connection.rollback();
    console.error('Create route request error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

export const handleDriverListRouteRequests = async (req, res) => {
  const driverId = Number(req.auth?.driverId);
  if (!Number.isFinite(driverId)) return res.status(400).json({ error: 'Invalid driver id' });
  const [rows] = await db.query(
    `SELECT r.*, d.name AS driver_name, d.license_plate,
            o.name AS origin_name, ds.name AS destination_name
     FROM driver_route_requests r
     JOIN drivers d ON d.id = r.driver_id
     JOIN stations o ON o.id = r.origin_station_id
     JOIN stations ds ON ds.id = r.destination_station_id
     WHERE r.driver_id = ?
     ORDER BY r.id DESC
     LIMIT 200`,
    [driverId]
  );
  res.json(rows.map(mapRequest));
};

export const handleAdminListRouteRequests = async (req, res) => {
  const status = String(req.query.status || '').trim();
  const where = status ? 'WHERE r.status = ?' : 'WHERE 1=1';
  const params = status ? [status] : [];
  const [rows] = await db.query(
    `SELECT r.*, d.name AS driver_name, d.license_plate,
            o.name AS origin_name, ds.name AS destination_name
     FROM driver_route_requests r
     JOIN drivers d ON d.id = r.driver_id
     JOIN stations o ON o.id = r.origin_station_id
     JOIN stations ds ON ds.id = r.destination_station_id
     ${where}
     ORDER BY r.id DESC
     LIMIT 500`,
    params
  );
  res.json(rows.map(mapRequest));
};

export const handleAdminApproveRouteRequest = async (req, res) => {
  const requestId = Number(req.params.requestId);
  if (!Number.isFinite(requestId)) return res.status(400).json({ error: 'Invalid ID' });

  const originValidation = parsePositiveInt(req.body?.originStationId, { error: 'INVALID_STATION_IDS' });
  const destValidation = parsePositiveInt(req.body?.destinationStationId, { error: 'INVALID_STATION_IDS' });
  const timeValidation = parseTime(req.body?.departureTime);
  const priceValidation = parsePositiveInt(req.body?.priceToman, { min: 1000, max: 50000000, error: 'INVALID_AMOUNT' });
  const driverValidation = parsePositiveInt(req.body?.driverId, { min: 1, max: 999999999, error: 'INVALID_DRIVER_ID' });

  if (!originValidation.ok || !destValidation.ok) return res.status(400).json({ error: 'INVALID_STATION_IDS' });
  if (!timeValidation.ok) return res.status(400).json({ error: timeValidation.error });
  if (!priceValidation.ok) return res.status(400).json({ error: priceValidation.error });
  if (!driverValidation.ok) return res.status(400).json({ error: driverValidation.error });
  if (originValidation.value === destValidation.value) return res.status(400).json({ error: 'مسیر نامعتبر است.' });

  const adminNote = String(req.body?.adminNote || '').slice(0, 255);
  const rialPrice = toRial(priceValidation.value);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT * FROM driver_route_requests WHERE id = ? LIMIT 1 FOR UPDATE`,
      [requestId]
    );
    if (!rows.length) { await connection.rollback(); return res.status(404).json({ error: 'درخواست یافت نشد' }); }
    const reqRow = rows[0];
    if (reqRow.status !== 'pending') { await connection.rollback(); return res.status(400).json({ error: 'این درخواست قابل تایید نیست' }); }

    // Prevent duplicates
    const [dupSchedule] = await connection.query(
      `SELECT id FROM schedules WHERE driver_id=? AND origin_station_id=? AND destination_station_id=? AND departure_time=? LIMIT 1`,
      [driverValidation.value, originValidation.value, destValidation.value, timeValidation.value]
    );
    if (dupSchedule.length) { await connection.rollback(); return res.status(409).json({ error: 'برنامه سرویس تکراری است.' }); }

    const [schedResult] = await connection.query(
      `INSERT INTO schedules (driver_id, origin_station_id, destination_station_id, departure_time, price, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [driverValidation.value, originValidation.value, destValidation.value, timeValidation.value, rialPrice]
    );
    const scheduleId = schedResult.insertId;

    await connection.query(
      `UPDATE driver_route_requests
       SET status='approved', admin_note=?, approved_schedule_id=?
       WHERE id=?`,
      [adminNote || null, scheduleId, requestId]
    );

    await connection.commit();
    await auditLog(db, req, 'admin.route_request_approve', 'driver_route_request', requestId, {
      scheduleId,
      driverId: driverValidation.value,
      originStationId: originValidation.value,
      destinationStationId: destValidation.value,
      departureTime: timeValidation.value,
      priceRial: rialPrice
    });

    res.json({ success: true, scheduleId: scheduleId.toString() });
  } catch (error) {
    await connection.rollback();
    console.error('Approve route request error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

export const handleAdminRejectRouteRequest = async (req, res) => {
  const requestId = Number(req.params.requestId);
  if (!Number.isFinite(requestId)) return res.status(400).json({ error: 'Invalid ID' });
  const adminNote = String(req.body?.adminNote || '').slice(0, 255);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT status FROM driver_route_requests WHERE id=? LIMIT 1 FOR UPDATE', [requestId]);
    if (!rows.length) { await connection.rollback(); return res.status(404).json({ error: 'درخواست یافت نشد' }); }
    if (rows[0].status !== 'pending') { await connection.rollback(); return res.status(400).json({ error: 'این درخواست قابل رد نیست' }); }

    await connection.query(`UPDATE driver_route_requests SET status='rejected', admin_note=? WHERE id=?`, [adminNote || null, requestId]);
    await connection.commit();
    await auditLog(db, req, 'admin.route_request_reject', 'driver_route_request', requestId, { adminNote });
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Reject route request error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

