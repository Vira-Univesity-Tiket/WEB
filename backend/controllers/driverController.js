
import { db } from '../db.js';
import { auditLog, hashPassword, issueAuthToken, verifyPassword } from '../security.js';
import { sanitizeText, validateIranMobile, validateNationalCode } from '../validation.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

// Helper to get commission percentage
async function getCommissionPercent() {
  const [rows] = await db.query("SELECT setting_value FROM settings WHERE setting_key = 'commission_percent' LIMIT 1");
  return rows.length > 0 ? Number(rows[0].setting_value) : 10; // Default 10%
}

const mapScan = (row, count = 1) => ({
  id: row.id,
  ticketId: row.ticket_id?.toString(),
  qrCode: row.qr_code,
  validationCode: row.validation_code,
  passengerName: row.passenger_name,
  amount: Math.round(Number(row.price_paid || 0) / 10), // Toman
  scannedAt: row.scanned_at,
  method: row.scan_method,
  count: count // Add count to response for UI
});

const normalizeQrPayload = (input) => {
  if (input === null || input === undefined) return '';
  const normalizeDigits = (value) =>
    String(value || '')
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));

  const raw = normalizeDigits(String(input).trim());
  if (!raw) return '';

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') return parsed.trim();
    if (parsed && typeof parsed === 'object') {
      const candidate =
        parsed.qrCode ||
        parsed.qr ||
        parsed.validationCode ||
        parsed.validation_code ||
        parsed.code ||
        parsed.value;
      if (candidate) return normalizeDigits(String(candidate).trim());
    }
  } catch {}

  const querySource = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw;
  if (querySource.includes('=')) {
    try {
      const params = new URLSearchParams(querySource);
      const candidate =
        params.get('qrCode') ||
        params.get('qr') ||
        params.get('validationCode') ||
        params.get('validation_code') ||
        params.get('code') ||
        params.get('value');
      if (candidate) return normalizeDigits(candidate.trim());
    } catch {}
  }

  return normalizeDigits(raw);
};

const performScan = async ({ driverId, searchField, searchValue, scanMethod }) => {
  const connection = await db.getConnection();
  const serviceDate = todayIso();

  try {
    await connection.beginTransaction();

    // 1. Get Scanning Driver Info
    const [driverRows] = await connection.query(
      'SELECT name, license_plate FROM drivers WHERE id = ? LIMIT 1',
      [driverId]
    );
    
    if (!driverRows.length) {
        await connection.rollback();
        return { status: 403, payload: { error: 'راننده شناسایی نشد' } };
    }
    const driver = driverRows[0];

    const [driverStationRows] = await connection.query(
      `SELECT station_id
       FROM driver_station_assignments
       WHERE driver_id = ?`,
      [driverId]
    );
    const driverStationIds = driverStationRows
      .map((row) => Number(row.station_id))
      .filter((stationId) => Number.isFinite(stationId));

    if (driverStationIds.length === 0) {
      await connection.rollback();
      return { status: 403, payload: { error: 'این راننده به هیچ ایستگاهی اختصاص داده نشده است' } };
    }

    // 2. Search for ALL Tickets matches
    // Note: searchField is either 'qr_code' or 'validation_code'
    const [candidates] = await connection.query(
      `SELECT t.id, t.qr_code, t.validation_code, t.price_paid, t.status, u.name AS passenger_name,
              b.bus_number,
              COALESCE(b.origin_station_id, sc.origin_station_id) AS origin_station_id,
              COALESCE(b.destination_station_id, sc.destination_station_id) AS destination_station_id
       FROM tickets t
       JOIN users u ON u.id = t.user_id
       JOIN buses b ON b.id = t.bus_id
       LEFT JOIN schedules sc ON sc.id = b.schedule_id
       WHERE t.${searchField} = ?`,
      [searchValue]
    );

    if (candidates.length === 0) {
      await connection.rollback();
      return { status: 404, payload: { error: 'کد بلیط یافت نشد' } };
    }

    // 3. Filter tickets that belong to a bus running at one of this driver's assigned stations
    const myTickets = candidates.filter((ticket) => {
      const ticketStationIds = [ticket.origin_station_id, ticket.destination_station_id]
        .map((stationId) => Number(stationId))
        .filter((stationId) => Number.isFinite(stationId));
      return ticketStationIds.some((stationId) => driverStationIds.includes(stationId));
    });

    if (myTickets.length === 0) {
      await connection.rollback();
      return { status: 403, payload: { error: 'این بلیط برای ایستگاه تحت پوشش شما نیست' } };
    }

    // 4. Validate Status of ALL tickets
    // If any are not active, it's a problem, but usually they should all be active or all used if scanned together.
    const activeTickets = myTickets.filter(t => t.status === 'active');
    
    if (activeTickets.length === 0) {
       await connection.rollback();
       return { status: 400, payload: { error: 'این بلیط‌ها قبلا استفاده شده یا منقضی هستند' } };
    }

    // 5. Check duplicates in scans (Extra safety)
    // Check if ANY of these ticket IDs are already in scans for today
    const ticketIds = activeTickets.map(t => t.id);
    if (ticketIds.length > 0) {
        const placeholders = ticketIds.map(() => '?').join(',');
        const [duplicateRows] = await connection.query(
          `SELECT id FROM ticket_scans WHERE service_date = ? AND ticket_id IN (${placeholders}) LIMIT 1`,
          [serviceDate, ...ticketIds]
        );

        if (duplicateRows.length > 0) {
          await connection.rollback();
          return { status: 409, payload: { error: 'این بلیط قبلاً اسکن شده است' } };
        }
    }

    // 6. Record Scan for EACH active ticket
    // We insert a scan record for every single ticket in the batch to keep accounting accurate per seat.
    let lastInsertId = 0;
    for (const ticket of activeTickets) {
        const [insertResult] = await connection.query(
          `INSERT INTO ticket_scans (ticket_id, driver_id, scan_method, scanned_value, passenger_count, service_date)
           VALUES (?, ?, ?, ?, 1, ?)`,
          [ticket.id, driverId, scanMethod, searchValue, serviceDate]
        );
        lastInsertId = insertResult.insertId;
    }

    await connection.commit();

    // Get info of one of the scans to return to UI
    const [newRows] = await connection.query(
      `SELECT s.id, s.ticket_id, s.scan_method, s.scanned_at,
              t.qr_code, t.validation_code, t.price_paid,
              u.name AS passenger_name
       FROM ticket_scans s
       JOIN tickets t ON t.id = s.ticket_id
       JOIN users u ON u.id = t.user_id
       WHERE s.id = ? LIMIT 1`,
      [lastInsertId]
    );

    const scanData = mapScan(newRows[0], activeTickets.length);
    
    // Customize passenger name if multiple
    if (activeTickets.length > 1) {
        scanData.passengerName = `${scanData.passengerName} (${activeTickets.length} نفر)`;
    }

    return { status: 201, payload: { success: true, scan: scanData } };

  } catch (error) {
    await connection.rollback();
    if (error.code === 'ER_DUP_ENTRY') {
        return { status: 409, payload: { error: 'این بلیط قبلاً ثبت شده است' } };
    }
    console.error('Scan Error:', error);
    return { status: 500, payload: { error: 'خطای سرور' } };
  } finally {
    connection.release();
  }
};

export const handleDriverRegister = async (req, res) => {
  const name = sanitizeText(req.body.name, 100);
  const { birthDate, plateData, documents, username, password } = req.body;
  const nationalValidation = validateNationalCode(req.body.nationalCode);
  const phoneValidation = validateIranMobile(req.body.phone);

  if (!name || !req.body.nationalCode || !username || !password) {
    return res.status(400).json({ error: 'تکمیل همه فیلدهای ضروری الزامی است.' });
  }
  if (!nationalValidation.ok) return res.status(400).json({ error: nationalValidation.error });
  if (req.body.phone && !phoneValidation.ok) return res.status(400).json({ error: phoneValidation.error });
  const nationalCode = nationalValidation.value;
  const normalizedPhone = req.body.phone ? phoneValidation.value : '';
  const normalizedUsername = sanitizeText(username, 50);
  const normalizedPassword = String(password || '').trim();
  if (!normalizedUsername || normalizedUsername.length < 3) {
    return res.status(400).json({ error: 'نام کاربری باید حداقل ۳ کاراکتر باشد.' });
  }
  if (!normalizedPassword || normalizedPassword.length < 4) {
    return res.status(400).json({ error: 'رمز عبور باید حداقل ۴ کاراکتر باشد.' });
  }
  if (!birthDate || !sanitizeText(birthDate, 20)) {
    return res.status(400).json({ error: 'تاریخ تولد الزامی است.' });
  }
  if (!plateData || typeof plateData !== 'object') {
    return res.status(400).json({ error: 'اطلاعات پلاک معتبر نیست.' });
  }
  if (!documents || typeof documents !== 'object' || !documents.nationalCard || !documents.licenseCard || !documents.carCard) {
    return res.status(400).json({ error: 'بارگذاری کامل مدارک الزامی است.' });
  }

  // Safe License Plate Construction
  let licensePlate = '';
  if (plateData) {
      const part1 = plateData.part1 || '';
      const letter = plateData.letter || 'ع'; // Default to 'Ain' if missing
      const part2 = plateData.part2 || '';
      const part3 = plateData.part3 || '';
      licensePlate = `${part1}${letter}${part2}-${part3}`;
  }

  try {
    const hashedPassword = await hashPassword(normalizedPassword);
    const [existing] = await db.query('SELECT id, status FROM drivers WHERE username = ? OR national_code = ?', [normalizedUsername, nationalCode]);
    
    if (existing.length > 0) {
        const driver = existing[0];
        
        // If driver is already ACTIVE, block registration.
        if (driver.status === 'active') {
            return res.status(409).json({ error: 'حساب کاربری با این مشخصات قبلاً تایید و فعال شده است.' });
        }

        // If 'pending' or 'rejected', update the record and reset status to 'pending' for review.
        await db.query(
            `UPDATE drivers SET name=?, national_code=?, birth_date=?, phone=?, license_plate=?, plate_data=?, documents=?, password=?, status='pending', rejection_reason=NULL, created_at=CURRENT_TIMESTAMP 
             WHERE id=?`,
            [name, nationalCode, sanitizeText(birthDate, 20), normalizedPhone, licensePlate, JSON.stringify(plateData), JSON.stringify(documents), hashedPassword, driver.id]
        );
        await auditLog(db, req, 'driver.registration_update', 'driver', driver.id, { username: normalizedUsername });
        return res.json({ success: true, message: 'Request Updated' });
    }

    await db.query(
      `INSERT INTO drivers (name, national_code, birth_date, phone, license_plate, plate_data, documents, username, password, status, capacity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 30)`,
      [name, nationalCode, sanitizeText(birthDate, 20), normalizedPhone, licensePlate, JSON.stringify(plateData), JSON.stringify(documents), normalizedUsername, hashedPassword]
    );

    await auditLog(db, req, 'driver.register', 'driver', null, { username: normalizedUsername });
    res.json({ success: true });
  } catch (error) {
    console.error('Driver Register Error', error);
    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'نام کاربری یا کد ملی قبلاً ثبت شده است.' });
    }
    res.status(500).json({ error: 'خطای داخلی سرور هنگام ثبت‌نام راننده.' });
  }
};

export const handleDriverLogin = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM drivers WHERE username = ? LIMIT 1',
      [String(username).trim()]
    );

    if (!rows.length) return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });

    const driver = rows[0];
    const passwordCheck = await verifyPassword(String(password).trim(), driver.password);
    if (!passwordCheck.ok) return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
    if (passwordCheck.needsRehash) {
      await db.query('UPDATE drivers SET password = ? WHERE id = ?', [await hashPassword(String(password).trim()), driver.id]);
    }

    if (driver.status === 'inactive') {
        return res.status(403).json({ error: 'حساب کاربری شما غیرفعال است' });
    }

    if (driver.status === 'pending') {
        return res.json({ 
            status: 'pending',
            message: 'درخواست شما با موفقیت ثبت شد. کارشناسان ما مدارک شما را بررسی کرده و نتیجه را تا ۱۲ ساعت آینده از طریق همین سامانه به اطلاع شما خواهند رساند.' 
        });
    }

    if (driver.status === 'rejected') {
        return res.json({ 
            status: 'rejected', 
            reason: driver.rejection_reason,
            data: {
                name: driver.name,
                nationalCode: driver.national_code,
                birthDate: driver.birth_date,
                phone: driver.phone,
                plateData: driver.plate_data, 
                documents: driver.documents,
                username: driver.username
            }
        });
    }

    const token = issueAuthToken({
      sub: driver.id.toString(),
      role: 'driver',
      driverId: driver.id.toString(),
      username: driver.username
    });

    await auditLog(db, req, 'driver.login', 'driver', driver.id);
    res.json({
      status: 'active',
      id: driver.id.toString(),
      name: driver.name,
      username: driver.username,
      licensePlate: driver.license_plate,
      phone: driver.phone,
      authToken: token,
      token
    });
  } catch (error) {
    console.error('Driver login failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleDriverScanByQr = async (req, res) => {
  const { driverId, qrCode } = req.body;
  const numericDriverId = Number(driverId);
  if (!Number.isFinite(numericDriverId) || !qrCode) {
    return res.status(400).json({ error: 'driverId and qrCode are required' });
  }
  if (req.auth?.driverId !== String(numericDriverId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // UPDATE: If scanned value is 4 digits, treat as validation code search
  const codeStr = normalizeQrPayload(qrCode);
  const searchField = (codeStr.length === 4 && /^\d+$/.test(codeStr)) ? 'validation_code' : 'qr_code';

  try {
    const result = await performScan({ driverId: numericDriverId, searchField, searchValue: codeStr, scanMethod: 'qr' });
    res.status(result.status).json(result.payload);
  } catch (error) {
    console.error('Driver QR scan failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleDriverScanByCode = async (req, res) => {
  const { driverId, code } = req.body;
  const numericDriverId = Number(driverId);
  const normalizedCode = String(code || '').trim();

  if (!Number.isFinite(numericDriverId) || !/^\d{4}$/.test(normalizedCode)) {
    return res.status(400).json({ error: 'driverId and 4-digit code are required' });
  }
  if (req.auth?.driverId !== String(numericDriverId)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const result = await performScan({ driverId: numericDriverId, searchField: 'validation_code', searchValue: normalizedCode, scanMethod: 'code' });
    res.status(result.status).json(result.payload);
  } catch (error) {
    console.error('Driver code scan failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleDriverSummary = async (req, res) => {
  const driverId = Number(req.params.driverId);
  const serviceDate = String(req.query.service_date || todayIso());

  if (!Number.isFinite(driverId)) return res.status(400).json({ error: 'Invalid driver id' });
  if (req.auth?.driverId !== String(driverId)) return res.status(403).json({ error: 'Forbidden' });

  try {
    const commissionPercent = await getCommissionPercent();

    const [rows] = await db.query(
      `SELECT COUNT(s.id) AS boarded_count, COALESCE(SUM(t.price_paid), 0) AS total_revenue
       FROM ticket_scans s
       JOIN tickets t ON t.id = s.ticket_id
       WHERE s.driver_id = ? AND s.service_date = ?`,
      [driverId, serviceDate]
    );

    const grossRevenue = Number(rows[0]?.total_revenue || 0);
    const boardedCount = Number(rows[0]?.boarded_count || 0);

    const commissionAmount = (grossRevenue * commissionPercent) / 100;
    const netRevenue = grossRevenue - commissionAmount;
    
    const revenueToman = Math.round(netRevenue / 10);

    res.json({ serviceDate, boardedCount, totalRevenue: revenueToman });
  } catch (error) {
    console.error('Driver summary failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleDriverRecentScans = async (req, res) => {
  const driverId = Number(req.params.driverId);
  const limit = Math.min(Number(req.query.limit || 20), 100);

  if (!Number.isFinite(driverId)) return res.status(400).json({ error: 'Invalid driver id' });
  if (req.auth?.driverId !== String(driverId)) return res.status(403).json({ error: 'Forbidden' });

  try {
    const [rows] = await db.query(
      `SELECT s.id, s.ticket_id, s.scan_method, s.scanned_at,
              t.qr_code, t.validation_code, t.price_paid,
              u.name AS passenger_name
       FROM ticket_scans s
       JOIN tickets t ON t.id = s.ticket_id
       JOIN users u ON u.id = t.user_id
       WHERE s.driver_id = ?
       ORDER BY s.id DESC
       LIMIT ?`,
      [driverId, limit]
    );

    res.json(rows.map(r => mapScan(r)));
  } catch (error) {
    console.error('Driver recent scans failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const handleDriverDashboard = async (req, res) => {
  const driverId = Number(req.params.driverId);
  if (!Number.isFinite(driverId)) return res.status(400).json({ error: 'Invalid driver id' });
  if (req.auth?.driverId !== String(driverId)) return res.status(403).json({ error: 'Forbidden' });

  try {
    const commissionPercent = await getCommissionPercent();

    let driverCapacity = 30;
    const [driverRows] = await db.query("SELECT capacity FROM drivers WHERE id = ?", [driverId]);
    if (driverRows.length > 0) driverCapacity = Number(driverRows[0].capacity);

    const [scheduleRows] = await db.query(
      `SELECT s.id,
              s.departure_time,
              s.price,
              o.name AS origin_name,
              d2.name AS destination_name,
              dr.name AS driver_name,
              dr.license_plate,
              (
                SELECT COUNT(t.id)
                FROM tickets t
                JOIN buses b ON b.id = t.bus_id
                WHERE b.bus_number = CONCAT(dr.name, ' - ', dr.license_plate)
                  AND b.origin = o.name
                  AND b.destination = d2.name
                  AND b.departure_time = s.departure_time
                  AND DATE(t.created_at) = CURDATE()
                  AND t.status = 'active'
              ) AS sold_count,
              (
                SELECT COALESCE(SUM(t.price_paid), 0)
                FROM tickets t
                JOIN buses b ON b.id = t.bus_id
                WHERE b.bus_number = CONCAT(dr.name, ' - ', dr.license_plate)
                  AND b.origin = o.name
                  AND b.destination = d2.name
                  AND b.departure_time = s.departure_time
                  AND DATE(t.created_at) = CURDATE()
                  AND t.status = 'active'
              ) AS sold_amount
       FROM schedules s
       JOIN stations o ON o.id = s.origin_station_id
       JOIN stations d2 ON d2.id = s.destination_station_id
       JOIN drivers dr ON dr.id = s.driver_id
       WHERE s.driver_id = ?
         AND s.status = 'active'
       ORDER BY s.departure_time`,
      [driverId]
    );

    const scheduleCards = scheduleRows.map((row) => {
      const soldCount = Number(row.sold_count || 0);
      const grossSoldAmount = Number(row.sold_amount || 0);
      
      const netSoldAmount = grossSoldAmount - (grossSoldAmount * commissionPercent / 100);

      const totalSeats = driverCapacity;
      const remainingSeats = Math.max(0, totalSeats - soldCount);

      return {
        id: row.id.toString(),
        route: `${row.origin_name} ← ${row.destination_name}`,
        departureTime: row.departure_time?.toString().slice(0, 5) || '',
        ticketPrice: Math.round(Number(row.price)/10), // Toman
        soldCount,
        soldAmount: Math.round(netSoldAmount/10), // Toman (Net)
        totalSeats,
        remainingSeats,
        soldOut: remainingSeats === 0,
        hasSales: soldCount > 0
      };
    });

    res.json(scheduleCards);
  } catch (error) {
    console.error('Driver dashboard failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};
