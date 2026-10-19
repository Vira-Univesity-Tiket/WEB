-- Local demonstration only. Never applied in production.
INSERT INTO stations (name, lat, lng)
SELECT * FROM (
  SELECT 'دانشکده فنی' AS name, 35.7135000 AS lat, 51.3930000 AS lng UNION ALL
  SELECT 'خوابگاه مرکزی', 35.7150000, 51.3880000 UNION ALL
  SELECT 'سلف سرویس', 35.7120000, 51.3890000
) AS x
WHERE NOT EXISTS (SELECT 1 FROM stations LIMIT 1);

-- Seed existing active drivers
INSERT INTO drivers (name, username, password, license_plate, phone, status, capacity)
SELECT * FROM (
  SELECT 'راننده نمونه 1' AS name, 'driver1' AS username, CONCAT('seed-disabled-', UUID()) AS password, '11-الف-111' AS license_plate, '09120000001' AS phone, 'active' AS status, 40 AS capacity UNION ALL
  SELECT 'راننده نمونه 2', 'driver2', CONCAT('seed-disabled-', UUID()), '22-ب-222', '09120000002', 'active', 25
) AS x
WHERE NOT EXISTS (SELECT 1 FROM drivers LIMIT 1);

INSERT INTO users (name, student_id, national_code, balance, province, city, language)
SELECT * FROM (
  SELECT 'دانشجو نمونه' AS name, '402118901' AS student_id, '1234567891' AS national_code, 1500000 AS balance, 'تهران' AS province, 'تهران' AS city, 'fa' AS language
) AS x
WHERE NOT EXISTS (SELECT 1 FROM users LIMIT 1);

INSERT IGNORE INTO driver_station_assignments (driver_id, station_id)
SELECT d.id, s.id
FROM drivers d
JOIN stations s
WHERE d.license_plate = '11-الف-111' AND s.name IN ('دانشکده فنی', 'خوابگاه مرکزی');

INSERT IGNORE INTO driver_station_assignments (driver_id, station_id)
SELECT d.id, s.id
FROM drivers d
JOIN stations s
WHERE d.license_plate = '22-ب-222' AND s.name IN ('خوابگاه مرکزی', 'سلف سرویس');

INSERT INTO schedules (driver_id, origin_station_id, destination_station_id, departure_time, price, status)
SELECT d.id, s1.id, s2.id, '08:30:00', 50000, 'active'
FROM drivers d
JOIN stations s1 ON s1.name = 'دانشکده فنی'
JOIN stations s2 ON s2.name = 'خوابگاه مرکزی'
WHERE d.license_plate = '11-الف-111'
  AND NOT EXISTS (
    SELECT 1 FROM schedules sc
    WHERE sc.driver_id = d.id
      AND sc.origin_station_id = s1.id
      AND sc.destination_station_id = s2.id
      AND sc.departure_time = '08:30:00'
  );
