import { expect, type APIRequestContext } from "@playwright/test";

export function nationalCodeFor(prefix: string) {
  const sum = [...prefix].reduce(
    (total, digit, index) => total + Number(digit) * (10 - index),
    0,
  );
  const remainder = sum % 11;
  return prefix + (remainder < 2 ? remainder : 11 - remainder);
}

export async function seedStudentDesign(request: APIRequestContext) {
  const login = await request.post("/api1/admin/login", {
    data: { username: "test-admin", password: "local-admin-test-password" },
  });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json()).token;
  const headers = { Authorization: `Bearer ${token}` };
  const names = [
    "میدان آزادی اصفهان",
    "پایانه صفه اصفهان",
    "پایانه کاوه اصفهان",
    "بهارستان ـ مرکز محدوده",
    "دولت‌آباد ـ مرکز محدوده",
    "مبارکه ـ مرکز محدوده",
    "شاهین‌شهر ـ مرکز محدوده",
    "زرین‌شهر ـ مرکز محدوده",
    "دانشگاه آزاد اسلامی واحد نجف‌آباد",
    "ایستگاه آزمایش تکمیلی شمال",
    "ایستگاه آزمایش تکمیلی جنوب",
    "ایستگاه آزمایش تکمیلی شرق",
  ];
  const existingStationsResponse = await request.get("/api1/stations");
  expect(existingStationsResponse.ok()).toBeTruthy();
  const existingStations = (await existingStationsResponse.json()) as {
    id: string;
    name: string;
  }[];
  const stations: Record<string, string> = {};
  for (const [index, name] of names.entries()) {
    const existing = existingStations.find((station) => station.name === name);
    if (existing) {
      stations[name] = String(existing.id);
      continue;
    }
    const response = await request.post("/api1/admin/stations", {
      headers,
      data: { name, lat: 32.6 + index * 0.002, lng: 51.3 + index * 0.002 },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    stations[name] = String((await response.json()).id);
  }
  const origin = stations[names[0]],
    destination = stations[names[8]];
  const driversResponse = await request.get("/api1/admin/drivers", { headers });
  const schedulesResponse = await request.get("/api1/admin/schedules", {
    headers,
  });
  expect(driversResponse.ok()).toBeTruthy();
  expect(schedulesResponse.ok()).toBeTruthy();
  const existingDrivers = (await driversResponse.json()) as {
    id: string;
    username: string;
  }[];
  const existingSchedules = (await schedulesResponse.json()) as {
    driverId: string;
    originStationId: string;
    destinationStationId: string;
  }[];
  for (const [index, capacity] of [23, 32, 44].entries()) {
    const existingDriver = existingDrivers.find(
      (driver) => driver.username === `design-driver-${index}`,
    );
    let driverId = existingDriver?.id;
    if (!driverId) {
      const driver = await request.post("/api1/admin/drivers", {
        headers,
        data: {
          name: `راننده آزمایش طراحی ${["یک", "دو", "سه"][index]}`,
          username: `design-driver-${index}`,
          password: "isolated-design-driver-password",
          licensePlate: `DESIGN-${capacity}`,
          capacity,
          phone: `0912000000${index + 1}`,
          assignedStations: [origin, destination],
        },
      });
      expect(driver.ok(), await driver.text()).toBeTruthy();
      driverId = String((await driver.json()).id);
    }
    if (
      existingSchedules.some(
        (schedule) =>
          String(schedule.driverId) === String(driverId) &&
          String(schedule.originStationId) === origin &&
          String(schedule.destinationStationId) === destination,
      )
    )
      continue;
    const schedule = await request.post("/api1/admin/schedules", {
      headers,
      data: {
        driverId,
        originStationId: origin,
        destinationStationId: destination,
        departureTime: ["06:25", "07:35", "08:45"][index],
        price: [480000, 400000, 350000][index],
      },
    });
    expect(schedule.ok(), await schedule.text()).toBeTruthy();
  }
  return {
    headers,
    origin,
    destination,
    originName: names[0],
    destinationName: names[8],
  };
}
