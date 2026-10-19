import { logError } from '../logging.js';

import { db } from '../db.js';
import { auditLog, hashPassword, isSafeText } from '../security.js';
import { parseCoordinate, parsePositiveInt, parseTime, sanitizeText, validateIranMobile } from '../validation.js';

const safeParse = (val) => {
  if (typeof val === 'object' && val !== null) return val;
  try { return JSON.parse(val); } catch { return {}; }
};

const mapStation = (row) => ({
  id: row.id.toString(),
  name: row.name,
  lat: Number(row.lat),
  lng: Number(row.lng),
  isActive: Boolean(row.is_active)
});

const mapDriver = (row) => ({
  id: row.id.toString(),
  name: row.name,
  username: row.username,
  licensePlate: row.license_plate,
  phone: row.phone || '',
  status: row.status,
  capacity: Number(row.capacity || 30),
  assignedStations: row.assigned_station_ids ? row.assigned_station_ids.split(',').filter(Boolean) : [],
  plateData: safeParse(row.plate_data),
  documents: safeParse(row.documents),
  nationalCode: row.national_code || null,
  updatedAt: row.updated_at || null,
  createdAt: row.created_at || null
});

const mapDriverRequest = (row) => ({
  id: row.id.toString(),
  name: row.name,
  nationalCode: row.national_code,
  birthDate: row.birth_date,
  phone: row.phone,
  licensePlate: row.license_plate,
  plateData: safeParse(row.plate_data), // JSON object safely parsed
  documents: safeParse(row.documents),   // JSON object safely parsed
  username: row.username,
  status: row.status,
  createdAt: row.created_at
});

const mapSchedule = (row) => ({
  id: row.id.toString(),
  driverId: row.driver_id.toString(),
  originStationId: row.origin_station_id.toString(),
  destinationStationId: row.destination_station_id.toString(),
  departureTime: row.departure_time?.toString().slice(0, 5) || '',
  price: Number(row.price),
  status: row.status
});

// --- STATIONS ---
export const handleGetStations = async (_req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM stations ORDER BY id DESC');
    res.json(rows.map(mapStation));
  } catch (error) {
    logError('Get stations failed', error);
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return res.json([]);
    }
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleCreateStation = async (req, res) => {
  const { name, lat, lng } = req.body;
  const stationName = sanitizeText(name, 120);
  const latitude = parseCoordinate(lat, { min: -90, max: 90 });
  const longitude = parseCoordinate(lng, { min: -180, max: 180 });

  if (!isSafeText(stationName, 120) || !latitude.ok || !longitude.ok) {
    return res.status(400).json({ error: 'name, lat and lng are required' });
  }

  try {
    const [result] = await db.query('INSERT INTO stations (name, lat, lng) VALUES (?, ?, ?)', [stationName, latitude.value, longitude.value]);
    const [rows] = await db.query('SELECT * FROM stations WHERE id = ?', [result.insertId]);
    await auditLog(db, req, 'admin.station_create', 'station', result.insertId, { name: stationName });
    res.status(201).json(mapStation(rows[0]));
  } catch (error) {
    logError('Create station failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleUpdateStation = async (req, res) => {
  const stationId = Number(req.params.stationId);
  const { name, lat, lng } = req.body;
  const stationName = sanitizeText(name, 120);
  const latitude = parseCoordinate(lat, { min: -90, max: 90 });
  const longitude = parseCoordinate(lng, { min: -180, max: 180 });
  if ((!Number.isSafeInteger(stationId) || stationId <= 0)) return res.status(400).json({ error: 'Invalid ID' });
  if (!isSafeText(stationName, 120) || !latitude.ok || !longitude.ok) {
    return res.status(400).json({ error: 'Invalid station data' });
  }

  try {
    await db.query('UPDATE stations SET name=?, lat=?, lng=? WHERE id=?', [stationName, latitude.value, longitude.value, stationId]);
    await auditLog(db, req, 'admin.station_update', 'station', stationId);
    res.json({ success: true });
  } catch (error) {
    logError('Update station failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleToggleStationStatus = async (req, res) => {
  const stationId = Number(req.params.stationId);
  try {
    await db.query('UPDATE stations SET is_active = !is_active WHERE id=?', [stationId]);
    const [rows] = await db.query('SELECT is_active FROM stations WHERE id=?', [stationId]);
    await auditLog(db, req, 'admin.station_toggle_status', 'station', stationId, { isActive: Boolean(rows[0]?.is_active) });
    res.json({ success: true, isActive: Boolean(rows[0]?.is_active) });
  } catch (error) {
    logError('Toggle station status failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleDeleteStation = async (req, res) => {
  const stationId = Number(req.params.stationId);
  if ((!Number.isSafeInteger(stationId) || stationId <= 0)) return res.status(400).json({ error: 'Invalid station id' });

  try {
    const [result] = await db.query('DELETE FROM stations WHERE id = ?', [stationId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Station not found' });
    await auditLog(db, req, 'admin.station_delete', 'station', stationId);
    res.json({ success: true });
  } catch (error) {
    logError('Delete station failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// --- DRIVERS ---
export const handleGetDrivers = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.*,
              GROUP_CONCAT(ds.station_id ORDER BY ds.station_id SEPARATOR ',') AS assigned_station_ids
       FROM drivers d
       LEFT JOIN driver_station_assignments ds ON ds.driver_id = d.id
       WHERE d.status != 'pending' AND d.status != 'rejected'
       GROUP BY d.id
       ORDER BY d.id DESC`
    );
    res.json(rows.map(mapDriver));
  } catch (error) {
    logError('Get drivers failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// NEW: Export Data for a single driver
export const handleGetDriverExportData = async (req, res) => {
  const driverId = Number(req.params.driverId);
  if ((!Number.isSafeInteger(driverId) || driverId <= 0)) return res.status(400).json({ error: 'Invalid ID' });

  try {
    // 1. Driver Basic Info
    const [driverRows] = await db.query(
        `SELECT d.name, d.license_plate, d.username, d.status, d.capacity, d.national_code
         FROM drivers d WHERE d.id = ?`, 
        [driverId]
    );
    if (!driverRows.length) return res.status(404).json({ error: 'Driver not found' });
    const driver = driverRows[0];

    // 2. Assigned Stations
    const [stationRows] = await db.query(
        `SELECT s.name FROM stations s 
         JOIN driver_station_assignments dsa ON dsa.station_id = s.id 
         WHERE dsa.driver_id = ?`, 
        [driverId]
    );
    const stations = stationRows.map(s => s.name).join('، ');

    // 3. Scan History (Detailed Rows)
    const [scanRows] = await db.query(
        `SELECT s.scanned_at, t.price_paid, u.name as passenger_name, s.scan_method, t.validation_code
         FROM ticket_scans s
         JOIN tickets t ON t.id = s.ticket_id
         JOIN users u ON u.id = t.user_id
         WHERE s.driver_id = ?
         ORDER BY s.scanned_at DESC`,
        [driverId]
    );

    // Calculate Totals
    const totalTrips = scanRows.length;
    const totalRevenueRial = scanRows.reduce((sum, row) => sum + Number(row.price_paid || 0), 0);
    const totalRevenueToman = Math.round(totalRevenueRial / 10);

    const exportData = [
        {
            section: 'summary',
            name: driver.name,
            plate: driver.license_plate,
            nationalCode: driver.national_code || '-',
            stations: stations,
            totalTrips: totalTrips,
            totalRevenue: totalRevenueToman
        },
        ...scanRows.map(row => ({
            section: 'detail',
            date: new Date(row.scanned_at).toLocaleDateString('fa-IR'),
            time: new Date(row.scanned_at).toLocaleTimeString('fa-IR'),
            passenger: row.passenger_name,
            price: Math.round(Number(row.price_paid)/10),
            method: row.scan_method === 'qr' ? 'QR' : 'کد دستی'
        }))
    ];

    res.json(exportData);
  } catch (error) {
    logError('Export Driver Data Error', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleCreateDriver = async (req, res) => {
  const { name, username, password, licensePlate, phone, capacity, assignedStations } = req.body;
  const normalizedUsername = String(username || '').trim();
  const normalizedPassword = String(password || '').trim();
  const normalizedName = sanitizeText(name, 100);
  const normalizedLicensePlate = sanitizeText(licensePlate, 30);
  const capacityValidation = parsePositiveInt(capacity ?? 30, { min: 1, max: 80, error: 'INVALID_CAPACITY' });
  const driverCapacity = capacityValidation.ok ? capacityValidation.value : 30;
  const phoneValidation = phone ? validateIranMobile(phone) : { ok: true, value: '' };
  const stations = Array.isArray(assignedStations) ? assignedStations : [];

  if (!normalizedName) {
    return res.status(400).json({ error: 'نام راننده الزامی است.' });
  }
  if (!normalizedLicensePlate) {
    return res.status(400).json({ error: 'پلاک راننده الزامی است.' });
  }
  if (!normalizedUsername) {
    return res.status(400).json({ error: 'نام کاربری راننده الزامی است.' });
  }
  if (!normalizedPassword) {
    return res.status(400).json({ error: 'رمز عبور راننده الزامی است.' });
  }
  if (!capacityValidation.ok) return res.status(400).json({ error: capacityValidation.error });
  if (!phoneValidation.ok) return res.status(400).json({ error: phoneValidation.error });
  const passwordHash = await hashPassword(normalizedPassword);

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [insertDriver] = await connection.query(
      `INSERT INTO drivers (name, username, password, license_plate, phone, capacity, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [normalizedName, normalizedUsername, passwordHash, normalizedLicensePlate, phoneValidation.value || '', driverCapacity]
    );

    const newDriverId = insertDriver.insertId;

    for (const stationIdRaw of stations) {
      const stationId = Number(stationIdRaw);
      if (Number.isFinite(stationId)) {
        await connection.query('INSERT INTO driver_station_assignments (driver_id, station_id) VALUES (?, ?)', [newDriverId, stationId]);
      }
    }

    await connection.commit();
    await auditLog(connection, req, 'admin.driver_create', 'driver', newDriverId, { username: normalizedUsername });

    const responseDriver = {
      id: newDriverId.toString(),
      name: normalizedName,
      username: normalizedUsername,
      licensePlate: normalizedLicensePlate,
      phone: phoneValidation.value || '',
      status: 'active',
      capacity: driverCapacity,
      assignedStations: stations.map(String)
    };

    res.status(201).json(responseDriver);
  } catch (error) {
    await connection.rollback();
    logError('Create driver failed', error);
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username or license plate already used' });
    if (error?.code === 'ER_BAD_FIELD_ERROR') return res.status(500).json({ error: 'DB Schema Error' });
    res.status(500).json({ error: 'Server error' });
  } finally {
    connection.release();
  }
};

export const handleUpdateDriver = async (req, res) => {
  const driverId = Number(req.params.driverId);
  const { name, username, licensePlate, phone, capacity, password, assignedStations } = req.body;
  const capacityValidation = parsePositiveInt(capacity ?? 30, { min: 1, max: 80, error: 'INVALID_CAPACITY' });
  const phoneValidation = phone ? validateIranMobile(phone) : { ok: true, value: '' };
  if ((!Number.isSafeInteger(driverId) || driverId <= 0)) return res.status(400).json({ error: 'Invalid ID' });
  if (!capacityValidation.ok) return res.status(400).json({ error: capacityValidation.error });
  if (!phoneValidation.ok) return res.status(400).json({ error: phoneValidation.error });

  const normalizedName = sanitizeText(name, 100);
  const normalizedUsername = sanitizeText(username, 50);
  const normalizedLicensePlate = sanitizeText(licensePlate, 30);
  if (!normalizedName || normalizedUsername.length < 3 || !normalizedLicensePlate) return res.status(400).json({ error: 'نام، نام کاربری و پلاک معتبر الزامی است.' });
  const hasStationPayload = Array.isArray(assignedStations);
  const stationIds = hasStationPayload ? assignedStations.map((item) => Number(item)).filter((item) => Number.isFinite(item)) : [];

  try {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const updates = ['name=?', 'username=?', 'license_plate=?', 'phone=?', 'capacity=?'];
      const values = [normalizedName, normalizedUsername, normalizedLicensePlate, phoneValidation.value || '', capacityValidation.value];
      if (password) {
        updates.push('password=?');
        values.push(await hashPassword(String(password).trim()));
      }
      values.push(driverId);
      await connection.query(`UPDATE drivers SET ${updates.join(', ')} WHERE id=?`, values);

      if (hasStationPayload) {
        await connection.query('DELETE FROM driver_station_assignments WHERE driver_id = ?', [driverId]);
        for (const stationId of stationIds) {
          await connection.query('INSERT IGNORE INTO driver_station_assignments (driver_id, station_id) VALUES (?, ?)', [driverId, stationId]);
        }
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    await auditLog(db, req, 'admin.driver_update', 'driver', driverId, { passwordReset: Boolean(password) });
    res.json({ success: true });
  } catch (error) {
    logError('Update driver failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleToggleDriverStatus = async (req, res) => {
  const driverId = Number(req.params.driverId);
  try {
    await db.query("UPDATE drivers SET status = IF(status='active', 'inactive', 'active') WHERE id=?", [driverId]);
    const [rows] = await db.query('SELECT status FROM drivers WHERE id=?', [driverId]);
    await auditLog(db, req, 'admin.driver_toggle_status', 'driver', driverId, { newStatus: rows[0]?.status });
    res.json({ success: true, newStatus: rows[0]?.status });
  } catch (error) {
    logError('Toggle driver failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleDeleteDriver = async (req, res) => {
  const driverId = Number(req.params.driverId);
  if ((!Number.isSafeInteger(driverId) || driverId <= 0)) return res.status(400).json({ error: 'Invalid driver id' });

  try {
    const [scheduleRows] = await db.query('SELECT COUNT(*) AS count FROM schedules WHERE driver_id = ?', [driverId]);
    const scheduleCount = Number(scheduleRows?.[0]?.count || 0);
    if (scheduleCount > 0) {
      return res.status(409).json({
        error: 'این راننده برنامه سرویس ثبت‌شده دارد و حذف کامل آن ممکن نیست. ابتدا برنامه‌ها را غیرفعال یا حذف کنید.'
      });
    }

    const [stationRows] = await db.query('SELECT COUNT(*) AS count FROM driver_station_assignments WHERE driver_id = ?', [driverId]);
    const stationCount = Number(stationRows?.[0]?.count || 0);
    if (stationCount > 0) {
      return res.status(409).json({
        error: 'این راننده هنوز ایستگاه مجاز دارد. ابتدا ایستگاه‌های مجاز را حذف کنید.'
      });
    }

    const [result] = await db.query('DELETE FROM drivers WHERE id = ?', [driverId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Driver not found' });
    await auditLog(db, req, 'admin.driver_delete', 'driver', driverId);
    res.json({ success: true });
  } catch (error) {
    logError('Delete driver failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// --- DRIVER REQUESTS ---
export const handleGetPendingDrivers = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM drivers WHERE status = 'pending' ORDER BY created_at ASC"
    );
    res.json(rows.map(mapDriverRequest));
  } catch (error) {
    logError('Get Pending Drivers Error', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleGetDriverRequestHistory = async (req, res) => {
  try {
    // History includes 'rejected' and 'active' (formerly pending) drivers
    // Note: This assumes current active drivers came through the request system.
    const [rows] = await db.query(
      "SELECT * FROM drivers WHERE status IN ('rejected', 'active', 'inactive') ORDER BY created_at DESC"
    );
    res.json(rows.map(mapDriverRequest));
  } catch (error) {
    logError('Get Driver Request History Error', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleApproveDriver = async (req, res) => {
  const driverId = Number(req.params.driverId);
  try {
    await db.query("UPDATE drivers SET status = 'active', rejection_reason = NULL WHERE id = ?", [driverId]);
    await auditLog(db, req, 'admin.driver_approve', 'driver', driverId);
    res.json({ success: true });
  } catch (error) {
    logError('Approve Driver Error', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleRejectDriver = async (req, res) => {
  const driverId = Number(req.params.driverId);
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'Rejection reason required' });

  try {
    await db.query("UPDATE drivers SET status = 'rejected', rejection_reason = ? WHERE id = ?", [reason, driverId]);
    await auditLog(db, req, 'admin.driver_reject', 'driver', driverId, { reason });
    res.json({ success: true });
  } catch (error) {
    logError('Reject Driver Error', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// --- SCHEDULES ---
export const handleGetSchedules = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM schedules ORDER BY id DESC`
    );
    res.json(rows.map(mapSchedule));
  } catch (error) {
    logError('Get schedules failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleCreateSchedule = async (req, res) => {
  const { driverId, originStationId, destinationStationId, departureTime, price } = req.body;
  const driver = parsePositiveInt(driverId, { error: 'INVALID_DRIVER_ID' });
  const origin = parsePositiveInt(originStationId, { error: 'INVALID_STATION_ID' });
  const destination = parsePositiveInt(destinationStationId, { error: 'INVALID_STATION_ID' });
  const time = parseTime(departureTime);
  const normalizedPrice = parsePositiveInt(price, { min: 1000, max: 100000000, error: 'INVALID_PRICE' });

  if (!driverId || !originStationId || !destinationStationId || !departureTime) {
    return res.status(400).json({ error: 'Required fields missing' });
  }
  if (!driver.ok) return res.status(400).json({ error: driver.error });
  if (!origin.ok || !destination.ok) return res.status(400).json({ error: 'INVALID_STATION_IDS' });
  if (!time.ok) return res.status(400).json({ error: time.error });
  if (!normalizedPrice.ok) return res.status(400).json({ error: normalizedPrice.error });

  try {
    const [result] = await db.query(
      `INSERT INTO schedules (driver_id, origin_station_id, destination_station_id, departure_time, price, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [driver.value, origin.value, destination.value, time.value, normalizedPrice.value]
    );
    const [rows] = await db.query('SELECT * FROM schedules WHERE id = ?', [result.insertId]);
    await auditLog(db, req, 'admin.schedule_create', 'schedule', result.insertId);
    res.status(201).json(mapSchedule(rows[0]));
  } catch (error) {
    logError('Create schedule failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleUpdateSchedule = async (req, res) => {
  const scheduleId = Number(req.params.scheduleId);
  const { driverId, originStationId, destinationStationId, departureTime, price } = req.body;
  const driver = parsePositiveInt(driverId, { error: 'INVALID_DRIVER_ID' });
  const origin = parsePositiveInt(originStationId, { error: 'INVALID_STATION_ID' });
  const destination = parsePositiveInt(destinationStationId, { error: 'INVALID_STATION_ID' });
  const time = parseTime(departureTime);
  const normalizedPrice = parsePositiveInt(price, { min: 1000, max: 100000000, error: 'INVALID_PRICE' });
  if ((!Number.isSafeInteger(scheduleId) || scheduleId <= 0)) return res.status(400).json({ error: 'Invalid ID' });
  if (!driver.ok) return res.status(400).json({ error: driver.error });
  if (!origin.ok || !destination.ok) return res.status(400).json({ error: 'INVALID_STATION_IDS' });
  if (!time.ok) return res.status(400).json({ error: time.error });
  if (!normalizedPrice.ok) return res.status(400).json({ error: normalizedPrice.error });

  if (origin.value === destination.value) return res.status(400).json({ error: 'مبدا و مقصد باید متفاوت باشند.' });
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [current] = await connection.query('SELECT * FROM schedules WHERE id = ? FOR UPDATE', [scheduleId]);
    if (!current.length) { await connection.rollback(); return res.status(404).json({ error: 'Schedule not found' }); }
    const changed = current[0].driver_id !== driver.value || current[0].origin_station_id !== origin.value || current[0].destination_station_id !== destination.value || String(current[0].departure_time) !== time.value;
    if (changed) {
      const [[sold]] = await connection.query("SELECT COUNT(*) AS count FROM tickets t JOIN buses b ON b.id = t.bus_id WHERE b.schedule_id = ? AND DATE(t.created_at) = CURDATE() AND t.status <> 'cancelled'", [scheduleId]);
      if (sold.count > 0) { await connection.rollback(); return res.status(409).json({ error: 'برای این سرویس امروز بلیط صادر شده است؛ برای تغییر راننده، مسیر یا زمان یک برنامه جدید بسازید.' }); }
    }
    await connection.query('UPDATE schedules SET driver_id=?, origin_station_id=?, destination_station_id=?, departure_time=?, price=? WHERE id=?', [driver.value, origin.value, destination.value, time.value, normalizedPrice.value, scheduleId]);
    await connection.commit();
    await auditLog(connection, req, 'admin.schedule_update', 'schedule', scheduleId);
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    logError('Update schedule failed', error);
    res.status(500).json({ error: 'Server error' });
  } finally { connection.release(); }
};

export const handleToggleScheduleStatus = async (req, res) => {
  const scheduleId = Number(req.params.scheduleId);
  try {
    await db.query("UPDATE schedules SET status = IF(status='active', 'inactive', 'active') WHERE id=?", [scheduleId]);
    const [rows] = await db.query('SELECT status FROM schedules WHERE id=?', [scheduleId]);
    await auditLog(db, req, 'admin.schedule_toggle_status', 'schedule', scheduleId, { newStatus: rows[0]?.status });
    res.json({ success: true, newStatus: rows[0]?.status });
  } catch (error) {
    logError('Toggle schedule failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleDeleteSchedule = async (req, res) => {
  const scheduleId = Number(req.params.scheduleId);
  if ((!Number.isSafeInteger(scheduleId) || scheduleId <= 0)) return res.status(400).json({ error: 'Invalid schedule id' });

  try {
    const [result] = await db.query('DELETE FROM schedules WHERE id = ?', [scheduleId]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Schedule not found' });
    await auditLog(db, req, 'admin.schedule_delete', 'schedule', scheduleId);
    res.json({ success: true });
  } catch (error) {
    logError('Delete schedule failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};
