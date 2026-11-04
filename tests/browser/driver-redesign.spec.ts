import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { nationalCodeFor } from "./studentFixtures";
import {
  DOCUMENT_PNG,
  DRIVER_TEST_PASSWORD,
  purchaseDriverTicket,
  seedDriverDesign,
} from "./driverFixtures";

let catalog: Awaited<ReturnType<typeof seedDriverDesign>>;
test.beforeAll(async ({ request }) => {
  catalog = await seedDriverDesign(request);
});
const fa = (value: string) =>
  value.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(
    await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          ".driver-card, .driver-page-content, .driver-registration-card, .driver-navigation, .driver-shell",
        ),
      ]
        .filter(
          (element) =>
            element.getClientRects().length &&
            element.scrollWidth > element.clientWidth + 1,
        )
        .map((element) => element.className),
    ),
  ).toEqual([]);
}
async function login(page: Page, width: number) {
  await page.goto("/driver");
  await page
    .getByLabel("نام کاربری راننده", { exact: true })
    .fill(catalog.drivers[width].username);
  await page
    .getByLabel("رمز عبور راننده", { exact: true })
    .fill(DRIVER_TEST_PASSWORD);
  await page.getByRole("button", { name: "ورود به پنل", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "پیمایش راننده" }),
  ).toBeVisible();
}

for (const width of [360, 390, 430, 768, 1280]) {
  test(`10 driver reference states remain functional at ${width}px`, async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const accessibility: unknown[] = [];
    const directory = `test-results/driver-redesign/${width}`;
    await mkdir(directory, { recursive: true });
    const capture = async (number: number, name: string) => {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          [...document.images].map((image) =>
            image.decode().catch(() => undefined),
          ),
        );
      });
      await noOverflow(page);
      await page.screenshot({
        path: `${directory}/${String(number).padStart(2, "0")}-${name}.png`,
        fullPage: true,
      });
      if (width === 390) {
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        accessibility.push(
          ...result.violations
            .filter((item) =>
              ["serious", "critical"].includes(item.impact || ""),
            )
            .map((item) => ({
              number,
              id: item.id,
              nodes: item.nodes.map((node) => ({
                html: node.html,
                failure: node.failureSummary,
              })),
            })),
        );
      }
    };
    const captureExtra = async (name: string) => {
      if (width !== 390) return;
      await noOverflow(page);
      await page.screenshot({
        path: `${directory}/extra-${name}.png`,
        fullPage: true,
      });
    };
    await page.goto("/driver");
    await expect(
      page.getByRole("button", { name: "ورود به پنل", exact: true }),
    ).toBeEnabled();
    await capture(1, "driver-login");
    await page
      .getByRole("button", { name: "ثبت‌نام راننده", exact: true })
      .click();
    await capture(2, "registration-personal-vehicle");
    if (width === 390) {
      await page
        .getByRole("button", { name: "مرحله بعد", exact: true })
        .scrollIntoViewIfNeeded();
      await captureExtra("D02-plate-actions");
    }
    await page.getByRole("button", { name: "مرحله بعد", exact: true }).click();
    await expect(
      page.getByText("نام و نام خانوادگی الزامی است.", { exact: true }),
    ).toBeVisible();
    const national = nationalCodeFor("01234" + String(width).padStart(4, "0"));
    await page
      .getByLabel("نام و نام خانوادگی", { exact: true })
      .fill("راننده آزمون ثبت‌نام");
    await page.getByLabel("کد ملی", { exact: true }).fill(fa(national));
    await page.getByLabel("روز تولد", { exact: true }).fill("۲");
    await page.getByLabel("ماه تولد", { exact: true }).selectOption("1");
    await page.getByLabel("سال تولد", { exact: true }).fill("۱۳۸۰");
    await page
      .getByLabel("شماره موبایل", { exact: true })
      .fill(fa("0912000" + String(width).padStart(4, "0")));
    await page.getByLabel("دو رقم اول پلاک", { exact: true }).fill("۱۱");
    await page.getByLabel("حرف پلاک", { exact: true }).selectOption("ب");
    await page
      .getByLabel("سه رقم پلاک", { exact: true })
      .fill(String(width).slice(-3));
    await page.getByLabel("کد منطقه پلاک", { exact: true }).fill("۶۷");
    await page.getByRole("button", { name: "مرحله بعد", exact: true }).click();
    await capture(3, "registration-documents");
    if (width === 390) {
      await page
        .getByRole("button", { name: "مرحله بعد", exact: true })
        .scrollIntoViewIfNeeded();
      await captureExtra("D03-document-actions");
    }
    for (const label of [
      "تصویر کارت ملی",
      "تصویر گواهینامه",
      "تصویر کارت خودرو",
    ])
      await page.getByLabel(label, { exact: true }).setInputFiles({
        name: `${label}.png`,
        mimeType: "image/png",
        buffer: DOCUMENT_PNG,
      });
    await expect(
      page.getByRole("button", { name: "مرحله بعد", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "مرحله بعد", exact: true }).click();
    await capture(4, "registration-account");
    if (width === 390) {
      await page
        .getByRole("button", { name: "ثبت‌نام نهایی", exact: true })
        .scrollIntoViewIfNeeded();
      await captureExtra("D04-account-actions");
    }
    await expect(
      page.getByRole("heading", { name: "ثبت‌نام راننده جدید", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "قبلی", exact: true }).click();
    await expect(
      page.getByRole("img", { name: "پیش‌نمایش تصویر کارت ملی", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "قبلی", exact: true }).click();
    await expect(page.getByLabel("کد ملی", { exact: true })).toHaveValue(
      national,
    );
    await page.getByRole("button", { name: "مرحله بعد", exact: true }).click();
    await page.getByRole("button", { name: "مرحله بعد", exact: true }).click();
    await page
      .getByLabel("نام کاربری (انگلیسی)", { exact: true })
      .fill(`ui-registration-${width}`);
    await page
      .getByLabel("رمز عبور", { exact: true })
      .fill(DRIVER_TEST_PASSWORD);
    if (width === 390) {
      await page.route("**/api1/driver/register", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "خطای آزمایشی ثبت درخواست" }),
        }),
      );
      await page
        .getByRole("button", { name: "ثبت‌نام نهایی", exact: true })
        .click();
      await expect(page.getByRole("alert")).toContainText(
        "خطای آزمایشی ثبت درخواست",
      );
      await expect(
        page.getByLabel("نام کاربری (انگلیسی)", { exact: true }),
      ).toHaveValue("ui-registration-390");
      await page.unroute("**/api1/driver/register");
    }
    let registered = 0;
    page.on("request", (incoming) => {
      if (incoming.url().endsWith("/driver/register")) registered += 1;
    });
    const registration = page.waitForResponse((response) =>
      response.url().endsWith("/driver/register"),
    );
    await page
      .getByRole("button", { name: "ثبت‌نام نهایی", exact: true })
      .click({ clickCount: 3 });
    const submitted = await registration;
    expect(submitted.ok()).toBeTruthy();
    expect(submitted.request().postDataJSON()).toMatchObject({
      nationalCode: national,
      birthDate: "1380/1/2",
      username: `ui-registration-${width}`,
      documents: {
        nationalCard: expect.stringMatching(/^data:image\/png;base64,/),
      },
    });
    expect(registered).toBe(1);
    await expect(
      page.getByRole("heading", { name: "وضعیت: در حال بررسی", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "پیمایش راننده" }),
    ).toHaveCount(0);
    await capture(5, "registration-under-review");
    expect(
      await page.evaluate(() => localStorage.getItem("vira_driver_auth_token")),
    ).toBeNull();
    expect(
      await page.evaluate(() => JSON.stringify(localStorage)),
    ).not.toContain(national);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "ورود به پنل", exact: true }),
    ).toBeVisible();
    await login(page, width);
    const navigation = page.getByRole("navigation", { name: "پیمایش راننده" });
    await expect(navigation.getByRole("button")).toHaveText([
      "داشبورد",
      "اسکن",
      "درخواست مسیر",
      "پروفایل",
    ]);
    await expect(
      page.getByLabel("تعداد مسافران امروز", { exact: true }),
    ).toHaveText("۰");
    await capture(6, "driver-dashboard");
    const ticket = await purchaseDriverTicket(request, catalog, width);
    const scan = page.waitForResponse((response) =>
      response.url().endsWith("/driver/scan/code"),
    );
    await page
      .getByLabel("کد ۴ رقمی بلیت", { exact: true })
      .fill(fa(ticket.validationCode));
    const scanResponse = await scan;
    expect(scanResponse.ok()).toBeTruthy();
    expect(scanResponse.request().postDataJSON()).toMatchObject({
      code: ticket.validationCode,
      driverId: catalog.drivers[width].id,
    });
    await expect(
      page.getByLabel("تعداد مسافران امروز", { exact: true }),
    ).toHaveText("۱");
    await expect(
      page.getByLabel("درآمد خالص امروز", { exact: true }),
    ).toContainText("۴۵٬۰۰۰");
    await expect(page.locator(".driver-recent-row")).toHaveCount(1);
    await page.locator(".driver-services").scrollIntoViewIfNeeded();
    await page.locator(".driver-recent-scans").scrollIntoViewIfNeeded();
    await capture(7, "dashboard-services-recent-scans");
    await page.locator(".driver-recent-row").last().scrollIntoViewIfNeeded();
    await expect(page.locator(".driver-recent-row").last()).toBeInViewport();
    await navigation.getByRole("button", { name: "اسکن", exact: true }).click();
    await capture(8, "ticket-scanner");
    if (width === 390) {
      await page.evaluate(() =>
        Object.defineProperty(navigator, "mediaDevices", {
          configurable: true,
          value: {
            getUserMedia: async () => {
              throw new DOMException(
                "denied for isolated test",
                "NotAllowedError",
              );
            },
          },
        }),
      );
      await page.getByRole("button", { name: /اسکن با دوربین/ }).click();
      const scanner = page.getByRole("dialog", {
        name: "اسکن بلیت مسافر",
        exact: true,
      });
      await expect(scanner.getByRole("alert")).toContainText(
        "دسترسی به دوربین مسدود است",
      );
      await scanner
        .getByRole("button", { name: "ورود کد ۴ رقمی", exact: true })
        .click();
      await expect(
        scanner.getByLabel("کد ۴ رقمی بلیت", { exact: true }),
      ).toBeFocused();
      await scanner
        .getByLabel("کد ۴ رقمی بلیت", { exact: true })
        .fill(fa(ticket.validationCode));
      await expect(scanner.getByRole("alert")).toContainText("قبلاً");
      await scanner
        .getByRole("button", { name: "بستن اسکنر", exact: true })
        .click();
    }
    await navigation
      .getByRole("button", { name: "درخواست مسیر", exact: true })
      .click();
    await expect(
      page.getByText("درخواستی ثبت نشده است.", { exact: true }),
    ).toBeVisible();
    await capture(9, "route-request");
    if (width === 390) {
      await page.locator(".driver-route-list").scrollIntoViewIfNeeded();
      await captureExtra("D09-empty-request-list");
    }
    for (const [label, station] of [
      ["ایستگاه مبدأ", catalog.originName],
      ["ایستگاه مقصد", catalog.destinationName],
    ]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.getByRole("option", { name: station, exact: true }).click();
    }
    await page.getByLabel("ساعت حرکت", { exact: true }).fill("09:45");
    await page.getByLabel("قیمت (تومان)", { exact: true }).fill("۲۵۰۰۰");
    await expect(
      page.getByText("بیست و پنج هزار تومان", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "به‌روزرسانی", exact: true })
      .click();
    await expect(page.getByLabel("ساعت حرکت", { exact: true })).toHaveValue(
      "09:45",
    );
    const route = page.waitForResponse(
      (response) =>
        response.url().endsWith("/driver/route-requests") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "ثبت درخواست", exact: true })
      .click({ clickCount: 3 });
    const routeResponse = await route;
    expect(routeResponse.ok()).toBeTruthy();
    expect(routeResponse.request().postDataJSON()).toEqual({
      originStationId: catalog.origin,
      destinationStationId: catalog.destination,
      departureTime: "09:45",
      priceToman: 25000,
    });
    await expect(
      page.getByText("در انتظار بررسی", { exact: true }),
    ).toBeVisible();
    await navigation
      .getByRole("button", { name: "پروفایل", exact: true })
      .click();
    await expect(
      page.getByText(catalog.drivers[width].username, { exact: true }),
    ).toBeVisible();
    await capture(10, "driver-profile");
    await expect(
      navigation.getByRole("button", { name: "پروفایل", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "پروفایل", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "خروج از حساب", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "ورود به پنل", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem("vira_driver_session")),
    ).toBeNull();
    expect(
      await page.evaluate(() => localStorage.getItem("vira_driver_auth_token")),
    ).toBeNull();
    await expect(
      page.getByText(catalog.drivers[width].username, { exact: true }),
    ).toHaveCount(0);
    expect(accessibility).toEqual([]);
    expect(errors).toEqual([]);
  });
}
