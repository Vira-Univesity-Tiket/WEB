import { logError } from '../logging.js';

import { db } from '../db.js';
import { parsePositiveInt } from '../validation.js';

const mapScheduleToBusOption = (row) => {
  const depRaw = row.departure_time?.toString().slice(0, 5) || '00:00';
  const [h, m] = depRaw.split(':').map(Number);
  const depDate = new Date();
  depDate.setHours(h, m, 0, 0);
  const arrDate = new Date(depDate.getTime() + 15 * 60000);
  const arrStr = `${arrDate.getHours().toString().padStart(2, '0')}:${arrDate.getMinutes().toString().padStart(2, '0')}`;

  // Calculate remaining seats based on Capacity - Sold Tickets
  const remainingSeats = Math.max(0, Number(row.capacity || 30) - Number(row.sold_count || 0));
  
  let capacityStatus = 'Moderate';
  if (remainingSeats === 0) capacityStatus = 'Full';
  if (remainingSeats > 15) capacityStatus = 'Empty';

  // DB has Rial, UI needs Toman
  const priceToman = Math.round(Number(row.price || 0) / 10);

  return {
    id: row.id.toString(),
    departureTime: depRaw,
    arrivalTime: arrStr,
    busNumber: `${row.driver_name} - ${row.license_plate}`,
    driver: {
        name: row.driver_name,
        plate: row.license_plate
    },
    capacityStatus,
    remainingSeats,
    price: priceToman, 
    originName: row.origin_name,
    destinationName: row.destination_name
  };
};

export const handleGetBusSchedule = async (req, res) => {
  const { origin, destination } = req.body;
  const originValidation = parsePositiveInt(origin, { error: 'INVALID_STATION_IDS' });
  const destinationValidation = parsePositiveInt(destination, { error: 'INVALID_STATION_IDS' });

  if (!origin || !destination) {
    return res.status(400).json({ error: 'origin and destination are required' });
  }
  if (!originValidation.ok || !destinationValidation.ok) {
    return res.status(400).json({ error: 'INVALID_STATION_IDS' });
  }

  try {
    // FIX: Replaced JOIN with ticket_scans to a subquery counting actual TICKETS sold today.
    // This ensures capacity is deducted immediately upon purchase.
    const [rows] = await db.query(
      `SELECT s.id, s.departure_time, s.price,
              d.name AS driver_name, d.license_plate, d.capacity,
              o.name AS origin_name, ds.name AS destination_name,
              (
                SELECT COUNT(t.id)
                FROM tickets t
                JOIN buses b ON b.id = t.bus_id
                WHERE (b.schedule_id = s.id OR (b.schedule_id IS NULL AND b.bus_number = CONCAT(d.name, ' - ', d.license_plate)
                  AND b.origin = o.name AND b.destination = ds.name AND b.departure_time = s.departure_time))
                  AND t.status <> 'cancelled'
                  AND DATE(t.created_at) = CURDATE()
              ) AS sold_count
       FROM schedules s
       JOIN drivers d ON d.id = s.driver_id
       JOIN stations o ON o.id = s.origin_station_id
       JOIN stations ds ON ds.id = s.destination_station_id
       WHERE s.status = 'active'
         AND d.status = 'active'
         AND o.is_active = 1
         AND ds.is_active = 1
         AND s.origin_station_id = ?
         AND s.destination_station_id = ?
       ORDER BY s.departure_time ASC`,
      [originValidation.value, destinationValidation.value]
    );

    res.json(rows.map(mapScheduleToBusOption));
  } catch (error) {
    logError('Get bus schedule failed', error);
    res.status(500).json({ error: 'Server error' });
  }
};

const responses = {
  hello: 'سلام! چطور می توانم کمک کنم؟',
  bus: 'برای مشاهده زمان حرکت اتوبوس ها، از سرویس دانشگاه استفاده کنید.',
  wallet: 'از بخش کیف پول میتوانید حساب خود را شارژ کنید.'
};

export const handleChat = (req, res) => {
  const message = String(req.body?.message || '').toLowerCase();

  if (message.includes('سلام')) return res.json({ reply: responses.hello });
  if (message.includes('اتوبوس')) return res.json({ reply: responses.bus });
  if (message.includes('کیف پول')) return res.json({ reply: responses.wallet });

  return res.json({ reply: 'درخواست شما دریافت شد.' });
};
