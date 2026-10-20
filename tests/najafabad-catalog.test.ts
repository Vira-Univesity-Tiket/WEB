import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validateNajafabadCatalog } from '../backend/services/najafabadCatalogService.js';

const input = () => JSON.parse(readFileSync(new URL('../backend/data/najafabad-services.json', import.meta.url), 'utf8'));

test('Najafabad catalog has 20 origins, three different vehicles and both ticket directions', () => {
  const catalog = validateNajafabadCatalog(input());
  assert.equal(catalog.stations.length, 21);
  assert.equal(catalog.drivers.length, 60);
  assert.equal(catalog.services.length, 120);
  for (const station of catalog.stations.filter(row => row.key !== catalog.universityKey)) {
    const outbound = catalog.services.filter(row => row.originKey === station.key);
    const returns = catalog.services.filter(row => row.destinationKey === station.key);
    assert.equal(outbound.length, 3); assert.equal(returns.length, 3);
    assert.deepEqual(outbound.map(row => row.capacity), [23, 32, 44]);
    assert.equal(new Set(outbound.map(row => row.priceRial)).size, 3);
    for (const service of outbound) {
      const back = returns.find(row => row.driverUsername === service.driverUsername)!;
      assert.ok(back.departureTime > service.departureTime);
      assert.equal(back.priceRial, service.priceRial);
    }
  }
});

test('catalog converts Toman to Rial and validates bounded regional coordinates and amounts', () => {
  const source = input();
  assert.equal(validateNajafabadCatalog(source).services[0].priceRial, source.services[0].priceToman * 10);
  for (const mutate of [
    (data: any) => { data.stations[0].lat = 40; },
    (data: any) => { data.services[0].priceToman = 50000001; },
    (data: any) => { data.services[0].capacity = 81; },
    (data: any) => { data.services[0].departureTime = '08:30:45'; }
  ]) { const data = input(); mutate(data); assert.throws(() => validateNajafabadCatalog(data)); }
});

test('catalog rejects one-way, unknown and non-university routes', () => {
  const oneWay = input();
  oneWay.services = oneWay.services.filter((row: any) => row.originKey !== oneWay.universityKey);
  assert.throws(() => validateNajafabadCatalog(oneWay), /ROUND_TRIP_REQUIRED/);
  const invalid = input(); invalid.services[0].destinationKey = 'missing';
  assert.throws(() => validateNajafabadCatalog(invalid), /INVALID_UNIVERSITY_ROUTE/);
  invalid.services[0].destinationKey = invalid.stations[2].key;
  assert.throws(() => validateNajafabadCatalog(invalid), /INVALID_UNIVERSITY_ROUTE/);
});

test('catalog rejects duplicate stations, duplicate driver departures and inconsistent vehicles', () => {
  const duplicate = input(); duplicate.stations.push(duplicate.stations[0]);
  assert.throws(() => validateNajafabadCatalog(duplicate), /DUPLICATE_OR_INVALID_STATION/);
  const departures = input(); departures.services.push(departures.services[0]);
  assert.throws(() => validateNajafabadCatalog(departures), /DUPLICATE_DRIVER_DEPARTURE/);
  const capacity = input(); capacity.services[1].capacity = 31;
  assert.throws(() => validateNajafabadCatalog(capacity), /INCONSISTENT_DRIVER_VEHICLE/);
});

test('public catalog cannot provision predictable passwords or duplicate driver identities', () => {
  const password = input(); password.drivers[0].password = 'unsafe-shared-password';
  assert.throws(() => validateNajafabadCatalog(password), /PASSWORD_MUST_NOT_BE_IN_CATALOG/);
  const duplicate = input(); duplicate.drivers.push({ ...duplicate.drivers[0], username: duplicate.drivers[0].username.toUpperCase() });
  assert.throws(() => validateNajafabadCatalog(duplicate), /DUPLICATE_OR_INVALID_DRIVER/);
});

test('catalog rejects unsafe text and requires an explicit coordinate role', () => {
  const unsafe = input(); unsafe.stations[0].name = '<script>alert(1)</script>';
  assert.throws(() => validateNajafabadCatalog(unsafe), /INVALID_STATION_NAME/);
  const missing = input(); delete missing.stations[0].coordinateRole;
  assert.throws(() => validateNajafabadCatalog(missing), /STATION_COORDINATE_ROLE_REQUIRED/);
});

test('offline catalog validation works with no database connection', () => {
  const output = execFileSync(process.execPath, ['backend/scripts/import-najafabad-services.mjs', '--file', 'backend/data/najafabad-services.json', '--validate'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8', env: { ...process.env, DB_HOST: 'invalid.invalid', DB_PORT: '1' }, timeout: 5000
  });
  assert.deepEqual(JSON.parse(output), { mode: 'validated', stations: 21, drivers: 60, services: 120 });
});
