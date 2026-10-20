import { createHash, randomBytes } from 'node:crypto';
import { hashPassword } from '../security.js';
import { normalizePersianText, parseCoordinate, parsePositiveInt, parseTime } from '../validation.js';

const fail = message => { throw new Error(message); };
const text = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f<>]/u.test(value)) fail(`INVALID_${label}`);
  return value.trim();
};
const stationNameKey = value => normalizePersianText(value).replace(/\u200c/g, ' ').replace(/\s+/g, ' ');
const scheduleKey = row => `${row.driver_id}:${row.origin_station_id}:${row.destination_station_id}:${row.departure_time}`;

export function validateNajafabadCatalog(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.stations) || !Array.isArray(input.services)) fail('INVALID_CATALOG');
  if (input.stations.length < 2 || input.stations.length > 250 || !input.services.length || input.services.length > 1000) fail('INVALID_CATALOG_SIZE');
  const universityKey = text(input.universityKey, 60, 'UNIVERSITY_KEY');
  const stationKeys = new Set(); const stationNames = new Set();
  const stations = input.stations.map(row => {
    if (!row || !['area-reference', 'boarding-point'].includes(row.coordinateRole)) fail('STATION_COORDINATE_ROLE_REQUIRED');
    const key = text(row.key, 60, 'STATION_KEY');
    const name = text(row.name, 100, 'STATION_NAME');
    if (!/^[a-z0-9-]+$/.test(key) || stationKeys.has(key) || stationNames.has(stationNameKey(name))) fail('DUPLICATE_OR_INVALID_STATION');
    const lat = parseCoordinate(row.lat, { min: 31.5, max: 33.5 });
    const lng = parseCoordinate(row.lng, { min: 50.5, max: 52.5 });
    if (!lat.ok || !lng.ok) fail('INVALID_ISFAHAN_COORDINATES');
    stationKeys.add(key); stationNames.add(stationNameKey(name));
    return { key, name, lat: lat.value, lng: lng.value };
  });
  if (!stationKeys.has(universityKey)) fail('UNIVERSITY_STATION_REQUIRED');
  if (input.drivers !== undefined && !Array.isArray(input.drivers)) fail('INVALID_DRIVERS');
  const declaredDrivers = input.drivers || [];
  if (declaredDrivers.length > 250) fail('TOO_MANY_DRIVERS');
  const usernames = new Set(); const plates = new Set();
  const drivers = declaredDrivers.map(row => {
    if (!row) fail('INVALID_DRIVER');
    if (Object.hasOwn(row, 'password')) fail('PASSWORD_MUST_NOT_BE_IN_CATALOG');
    const name = text(row.name, 100, 'DRIVER_NAME');
    const username = text(row.username, 50, 'DRIVER_USERNAME');
    const licensePlate = text(row.licensePlate, 30, 'LICENSE_PLATE');
    const capacity = parsePositiveInt(row.capacity, { max: 80 });
    if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username) || !capacity.ok || usernames.has(username.toLowerCase()) || plates.has(licensePlate)) fail('DUPLICATE_OR_INVALID_DRIVER');
    usernames.add(username.toLowerCase()); plates.add(licensePlate);
    return { name, username, licensePlate, capacity: capacity.value };
  });
  const departures = new Set(); const directions = new Map(); const capacities = new Map();
  const services = input.services.map(row => {
    if (!row) fail('INVALID_SERVICE');
    const originKey = text(row.originKey, 60, 'ORIGIN');
    const destinationKey = text(row.destinationKey, 60, 'DESTINATION');
    if (!stationKeys.has(originKey) || !stationKeys.has(destinationKey) || originKey === destinationKey || (originKey !== universityKey && destinationKey !== universityKey)) fail('INVALID_UNIVERSITY_ROUTE');
    const driverUsername = text(row.driverUsername, 50, 'DRIVER_USERNAME');
    const licensePlate = text(row.licensePlate, 30, 'LICENSE_PLATE');
    const capacity = parsePositiveInt(row.capacity, { max: 80 });
    const price = parsePositiveInt(row.priceToman, { min: 1000, max: 50000000 });
    const time = parseTime(row.departureTime);
    if (!capacity.ok || !price.ok || !time.ok || !/^[\d۰-۹٠-٩]{2}:[\d۰-۹٠-٩]{2}$/.test(String(row.departureTime))) fail('INVALID_CAPACITY_PRICE_OR_TIME');
    const driverKey = driverUsername.toLowerCase();
    const departureKey = `${driverKey}:${time.value}`;
    if (departures.has(departureKey)) fail('DUPLICATE_DRIVER_DEPARTURE');
    if (capacities.has(driverKey) && capacities.get(driverKey) !== `${capacity.value}:${licensePlate}`) fail('INCONSISTENT_DRIVER_VEHICLE');
    departures.add(departureKey); capacities.set(driverKey, `${capacity.value}:${licensePlate}`);
    const stop = originKey === universityKey ? destinationKey : originKey;
    if (!directions.has(stop)) directions.set(stop, new Set());
    directions.get(stop).add(originKey === universityKey ? 'return' : 'outbound');
    return { originKey, destinationKey, driverUsername, licensePlate, capacity: capacity.value, departureTime: time.value, priceRial: price.value * 10 };
  });
  for (const station of stations) {
    if (station.key !== universityKey && directions.get(station.key)?.size !== 2) fail(`ROUND_TRIP_REQUIRED:${station.key}`);
  }
  for (const driver of drivers) {
    if (capacities.get(driver.username.toLowerCase()) !== `${driver.capacity}:${driver.licensePlate}`) fail(`UNUSED_OR_MISMATCHED_DRIVER:${driver.username}`);
  }
  return { version: 1, universityKey, stations, drivers, services };
}

// Deliberately separate from app startup: imports add records and never change sold services.
export async function importNajafabadCatalog(pool, input, { apply = false, confirmDatabase = '', persistCredentials } = {}) {
  const catalog = validateNajafabadCatalog(input);
  const connection = await pool.getConnection();
  let transaction = false; let locked = false; let lockName;
  try {
    const [[database]] = await connection.query('SELECT DATABASE() AS name');
    if (!database.name || (apply && confirmDatabase !== database.name)) fail('DATABASE_CONFIRMATION_MISMATCH');
    const requiredTables = ['drivers', 'stations', 'schedules', 'driver_station_assignments', 'audit_logs'];
    const [tables] = await connection.query('SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)', [requiredTables]);
    if (requiredTables.some(name => !tables.some(row => row.name === name && row.engine === 'InnoDB'))) fail('CATALOG_REQUIRES_EXISTING_INNODB_SCHEMA');
    lockName = `vira:najafabad:${createHash('sha256').update(database.name).digest('hex').slice(0, 32)}`;
    if (apply) {
      const [[lock]] = await connection.query('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
      if (Number(lock.acquired) !== 1) fail('CATALOG_IMPORT_BUSY');
      locked = true;
    }
    await connection.beginTransaction(); transaction = true;
    const driverNames = [...new Set(catalog.services.map(row => row.driverUsername))];
    const [drivers] = await connection.query(`SELECT id, username, license_plate, capacity, status FROM drivers WHERE username IN (?) OR license_plate IN (?) ORDER BY id${apply ? ' FOR UPDATE' : ''}`, [driverNames, catalog.services.map(row => row.licensePlate)]);
    const driverMap = new Map(drivers.map(row => [row.username.toLowerCase(), row]));
    const credentials = [];
    const counts = { drivers: { create: 0, reuse: 0 }, stations: { create: 0, reuse: 0 }, services: { create: 0, reuse: 0 } };
    const newDriverIds = new Set();
    for (const driver of catalog.drivers) {
      const existing = driverMap.get(driver.username.toLowerCase());
      if (existing) { counts.drivers.reuse += 1; continue; }
      if (drivers.some(row => row.license_plate === driver.licensePlate)) fail(`LICENSE_PLATE_ALREADY_ASSIGNED:${driver.username}`);
      counts.drivers.create += 1;
      let id = null;
      if (apply) {
        if (typeof persistCredentials !== 'function') fail('PRIVATE_CREDENTIALS_OUTPUT_REQUIRED');
        const password = randomBytes(24).toString('base64url');
        const [inserted] = await connection.query("INSERT INTO drivers (name, username, password, license_plate, status, capacity) VALUES (?, ?, ?, ?, 'active', ?)", [driver.name, driver.username, await hashPassword(password), driver.licensePlate, driver.capacity]);
        id = inserted.insertId; newDriverIds.add(id);
        credentials.push({ username: driver.username, password });
      }
      driverMap.set(driver.username.toLowerCase(), { id, username: driver.username, license_plate: driver.licensePlate, capacity: driver.capacity, status: 'active' });
    }
    const assignments = new Map();
    for (const service of catalog.services) {
      const driver = driverMap.get(service.driverUsername.toLowerCase());
      if (!driver || driver.status !== 'active') fail(`ACTIVE_DRIVER_REQUIRED:${service.driverUsername}`);
      if (Number(driver.capacity) !== service.capacity || driver.license_plate !== service.licensePlate) fail(`DRIVER_VEHICLE_MISMATCH:${service.driverUsername}`);
    }

    // Join the requested names using MySQL's own collation; ambiguous existing names fail.
    const wanted = catalog.stations.map(() => 'SELECT ? AS station_key, ? AS station_name').join(' UNION ALL ');
    const [existingStations] = await connection.query(
      `SELECT wanted.station_key, s.id, s.lat, s.lng, s.is_active FROM (${wanted}) wanted JOIN stations s ON s.name = wanted.station_name ORDER BY s.id${apply ? ' FOR UPDATE' : ''}`,
      catalog.stations.flatMap(row => [row.key, row.name])
    );
    const stationMap = new Map();
    for (const row of existingStations) {
      if (stationMap.has(row.station_key)) fail(`AMBIGUOUS_STATION:${row.station_key}`);
      stationMap.set(row.station_key, row);
    }
    for (const station of catalog.stations) {
      const existing = stationMap.get(station.key);
      if (existing) {
        if (!existing.is_active || Math.abs(Number(existing.lat) - station.lat) > 0.001 || Math.abs(Number(existing.lng) - station.lng) > 0.001) fail(`STATION_REVIEW_REQUIRED:${station.key}`);
        counts.stations.reuse += 1;
      } else {
        counts.stations.create += 1;
        if (apply) {
          const [inserted] = await connection.query('INSERT INTO stations (name, lat, lng, is_active) VALUES (?, ?, ?, 1)', [station.name, station.lat, station.lng]);
          stationMap.set(station.key, { id: inserted.insertId });
        }
      }
    }
    const knownDriverIds = [...driverMap.values()].map(row => row.id).filter(id => id !== null);
    const [existingServices] = knownDriverIds.length ? await connection.query(
      `SELECT id, driver_id, origin_station_id, destination_station_id, TIME_FORMAT(departure_time, '%H:%i:%s') AS departure_time, price, status FROM schedules WHERE driver_id IN (?) AND departure_time IN (?) ORDER BY id${apply ? ' FOR UPDATE' : ''}`,
      [knownDriverIds, [...new Set(catalog.services.map(row => row.departureTime))]]
    ) : [[]];
    for (const service of catalog.services) {
      const driver = driverMap.get(service.driverUsername.toLowerCase());
      const originId = stationMap.get(service.originKey)?.id;
      const destinationId = stationMap.get(service.destinationKey)?.id;
      const row = { driver_id: driver.id, origin_station_id: originId, destination_station_id: destinationId, departure_time: service.departureTime };
      const matches = existingServices.filter(existing => originId && destinationId && scheduleKey(existing) === scheduleKey(row));
      const conflicts = existingServices.some(existing => existing.status === 'active' && existing.driver_id === driver.id && existing.departure_time === service.departureTime && scheduleKey(existing) !== scheduleKey(row));
      if (conflicts || matches.length > 1) fail(`DRIVER_SCHEDULE_CONFLICT:${service.driverUsername}:${service.departureTime}`);
      if (matches.length) {
        if (matches[0].status !== 'active' || Number(matches[0].price) !== service.priceRial) fail(`EXISTING_SERVICE_REVIEW_REQUIRED:${matches[0].id}`);
        counts.services.reuse += 1;
      } else {
        counts.services.create += 1;
        if (apply) await connection.query("INSERT INTO schedules (driver_id, origin_station_id, destination_station_id, departure_time, price, status) VALUES (?, ?, ?, ?, ?, 'active')", [driver.id, originId, destinationId, service.departureTime, service.priceRial]);
      }
      const localStationId = stationMap.get(service.originKey === catalog.universityKey ? service.destinationKey : service.originKey)?.id;
      if (apply && newDriverIds.has(driver.id)) assignments.set(`${driver.id}:${localStationId}`, [driver.id, localStationId]);
    }
    if (apply) {
      if (assignments.size) await connection.query('INSERT IGNORE INTO driver_station_assignments (driver_id, station_id) VALUES ?', [[...assignments.values()]]);
      if (credentials.length) await persistCredentials(credentials);
      await connection.query(
        "INSERT INTO audit_logs (actor_role, action, entity_type, details) VALUES ('system', 'catalog.najafabad_import', 'service_catalog', ?)",
        [JSON.stringify({ fingerprint: createHash('sha256').update(JSON.stringify(catalog)).digest('hex'), counts })]
      );
      await connection.commit();
    } else await connection.rollback();
    transaction = false;
    return { mode: apply ? 'applied' : 'dry-run', ...counts };
  } catch (error) {
    if (transaction) await connection.rollback();
    throw error;
  } finally {
    try {
      if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]);
    } finally { connection.release(); }
  }
}
