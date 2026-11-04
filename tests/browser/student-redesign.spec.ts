import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import jsQR from "jsqr";
import { mkdir, readFile } from "node:fs/promises";
import { seedStudentDesign, nationalCodeFor } from "./studentFixtures";

let catalog: Awaited<ReturnType<typeof seedStudentDesign>>;
test.beforeAll(async ({ request }) => {
  catalog = await seedStudentDesign(request);
});

async function ready(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((image) =>
        image.decode().catch(() => undefined),
      ),
    );
  });
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        ".student-content, .student-auth, .student-sheet-body, .student-shell",
      ),
    ]
      .filter(
        (element) =>
          element.getClientRects().length > 0 &&
          element.scrollWidth > element.clientWidth + 1,
      )
      .map((element) => ({
        className: element.className,
        width: element.clientWidth,
        scroll: element.scrollWidth,
      })),
  );
  expect(overflow).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
}

for (const width of [360, 390, 430, 768, 1280]) {
  test(`18 student reference states remain functional at ${width}px`, async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
    const errors: string[] = [];
    const accessibilityIssues: unknown[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const directory = `test-results/redesign/${width}`;
    await mkdir(directory, { recursive: true });
    const capture = async (number: number, name: string) => {
      await ready(page);
      await noOverflow(page);
      await expect(page.locator(".student-toast-surface p")).toHaveCount(0, {
        timeout: 6000,
      });
      await page.screenshot({
        path: `${directory}/${String(number).padStart(2, "0")}-${name}.png`,
        fullPage: true,
      });
      if (width === 390) {
        const result = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        accessibilityIssues.push(
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
      await ready(page);
      await noOverflow(page);
      await page.screenshot({
        path: `${directory}/extra-${name}.png`,
        fullPage: true,
      });
    };
    let releaseConfig!: () => void;
    const configHeld = new Promise<void>((resolve) => {
      releaseConfig = resolve;
    });
    await page.route("**/runtime-config.json", async (route) => {
      const response = await route.fetch();
      await configHeld;
      await route.fulfill({ response });
    });
    await page.goto("/");
    await expect(
      page.getByRole("status", { name: "آماده‌سازی ویرا" }),
    ).toBeVisible();
    await capture(1, "splash");
    const configReady = page.waitForResponse((response) =>
      response.url().endsWith("/runtime-config.json"),
    );
    releaseConfig();
    await configReady;
    await page.unrouteAll({ behavior: "wait" });
    await expect(
      page.getByRole("button", { name: "ورود به حساب", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ورود به حساب", exact: true }),
    ).toBeDisabled();
    await capture(2, "student-login");
    await page.getByRole("tab", { name: "ثبت‌نام", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "شروع کنید" }),
    ).toBeDisabled();
    await capture(3, "student-registration");
    if (width === 390) {
      await page
        .getByRole("button", { name: "ورود به بخش رانندگان", exact: true })
        .scrollIntoViewIfNeeded();
      await captureExtra("U03-registration-actions");
    }
    const studentId = `81000${String(width).padStart(4, "0")}`;
    const national = nationalCodeFor(`97000${String(width).padStart(4, "0")}`);
    await page
      .getByLabel("نام و نام خانوادگی", { exact: true })
      .fill("دانشجوی آزمایش رابط");
    await page.getByLabel("شماره دانشجویی", { exact: true }).fill(studentId);
    await page.getByLabel("کد ملی", { exact: true }).fill(national);
    const registration = page.waitForResponse((response) =>
      response.url().endsWith("/auth/register"),
    );
    await page.getByRole("button", { name: "شروع کنید" }).click();
    expect((await registration).ok()).toBeTruthy();
    await expect(
      page.getByRole("button", { name: "حساب کاربری", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("دانشجوی آزمایش رابط", { exact: true }),
    ).toBeVisible();
    await capture(4, "home");
    const bannerOverlap = await page
      .locator(".student-hero")
      .evaluate((banner) => {
        const art = banner
          .querySelector(".student-hero-bus")!
          .getBoundingClientRect();
        const copy = banner
          .querySelector(".student-hero-text")!
          .getBoundingClientRect();
        return (
          Math.min(art.right, copy.right) - Math.max(art.left, copy.left) > 1 &&
          Math.min(art.bottom, copy.bottom) - Math.max(art.top, copy.top) > 1
        );
      });
    expect(
      bannerOverlap,
      "booking banner illustration must leave the text and action readable",
    ).toBe(false);
    const navigation = page.getByRole("navigation", { name: "پیمایش اصلی" });
    await expect(navigation.getByRole("button")).toHaveText([
      "خانه",
      "رزرو",
      "بلیت‌ها",
      "کیف پول",
    ]);
    await navigation
      .getByRole("button", { name: "بلیت‌ها", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "بلیت فعالی ندارید", exact: true }),
    ).toBeVisible();
    await capture(8, "my-tickets-empty");
    await navigation
      .getByRole("button", { name: "کیف پول", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "هنوز تراکنشی ثبت نشده است" }),
    ).toBeVisible();
    await capture(9, "wallet");
    await page
      .getByRole("button", { name: "افزایش موجودی", exact: true })
      .click();
    const topup = page.getByRole("dialog", {
      name: "افزایش موجودی",
      exact: true,
    });
    await expect(
      topup.getByRole("button", { name: "۲۰٬۰۰۰", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await capture(10, "add-funds");
    await topup.getByRole("button", { name: "۱۰٬۰۰۰", exact: true }).click();
    await expect(topup.getByLabel("مبلغ مورد نظر را وارد کنید")).toHaveValue(
      "۱۰٬۰۰۰",
    );
    await topup.getByLabel("مبلغ مورد نظر را وارد کنید").fill("۲۵۰۰۰");
    await expect(
      topup.getByText("بیست و پنج هزار تومان", { exact: true }),
    ).toBeVisible();
    if (width === 390) {
      const failure = page.waitForResponse((response) =>
        response.url().endsWith("/wallet/topup/initiate"),
      );
      await topup
        .getByRole("button", { name: "پرداخت آنلاین", exact: true })
        .click();
      const response = await failure;
      expect(response.request().postDataJSON()).toEqual({ amount: 25000 });
      expect(response.status()).toBe(503);
      await expect(topup.getByRole("alert")).toBeVisible();
      await expect(topup.getByLabel("مبلغ مورد نظر را وارد کنید")).toHaveValue(
        "۲۵٬۰۰۰",
      );
    }
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "افزایش موجودی", exact: true }),
    ).toBeFocused();
    await navigation.getByRole("button", { name: "خانه", exact: true }).click();
    await page
      .locator(".student-service-grid")
      .getByRole("button", { name: /پشتیبانی/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "تیکت فعالی ندارید", exact: true }),
    ).toBeVisible();
    await capture(11, "support-tickets");
    await page.getByRole("button", { name: "تیکت جدید", exact: true }).click();
    await capture(12, "new-support-ticket");
    if (width === 390) {
      await page
        .getByLabel("عنوان تیکت", { exact: true })
        .fill("بررسی واقعی فرم پشتیبانی");
      await page
        .getByLabel("توضیحات", { exact: true })
        .fill("این پیام فقط در پایگاه داده موقت آزمون ثبت می‌شود.");
      await page.getByLabel("افزودن فایل به تیکت").setInputFiles([
        {
          name: "first.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("test evidence"),
        },
        {
          name: "second.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("second evidence"),
        },
      ]);
      await expect(page.getByText("second.txt", { exact: true })).toBeVisible();
      await page
        .getByRole("button", { name: "حذف فایل second.txt", exact: true })
        .click();
      const submitted = page.waitForResponse(
        (response) =>
          response.url().endsWith("/support/tickets") &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "ثبت تیکت", exact: true }).click();
      expect((await submitted).ok()).toBeTruthy();
      await expect(
        page.getByRole("heading", { name: "جزئیات تیکت", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /first.txt/ }),
      ).toBeVisible();
      await page
        .getByLabel("پاسخ شما", { exact: true })
        .fill("ادامه گفت‌وگوی آزمایشی با همان API موجود.");
      const replied = page.waitForResponse(
        (response) =>
          response.url().includes("/messages") &&
          response.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "ارسال پاسخ", exact: true })
        .click();
      expect((await replied).ok()).toBeTruthy();
      await expect(
        page.getByText("ادامه گفت‌وگوی آزمایشی با همان API موجود.", {
          exact: true,
        }),
      ).toBeVisible();
    }
    await page
      .getByRole("button", { name: "بازگشت به فهرست تیکت‌ها", exact: true })
      .click();
    await page
      .getByRole("button", { name: "بازگشت به خانه", exact: true })
      .click();
    await page
      .locator(".student-service-grid")
      .getByRole("button", { name: /ثبت ایده و نظرات/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "هنوز ایده‌ای ثبت نکرده‌اید" }),
    ).toBeVisible();
    await capture(13, "my-ideas-empty");
    await page.getByRole("tab", { name: "ثبت جدید", exact: true }).click();
    await expect(page.getByText("۰ از ۳۰۰۰", { exact: true })).toBeVisible();
    await capture(14, "new-idea");
    await page
      .getByLabel("عنوان", { exact: true })
      .fill("پیشنهاد آزمایش رابط کاربری");
    await page
      .getByLabel("دسته‌بندی (اختیاری)", { exact: true })
      .fill("دسته آزاد آزمایشی");
    const description =
      "توضیح آزمایش برای حفظ متن در خطای ارسال و نمایش متن بلند. ".repeat(12);
    await page.getByLabel("توضیحات", { exact: true }).fill(description);
    await noOverflow(page);
    if (width === 390) {
      await page.route("**/api1/ideas", (route) =>
        route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "خطای آزمایشی ارسال ایده" }),
        }),
      );
      await page.getByRole("button", { name: "ثبت ایده", exact: true }).click();
      await expect(page.getByRole("alert")).toContainText(
        "خطای آزمایشی ارسال ایده",
      );
      await expect(page.getByLabel("توضیحات", { exact: true })).toHaveValue(
        description,
      );
      await page.unroute("**/api1/ideas");
      const saved = page.waitForResponse(
        (response) =>
          response.url().endsWith("/ideas") &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "ثبت ایده", exact: true }).click();
      const response = await saved;
      expect(response.ok()).toBeTruthy();
      expect(response.request().postDataJSON().category).toBe(
        "دسته آزاد آزمایشی",
      );
      await expect(
        page.getByRole("heading", {
          name: "پیشنهاد آزمایش رابط کاربری",
          exact: true,
        }),
      ).toBeVisible();
    }
    await page
      .getByRole("button", { name: "بازگشت به خانه", exact: true })
      .click();
    await page.getByRole("button", { name: "رزرو بلیت", exact: true }).click();
    await capture(5, "booking-route-selection");
    const origin = page.getByRole("button", { name: "مبدأ حرکت", exact: true });
    await origin.click();
    let picker = page.getByRole("dialog", { name: "مبدأ حرکت", exact: true });
    await expect(picker).toBeFocused();
    await expect(picker.getByRole("textbox")).not.toBeFocused();
    expect(await picker.getByRole("option").count()).toBeGreaterThan(8);
    await capture(6, "origin-station");
    await picker.getByRole("textbox").fill("آزمایش تکمیلی");
    await expect(picker.getByRole("option")).toHaveCount(3);
    await picker.getByRole("textbox").fill("آزادی");
    await picker
      .getByRole("option", { name: catalog.originName, exact: true })
      .click();
    await expect(origin).toContainText(catalog.originName);
    const destination = page.getByRole("button", {
      name: "مقصد نهایی",
      exact: true,
    });
    await destination.click();
    picker = page.getByRole("dialog", { name: "مقصد نهایی", exact: true });
    await capture(7, "destination-station");
    await page.keyboard.press("Escape");
    await expect(destination).toBeFocused();
    await expect(origin).toContainText(catalog.originName);
    await destination.click();
    await picker
      .getByRole("option", { name: catalog.destinationName, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "انتخاب بلیت", exact: true }),
    ).toHaveCount(3);
    await capture(15, "available-services");
    if (width === 390) {
      await page.locator(".student-bus-card").last().scrollIntoViewIfNeeded();
      await captureExtra("U15-last-service");
    }
    const lastService = page
      .getByRole("button", { name: "انتخاب بلیت", exact: true })
      .last();
    await lastService.scrollIntoViewIfNeeded();
    await expect(lastService).toBeInViewport();
    await page
      .getByRole("button", { name: "انتخاب بلیت", exact: true })
      .first()
      .click();
    const confirmation = page.getByRole("dialog", {
      name: "تأیید نهایی و پرداخت",
      exact: true,
    });
    await expect(
      confirmation.getByRole("button", { name: "کاهش تعداد بلیت" }),
    ).toBeDisabled();
    await capture(16, "payment-confirmation");
    await confirmation
      .getByRole("button", { name: "افزایش تعداد بلیت" })
      .click();
    await expect(
      confirmation.getByLabel("تعداد بلیت", { exact: true }),
    ).toHaveText("۲");
    await confirmation.getByRole("button", { name: "کاهش تعداد بلیت" }).click();
    if (width === 390) {
      const denied = page.waitForResponse((response) =>
        response.url().endsWith("/tickets/reserve"),
      );
      await confirmation
        .getByRole("button", { name: "ثبت بلیت", exact: true })
        .click();
      expect((await denied).status()).toBe(400);
      await expect(confirmation.getByRole("alert")).toContainText("موجودی");
    }
    const funding = await request.post("/api1/admin/topup", {
      headers: catalog.headers,
      data: { studentId, amount: 1000000 },
    });
    expect(funding.ok(), await funding.text()).toBeTruthy();
    let purchaseRequests = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/tickets/reserve")) purchaseRequests += 1;
    });
    const bought = page.waitForResponse((response) =>
      response.url().endsWith("/tickets/reserve"),
    );
    await confirmation
      .getByRole("button", { name: "ثبت بلیت", exact: true })
      .click({ clickCount: 3 });
    const response = await bought;
    expect(response.ok()).toBeTruthy();
    const receipt = await response.json();
    expect(purchaseRequests).toBe(1);
    expect(response.request().postDataJSON()).toMatchObject({
      schedule_id: expect.any(String),
      origin_station_id: catalog.origin,
      destination_station_id: catalog.destination,
      seatCount: 1,
    });
    const qr = page.getByAltText("کد QR بلیت برای اسکن راننده");
    await expect(qr).toHaveAttribute("src", /^data:image\/png/);
    await capture(17, "reserved-ticket-qr");
    if (width === 390) {
      await page
        .getByRole("button", { name: "بازگشت", exact: true })
        .scrollIntoViewIfNeeded();
      await captureExtra("U17-ticket-actions");
    }
    if (width === 390) {
      const pixels = await qr.evaluate((element) => {
        const image = element as HTMLImageElement;
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return {
          width: canvas.width,
          height: canvas.height,
          data: [
            ...context.getImageData(0, 0, canvas.width, canvas.height).data,
          ],
        };
      });
      expect(
        jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)
          ?.data,
      ).toBe(receipt.ticket.qrCode);
      expect(receipt.ticket.qrCode).not.toBe(receipt.ticket.validationCode);
    }
    await page.getByRole("button", { name: "بازگشت", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "نمایش بلیت و QR", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "ثبت نظر سفر", exact: true }),
    ).toBeDisabled();
    await capture(18, "active-ticket");
    if (width === 390) {
      await page
        .getByRole("button", { name: "نمایش بلیت و QR", exact: true })
        .click();
      const downloaded = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "دانلود بلیت", exact: true })
        .click();
      const file = await downloaded;
      const bytes = await readFile((await file.path())!);
      const pixels = await page.evaluate(
        async (png) => {
          const bitmap = await createImageBitmap(
            new Blob([new Uint8Array(png)], { type: "image/png" }),
          );
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d")!;
          context.drawImage(bitmap, 0, 0);
          return {
            width: canvas.width,
            height: canvas.height,
            data: [
              ...context.getImageData(0, 0, canvas.width, canvas.height).data,
            ],
          };
        },
        [...bytes],
      );
      expect(
        jsQR(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height)
          ?.data,
      ).toBe(receipt.ticket.qrCode);
      await page.getByRole("button", { name: "بازگشت", exact: true }).click();
    }
    await expect(
      navigation.getByRole("button", { name: "بلیت‌ها", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.reload();
    await expect(
      page.getByRole("button", { name: "نمایش بلیت و QR", exact: true }),
    ).toBeVisible();
    await navigation
      .getByRole("button", { name: "کیف پول", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: /جزئیات تراکنش/ }).first(),
    ).toBeVisible();
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "بلیت‌های من", exact: true }),
    ).toBeVisible();
    await noOverflow(page);
    expect(accessibilityIssues).toEqual([]);
    expect(errors).toEqual([]);
  });
}
