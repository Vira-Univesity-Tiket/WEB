import { test, expect, type Page } from "@playwright/test";
import { nationalCodeFor } from "./studentFixtures";
import {
  DOCUMENT_PNG,
  DOCUMENT_PDF,
  DRIVER_TEST_PASSWORD,
  purchaseDriverTicket,
  seedDriverDesign,
} from "./driverFixtures";

let catalog: Awaited<ReturnType<typeof seedDriverDesign>>;
test.beforeAll(async ({ request }) => {
  catalog = await seedDriverDesign(request);
});
async function login(page: Page, number = 999) {
  await page.goto("/driver");
  await page
    .getByLabel("نام کاربری راننده", { exact: true })
    .fill(catalog.drivers[number].username);
  await page
    .getByLabel("رمز عبور راننده", { exact: true })
    .fill(DRIVER_TEST_PASSWORD);
  await page.getByRole("button", { name: "ورود به پنل", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "پیمایش راننده" }),
  ).toBeVisible();
}
test("invalid login, legal content, rejected membership repair and private document validation stay connected to the server", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await page.goto("/driver");
  let authRequests = 0;
  page.on("request", (incoming) => {
    if (incoming.url().endsWith("/driver/login")) authRequests += 1;
  });
  await page.getByRole("button", { name: "ورود به پنل", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("نام کاربری");
  expect(authRequests).toBe(0);
  await page
    .getByLabel("نام کاربری راننده", { exact: true })
    .fill("driver-test");
  await page
    .getByLabel("رمز عبور راننده", { exact: true })
    .fill("invalid-driver-password");
  await page.getByRole("button", { name: "ورود به پنل", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("اشتباه");
  await expect(
    page.getByLabel("نام کاربری راننده", { exact: true }),
  ).toHaveValue("driver-test");
  await page
    .getByRole("button", { name: "قوانین و مقررات رانندگان", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "قوانین و مقررات رانندگان", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "قوانین و مقررات رانندگان", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "ثبت‌نام راننده", exact: true })
    .click();
  await page
    .getByLabel("نام و نام خانوادگی", { exact: true })
    .fill("راننده اصلاح مدارک");
  const national = nationalCodeFor("019876543");
  await page.getByLabel("کد ملی", { exact: true }).fill(national);
  await page.getByLabel("روز تولد", { exact: true }).fill("30");
  await page.getByLabel("ماه تولد", { exact: true }).selectOption("12");
  await page.getByLabel("سال تولد", { exact: true }).fill("1402");
  await page.getByLabel("شماره موبایل", { exact: true }).fill("09123456789");
  await page.getByLabel("دو رقم اول پلاک", { exact: true }).fill("19");
  await page.getByLabel("سه رقم پلاک", { exact: true }).fill("987");
  await page.getByLabel("کد منطقه پلاک", { exact: true }).fill("65");
  await page.getByRole("button", { name: "مرحله بعد", exact: true }).click();
  await expect(
    page.getByText("تاریخ تولد شمسی معتبر وارد کنید.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("سال تولد", { exact: true }).fill("1403");
  await page.getByRole("button", { name: "مرحله بعد", exact: true }).click();
  await page.getByLabel("تصویر کارت ملی", { exact: true }).setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(3 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toContainText("۳ مگابایت");
  await page.getByLabel("تصویر کارت ملی", { exact: true }).setInputFiles({
    name: "invalid.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("alert")).toContainText("محتوای فایل");
  await page.getByLabel("تصویر کارت ملی", { exact: true }).setInputFiles({
    name: "valid.png",
    mimeType: "image/png",
    buffer: DOCUMENT_PNG,
  });
  await page.getByLabel("تصویر گواهینامه", { exact: true }).setInputFiles({
    name: "license.pdf",
    mimeType: "application/pdf",
    buffer: DOCUMENT_PDF,
  });
  await page.getByLabel("تصویر کارت خودرو", { exact: true }).setInputFiles({
    name: "car.png",
    mimeType: "image/png",
    buffer: DOCUMENT_PNG,
  });
  await expect(
    page.getByRole("button", { name: "مرحله بعد", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "حذف تصویر کارت خودرو", exact: true })
    .click();
  await page.getByRole("button", { name: "مرحله بعد", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("هر سه مدرک");
  await page.getByLabel("تصویر کارت خودرو", { exact: true }).setInputFiles({
    name: "car.png",
    mimeType: "image/png",
    buffer: DOCUMENT_PNG,
  });
  await page.getByRole("button", { name: "مرحله بعد", exact: true }).click();
  await page
    .getByLabel("نام کاربری (انگلیسی)", { exact: true })
    .fill("repair-driver-ui");
  await page.getByLabel("رمز عبور", { exact: true }).fill(DRIVER_TEST_PASSWORD);
  const register = page.waitForResponse((response) =>
    response.url().endsWith("/driver/register"),
  );
  await page
    .getByRole("button", { name: "ثبت‌نام نهایی", exact: true })
    .click();
  expect((await register).ok()).toBeTruthy();
  await expect(
    page.getByRole("heading", { name: "وضعیت: در حال بررسی", exact: true }),
  ).toBeVisible();
  const pending = await request.get("/api1/admin/driver-requests", {
    headers: catalog.headers,
  });
  expect(pending.ok()).toBeTruthy();
  const driver = (await pending.json()).find(
    (item: { username: string }) => item.username === "repair-driver-ui",
  );
  expect(driver).toBeTruthy();
  const denied = await request.post(
    `/api1/admin/driver-requests/${driver.id}/reject`,
    {
      headers: catalog.headers,
      data: { reason: "تصویر گواهینامه باید خواناتر باشد." },
    },
  );
  expect(denied.ok()).toBeTruthy();
  await page.getByRole("button", { name: "بازگشت", exact: true }).click();
  await page
    .getByLabel("رمز عبور راننده", { exact: true })
    .fill(DRIVER_TEST_PASSWORD);
  await page.getByRole("button", { name: "ورود به پنل", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "تصویر گواهینامه باید خواناتر باشد.",
  );
  await expect(page.getByLabel("کد ملی", { exact: true })).toHaveValue(
    national,
  );
  await expect(
    page.getByRole("navigation", { name: "پیمایش راننده" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "مرحله بعد", exact: true }).click();
  await expect(
    page.getByText("مدرک درخواست قبلی", { exact: true }),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "مرحله بعد", exact: true }).click();
  await expect(
    page.getByLabel("نام کاربری (انگلیسی)", { exact: true }),
  ).toHaveValue("repair-driver-ui");
  await page
    .getByRole("button", { name: "ثبت‌نام نهایی", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "وضعیت: در حال بررسی", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    national,
  );
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(
    DRIVER_TEST_PASSWORD,
  );
  await page.getByRole("button", { name: "بازگشت", exact: true }).click();
  await page
    .getByLabel("رمز عبور راننده", { exact: true })
    .fill(DRIVER_TEST_PASSWORD);
  await page.getByRole("button", { name: "ورود به پنل", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "وضعیت: در حال بررسی", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("vira_driver_auth_token")),
  ).toBeNull();
});

test("dashboard and route failures never appear as zero or empty and a failed request retains its draft", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.route("**/api1/driver/*/summary", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "آمار آزمایشی در دسترس نیست" },
    }),
  );
  await page.route("**/api1/driver/*/dashboard", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "فهرست سرویس آزمایشی در دسترس نیست" },
    }),
  );
  await page.route("**/api1/driver/*/recent-scans", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "سوابق آزمایشی در دسترس نیست" },
    }),
  );
  await login(page);
  await expect(
    page.getByLabel("تعداد مسافران امروز", { exact: true }),
  ).toHaveText("—");
  await expect(page.getByLabel("درآمد خالص امروز", { exact: true })).toHaveText(
    "—",
  );
  await expect(
    page.getByText("برنامه فعالی برای امروز ثبت نشده است.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("هنوز مسافری ثبت نشده است.", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(3);
  await page.unrouteAll({ behavior: "wait" });
  await page
    .getByRole("button", { name: "تازه‌سازی اسکن‌های اخیر", exact: true })
    .click();
  await expect(
    page.getByLabel("تعداد مسافران امروز", { exact: true }),
  ).toHaveText("۰");
  await page.getByRole("button", { name: "درخواست مسیر", exact: true }).click();
  for (const [label, name] of [
    ["ایستگاه مبدأ", catalog.originName],
    ["ایستگاه مقصد", catalog.destinationName],
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("option", { name, exact: true }).click();
  }
  await page.getByLabel("ساعت حرکت", { exact: true }).fill("10:25");
  await page.getByLabel("قیمت (تومان)", { exact: true }).fill("۹۹۹");
  let writes = 0;
  page.on("request", (incoming) => {
    if (
      incoming.url().endsWith("/driver/route-requests") &&
      incoming.method() === "POST"
    )
      writes += 1;
  });
  await page.getByRole("button", { name: "ثبت درخواست", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("۱٬۰۰۰");
  expect(writes).toBe(0);
  await page.getByLabel("قیمت (تومان)", { exact: true }).fill("۳۰۰۰۰");
  await page.route("**/api1/driver/route-requests", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 503, json: { error: "خطای آزمایشی ثبت مسیر" } })
      : route.continue(),
  );
  await page.getByRole("button", { name: "ثبت درخواست", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("خطای آزمایشی ثبت مسیر");
  await expect(page.getByLabel("ساعت حرکت", { exact: true })).toHaveValue(
    "10:25",
  );
  await expect(page.getByLabel("قیمت (تومان)", { exact: true })).toHaveValue(
    "۳۰٬۰۰۰",
  );
  await expect(
    page.getByRole("button", { name: "ایستگاه مبدأ", exact: true }),
  ).toContainText(catalog.originName);
  await page.keyboard.press("Tab");
  expect(writes).toBe(1);
});

test("manual leading zeros remain strings and an uncertain server-side boarding is not retried automatically", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await login(page);
  await page.route("**/api1/driver/scan/code", (route) =>
    route.fulfill({ status: 400, json: { error: "کد آزمایشی معتبر نیست." } }),
  );
  const invalid = page.waitForResponse((response) =>
    response.url().endsWith("/driver/scan/code"),
  );
  await page
    .getByLabel("کد ۴ رقمی بلیت", { exact: true })
    .evaluate((element) => {
      const input = element as HTMLInputElement;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "٠٠٣٧");
      input.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertFromPaste",
          data: "٠٠٣٧",
        }),
      );
    });
  expect((await invalid).request().postDataJSON().code).toBe("0037");
  await expect(page.getByRole("alert")).toContainText("کد آزمایشی معتبر نیست");
  await page.unroute("**/api1/driver/scan/code");
  const ticket = await purchaseDriverTicket(request, catalog, 999);
  let submissions = 0;
  await page.route("**/api1/driver/scan/code", async (route) => {
    submissions += 1;
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    await route.fulfill({
      status: 503,
      json: { error: "پاسخ پس از ثبت واقعی در محیط تست قطع شد." },
    });
  });
  await page
    .getByLabel("کد ۴ رقمی بلیت", { exact: true })
    .fill(ticket.validationCode);
  await expect(page.getByRole("alert")).toContainText("نتیجه ثبت نامشخص است");
  await expect(
    page.getByLabel("تعداد مسافران امروز", { exact: true }),
  ).toHaveText("۰");
  await page.getByLabel("کد ۴ رقمی بلیت", { exact: true }).fill("");
  await page
    .getByLabel("کد ۴ رقمی بلیت", { exact: true })
    .fill(ticket.validationCode);
  await page.getByLabel("کد ۴ رقمی بلیت", { exact: true }).blur();
  expect(submissions).toBe(1);
  await page
    .getByRole("button", { name: "بررسی سوابق ثبت مسافر", exact: true })
    .click();
  await expect(
    page.getByLabel("تعداد مسافران امروز", { exact: true }),
  ).toHaveText("۱");
  await expect(page.locator(".driver-recent-row")).toHaveCount(1);
  expect(submissions).toBe(1);
});

test("a fresh read after boarding outranks older responses and logout rejects late data and a forged cache identity", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await login(page);
  await expect(
    page.getByLabel("تعداد مسافران امروز", { exact: true }),
  ).toHaveText(/^[۰-۹]+$/);
  const count = await page
    .getByLabel("تعداد مسافران امروز", { exact: true })
    .textContent();
  const current = String(
    Number(
      count!.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))),
    ) + 1,
  ).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
  let release!: () => void, fetched!: () => void, delivered!: () => void;
  const held = new Promise<void>((resolve) => {
      release = resolve;
    }),
    captured = new Promise<void>((resolve) => {
      fetched = resolve;
    }),
    completed = new Promise<void>((resolve) => {
      delivered = resolve;
    });
  let first = true;
  const url = `**/api1/driver/${catalog.drivers[999].id}/summary`;
  await page.route(url, async (route) => {
    if (!first) {
      await route.continue();
      return;
    }
    first = false;
    const response = await route.fetch();
    fetched();
    await held;
    await route.fulfill({ response });
    delivered();
  });
  await page
    .getByRole("button", { name: "تازه‌سازی اسکن‌های اخیر", exact: true })
    .click();
  await captured;
  const ticket = await purchaseDriverTicket(request, catalog, 999);
  await page
    .getByLabel("کد ۴ رقمی بلیت", { exact: true })
    .fill(ticket.validationCode);
  await expect(
    page.getByRole("status").filter({ hasText: "بلیت تایید شد" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("تعداد مسافران امروز", { exact: true }),
  ).toHaveText(current);
  release();
  await completed;
  await expect(
    page.getByLabel("تعداد مسافران امروز", { exact: true }),
  ).toHaveText(current!);
  await page.unroute(url);
  let releaseOld!: () => void, oldFetched!: () => void, oldDone!: () => void;
  const heldOld = new Promise<void>((resolve) => {
      releaseOld = resolve;
    }),
    capturedOld = new Promise<void>((resolve) => {
      oldFetched = resolve;
    }),
    doneOld = new Promise<void>((resolve) => {
      oldDone = resolve;
    });
  await page.route(url, async (route) => {
    const response = await route.fetch();
    oldFetched();
    await heldOld;
    await route.fulfill({ response });
    oldDone();
  });
  await page
    .getByRole("button", { name: "تازه‌سازی اسکن‌های اخیر", exact: true })
    .click();
  await capturedOld;
  await page.getByRole("button", { name: "خروج", exact: true }).click();
  await page
    .getByLabel("نام کاربری راننده", { exact: true })
    .fill(catalog.drivers[360].username);
  await page
    .getByLabel("رمز عبور راننده", { exact: true })
    .fill(DRIVER_TEST_PASSWORD);
  await page.getByRole("button", { name: "ورود به پنل", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "پیمایش راننده" }),
  ).toBeVisible();
  releaseOld();
  await doneOld;
  await expect(
    page.getByText(catalog.drivers[360].plate, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("تعداد مسافران امروز", { exact: true }),
  ).toHaveText("۰");
  await page.unroute(url);
  await page.evaluate((id) => {
    const profile = JSON.parse(localStorage.getItem("vira_driver_session")!);
    profile.id = id;
    localStorage.setItem("vira_driver_session", JSON.stringify(profile));
  }, catalog.drivers[999].id);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "ورود به پنل", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "پیمایش راننده" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("vira_driver_auth_token")),
  ).toBeNull();
  await page.goto("/deriver?driverView=scan");
  await page
    .getByLabel("نام کاربری راننده", { exact: true })
    .fill(catalog.drivers[360].username);
  await page
    .getByLabel("رمز عبور راننده", { exact: true })
    .fill(DRIVER_TEST_PASSWORD);
  await page.getByRole("button", { name: "ورود به پنل", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "پیمایش راننده" });
  await expect(
    nav.getByRole("button", { name: "اسکن", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.locator("video")).toHaveCount(0);
  await nav.getByRole("button", { name: "پروفایل", exact: true }).click();
  await expect(page).toHaveURL(/driverView=profile/);
  await page.goBack();
  await expect(
    nav.getByRole("button", { name: "اسکن", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(
    nav.getByRole("button", { name: "اسکن", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});
