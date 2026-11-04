import { test, expect, type Page } from "@playwright/test";
import { nationalCodeFor, seedStudentDesign } from "./studentFixtures";

const fail = {
  status: 503,
  contentType: "application/json",
  body: JSON.stringify({ error: "خطای آزمایشی شبکه" }),
};
let catalog: Awaited<ReturnType<typeof seedStudentDesign>>;
test.beforeAll(async ({ request }) => {
  catalog = await seedStudentDesign(request);
});

async function register(page: Page, suffix: string) {
  await page.goto("/");
  await page.getByRole("tab", { name: "ثبت‌نام", exact: true }).click();
  await page
    .getByLabel("نام و نام خانوادگی", { exact: true })
    .fill("دانشجوی بررسی خطا");
  await page
    .getByLabel("شماره دانشجویی", { exact: true })
    .fill(`8200000${suffix}`);
  await page
    .getByLabel("کد ملی", { exact: true })
    .fill(nationalCodeFor(`9800000${suffix}`));
  await page.getByRole("button", { name: "شروع کنید", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "حساب کاربری", exact: true }),
  ).toBeVisible();
}

test("authentication keeps invalid input, changes tabs without submitting and preserves legal and driver destinations", async ({
  page,
}) => {
  await page.goto("/");
  const submit = page.getByRole("button", {
    name: "ورود به حساب",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  await page.getByLabel("شماره دانشجویی", { exact: true }).fill("123");
  await page.getByLabel("کد ملی", { exact: true }).fill("1111111111");
  await page.getByLabel("کد ملی", { exact: true }).blur();
  await expect(page.getByLabel("کد ملی", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(submit).toBeDisabled();
  await page.getByLabel("شماره دانشجویی", { exact: true }).fill("899999999");
  const national = nationalCodeFor("988888888");
  await page.getByLabel("کد ملی", { exact: true }).fill(national);
  const rejected = page.waitForResponse((response) =>
    response.url().endsWith("/auth/login"),
  );
  await submit.click();
  expect((await rejected).ok()).toBeFalsy();
  await expect(page.locator("form").getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("کد ملی", { exact: true })).toHaveValue(
    national,
  );
  let submissions = 0;
  page.on("request", (request) => {
    if (/\/auth\/(login|register)$/.test(request.url())) submissions += 1;
  });
  const loginTab = page.getByRole("tab", { name: "ورود", exact: true });
  await loginTab.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("tab", { name: "ثبت‌نام", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(loginTab).toHaveAttribute("aria-selected", "true");
  expect(submissions).toBe(0);
  await page
    .getByRole("button", { name: "قوانین و مقررات", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "قوانین و مقررات کاربر", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "قوانین و مقررات", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "ورود به بخش رانندگان", exact: true })
    .click();
  await expect(page).toHaveURL(/\/driver$/);
  await expect(
    page.getByLabel("نام کاربری راننده", { exact: true }),
  ).toBeVisible();
});

test("station retry, late schedule responses, unavailable routes and full services keep the selected route consistent", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.route("**/api1/stations", (route) => route.fulfill(fail));
  await register(page, "11");
  await page.getByRole("button", { name: "رزرو بلیت", exact: true }).click();
  const origin = page.getByRole("button", { name: "مبدأ حرکت", exact: true });
  const destination = page.getByRole("button", {
    name: "مقصد نهایی",
    exact: true,
  });
  await origin.click();
  const picker = page.getByRole("dialog", { name: "مبدأ حرکت", exact: true });
  await expect(picker.getByRole("alert")).toContainText("خطای آزمایشی شبکه");
  await page.unroute("**/api1/stations");
  await picker
    .getByRole("button", { name: "تلاش دوباره", exact: true })
    .click();
  await picker
    .getByRole("option", { name: catalog.originName, exact: true })
    .click();
  let release!: () => void;
  let oldResultDelivered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const delivered = new Promise<void>((resolve) => {
    oldResultDelivered = resolve;
  });
  await page.route("**/api1/bus/schedule", async (route) => {
    if (route.request().postDataJSON().destination === catalog.destination) {
      const response = await route.fetch();
      await held;
      await route.fulfill({ response });
      oldResultDelivered();
    } else await route.continue();
  });
  await destination.click();
  await page
    .getByRole("option", { name: catalog.destinationName, exact: true })
    .click();
  await expect(
    page.getByText("در حال دریافت سرویس‌ها…", { exact: true }),
  ).toBeVisible();
  await destination.click();
  await page
    .getByRole("option", { name: "ایستگاه آزمایش تکمیلی شمال", exact: true })
    .click();
  await expect(
    page.getByText("برای این مسیر در حال حاضر سرویسی یافت نشد.", {
      exact: true,
    }),
  ).toBeVisible();
  release();
  await delivered;
  await expect(
    page.getByRole("button", { name: "انتخاب بلیت", exact: true }),
  ).toHaveCount(0);
  await expect(destination).toContainText("ایستگاه آزمایش تکمیلی شمال");
  await page.unroute("**/api1/bus/schedule");
  await page.route("**/api1/bus/schedule", (route) => route.fulfill(fail));
  await destination.click();
  await page
    .getByRole("option", { name: catalog.destinationName, exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("خطای آزمایشی شبکه");
  await expect(origin).toContainText(catalog.originName);
  await page.unroute("**/api1/bus/schedule");
  await page.route("**/api1/bus/schedule", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: (await response.json()).map((bus: Record<string, unknown>) => ({
        ...bus,
        remainingSeats: 0,
      })),
    });
  });
  await page.getByRole("button", { name: "تلاش دوباره", exact: true }).click();
  await expect(page.getByText("ظرفیت تکمیل است", { exact: true })).toHaveCount(
    3,
  );
  for (const button of await page
    .getByRole("button", { name: "انتخاب بلیت", exact: true })
    .all())
    await expect(button).toBeDisabled();
  await page.unroute("**/api1/bus/schedule");
  await page
    .getByRole("button", { name: "تازه‌سازی سرویس‌ها", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "انتخاب بلیت", exact: true }).first(),
  ).toBeEnabled();
  await expect(origin).toContainText(catalog.originName);
  await expect(destination).toContainText(catalog.destinationName);
});

test("resource errors never look empty, payment callbacks remain authoritative and support failures preserve drafts and files", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await register(page, "12");
  await page.route("**/api1/auth/me", (route) => route.fulfill(fail));
  await page.route("**/api1/wallet/transactions?*", (route) =>
    route.fulfill(fail),
  );
  const navigation = page.getByRole("navigation", { name: "پیمایش اصلی" });
  await navigation
    .getByRole("button", { name: "کیف پول", exact: true })
    .click();
  await expect(
    page.getByText("دریافت موجودی ناموفق بود", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "هنوز تراکنشی ثبت نشده است",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.unroute("**/api1/auth/me");
  await page.unroute("**/api1/wallet/transactions?*");
  await page
    .getByRole("button", { name: "بروزرسانی کیف پول", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "هنوز تراکنشی ثبت نشده است",
      exact: true,
    }),
  ).toBeVisible();
  await page.route("**/api1/tickets?*", (route) => route.fulfill(fail));
  await navigation
    .getByRole("button", { name: "بلیت‌ها", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("خطای آزمایشی شبکه");
  await expect(
    page.getByRole("heading", { name: "بلیت فعالی ندارید", exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api1/tickets?*");
  await page.getByRole("button", { name: "تلاش دوباره", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "بلیت فعالی ندارید", exact: true }),
  ).toBeVisible();
  await page.route("**/api1/wallet/topup/status/untrusted-callback", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "failed",
        message: "پرداخت آزمایشی تأیید نشد.",
      }),
    }),
  );
  await page.goto(
    "/?view=wallet&topupTransactionId=untrusted-callback&topupStatus=success",
  );
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "پرداخت آزمایشی تأیید نشد." })
      .first(),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/topupTransactionId/);
  await page.route("**/api1/wallet/topup/initiate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        paymentUrl: "javascript:alert(1)",
      }),
    }),
  );
  await page
    .getByRole("button", { name: "افزایش موجودی", exact: true })
    .click();
  const topup = page.getByRole("dialog", {
    name: "افزایش موجودی",
    exact: true,
  });
  await topup
    .getByRole("button", { name: "پرداخت آنلاین", exact: true })
    .click();
  await expect(topup.getByRole("alert")).toContainText(
    "لینک پرداخت معتبر نیست",
  );
  await page.keyboard.press("Escape");
  await navigation.getByRole("button", { name: "خانه", exact: true }).click();
  await page
    .locator(".student-service-grid")
    .getByRole("button", { name: "پشتیبانی", exact: true })
    .click();
  await page.getByRole("button", { name: "تیکت جدید", exact: true }).click();
  const title = page.getByLabel("عنوان تیکت", { exact: true });
  const description = page.getByLabel("توضیحات", { exact: true });
  await title.fill("حفظ پیش‌نویس هنگام خطای شبکه");
  await description.fill("عنوان و متن و ضمیمه نباید در شکست ارسال پاک شوند.");
  const files = page.getByLabel("افزودن فایل به تیکت");
  await files.setInputFiles({
    name: "oversized.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1, "x"),
  });
  await expect(page.locator("form").getByRole("alert")).toContainText("۵");
  await files.setInputFiles(
    Array.from({ length: 6 }, (_, index) => ({
      name: `${index}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from("test"),
    })),
  );
  await expect(page.locator("form").getByRole("alert")).toContainText("۵ فایل");
  await files.setInputFiles({
    name: "preserved.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("isolated test"),
  });
  await expect(page.getByText("preserved.txt", { exact: true })).toBeVisible();
  await page.route("**/api1/support/tickets", (route) => route.fulfill(fail));
  await page.getByRole("button", { name: "ثبت تیکت", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "خطای آزمایشی شبکه",
  );
  await expect(title).toHaveValue("حفظ پیش‌نویس هنگام خطای شبکه");
  await expect(description).toHaveValue(
    "عنوان و متن و ضمیمه نباید در شکست ارسال پاک شوند.",
  );
  await expect(page.getByText("preserved.txt", { exact: true })).toBeVisible();
});
