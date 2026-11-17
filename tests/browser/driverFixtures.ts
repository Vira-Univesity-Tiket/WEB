import { expect, type APIRequestContext } from "@playwright/test";
import { seedStudentDesign } from "./studentFixtures";

export const DRIVER_TEST_PASSWORD = "isolated-driver-ui-password";
export const DOCUMENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWMQSrwvlHifAUIBACHSBUkvEEcpAAAAAElFTkSuQmCC",
  "base64",
);
export async function seedDriverDesign(request: APIRequestContext) {
  const catalog = await seedStudentDesign(request);
  const stations = (await (await request.get("/api1/stations")).json()) as {
    id: string;
    name: string;
  }[];
  const third = String(
    stations.find((station) => station.name === "ایستگاه آزمایش تکمیلی شمال")!
      .id,
  );
  const driversResponse = await request.get("/api1/admin/drivers", {
    headers: catalog.headers,
  });
  expect(driversResponse.ok()).toBeTruthy();
  const existingDrivers = (await driversResponse.json()) as {
    id: string;
    username: string;
  }[];
  const schedulesResponse = await request.get("/api1/admin/schedules", {
    headers: catalog.headers,
  });
  expect(schedulesResponse.ok()).toBeTruthy();
  const schedules = (await schedulesResponse.json()) as {
    id: string;
    driverId: string;
    departureTime: string;
  }[];
  const drivers: Record<
    number,
    { id: string; username: string; schedule: string; plate: string }
  > = {};
  for (const width of [360, 390, 430, 768, 1280, 999]) {
    const username = `ui-driver-${width}`,
      plate = `UI-${width}`;
    let id = existingDrivers.find((driver) => driver.username === username)?.id;
    if (!id) {
      const created = await request.post("/api1/admin/drivers", {
        headers: catalog.headers,
        data: {
          name: "راننده ارزیابی پنل ویرا",
          username,
          password: DRIVER_TEST_PASSWORD,
          licensePlate: plate,
          capacity: 40,
          phone: "09120000002",
          assignedStations: [catalog.origin, catalog.destination, third],
        },
      });
      expect(created.ok(), await created.text()).toBeTruthy();
      id = String((await created.json()).id);
    }
    let firstSchedule = "";
    for (const [index, [origin, destination, time]] of [
      [catalog.origin, catalog.destination, "12:30"],
      [catalog.destination, third, "15:30"],
    ].entries()) {
      const existing = schedules.find(
        (schedule) =>
          String(schedule.driverId) === String(id) &&
          schedule.departureTime.startsWith(time),
      );
      let scheduleId = existing?.id;
      if (!scheduleId) {
        const created = await request.post("/api1/admin/schedules", {
          headers: catalog.headers,
          data: {
            driverId: id,
            originStationId: origin,
            destinationStationId: destination,
            departureTime: time,
            price: 500000,
          },
        });
        expect(created.ok(), await created.text()).toBeTruthy();
        scheduleId = String((await created.json()).id);
      }
      if (index === 0) firstSchedule = String(scheduleId);
    }
    drivers[width] = {
      id: String(id),
      username,
      schedule: firstSchedule,
      plate,
    };
  }
  const funded = await request.post("/api1/admin/topup", {
    headers: catalog.headers,
    data: { studentId: "900000001", amount: 1000000 },
  });
  expect(funded.ok()).toBeTruthy();
  const login = await request.post("/api1/auth/login", {
    data: { student_id: "900000001", national_code: "1234567891" },
  });
  expect(login.ok()).toBeTruthy();
  const profile = await login.json();
  const studentHeaders = {
    Authorization: `Bearer ${profile.authToken || profile.token}`,
  };
  return { ...catalog, drivers, studentHeaders };
}
export async function purchaseDriverTicket(
  request: APIRequestContext,
  catalog: Awaited<ReturnType<typeof seedDriverDesign>>,
  width: number,
) {
  const response = await request.post("/api1/tickets/reserve", {
    headers: {
      ...catalog.studentHeaders,
      "Idempotency-Key": `driver-ui-${width}-${crypto.randomUUID()}`,
    },
    data: {
      schedule_id: catalog.drivers[width].schedule,
      origin_station_id: catalog.origin,
      destination_station_id: catalog.destination,
      departure_time: "12:30",
      seatCount: 1,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).ticket as {
    qrCode: string;
    validationCode: string;
    id: string;
  };
}

export const DOCUMENT_PDF = Buffer.from(
  "JVBERi0xLjcKJYGBgYEKCjUgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL1R5cGUgL09ialN0bQovTiA0Ci9GaXJzdCAyMAovTGVuZ3RoIDMwMwo+PgpzdHJlYW0KeJzVUk1rhDAQvedXzLE9OYkx6iJC68elFJZlTy17kDUswrIpfkD77zuTaEsPpecqj5jMm5k35klAUKA1xJBmoMEkGopCRMePNwvRvrvYSURPQz/BK0URDnASUeWW2wxSlKX45lbd3F3dRYQkkEzeGPvR9cvZjlC0TdsipohoNMEgqprWipATFO0ppjL6JqR6BZ2lMWL8QLE2wKQhh+Oem6z5Da3ENcypA1dnYf/Vl3s1oYb6S09eiujZ9XU3W7irdwqVkVJyCj0v9/Q7RtvN7v8O5/UP7vb7hMdhvtptPp0HvV4D15KrziT04RkTs+pXIc5nG4dz05XndbVhJj9jvdZpmFP+dBgbi+01Wnaf91d0sJNbxjMZjngl35Tth+7RvZNfkV7q7XHi4Cc92KcrCmVuZHN0cmVhbQplbmRvYmoKCjYgMCBvYmoKPDwKL1NpemUgNwovUm9vdCAyIDAgUgovSW5mbyAzIDAgUgovRmlsdGVyIC9GbGF0ZURlY29kZQovVHlwZSAvWFJlZgovTGVuZ3RoIDM1Ci9XIFsgMSAyIDIgXQovSW5kZXggWyAwIDcgXQo+PgpzdHJlYW0KeJwVxDEOACAIBLAext3/774TQoeiu1y2bLWdeCSfAUQKAtkKZW5kc3RyZWFtCmVuZG9iagoKc3RhcnR4cmVmCjQyMQolJUVPRg==",
  "base64",
);
