import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { nationalCodeFor, seedStudentDesign } from "./studentFixtures";

test("chat, a ticket without attachments, closed conversations, text export and idea editing remain usable", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const catalog = await seedStudentDesign(request);
  await page.goto("/");
  await page.getByRole("tab", { name: "ثبت‌نام", exact: true }).click();
  await page
    .getByLabel("نام و نام خانوادگی", { exact: true })
    .fill("مسافر بررسی گفتگو");
  await page.getByLabel("شماره دانشجویی", { exact: true }).fill("830000013");
  await page
    .getByLabel("کد ملی", { exact: true })
    .fill(nationalCodeFor("981234567"));
  await page.getByRole("button", { name: "شروع کنید", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "حساب کاربری", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "باز کردن راهنمای خودکار", exact: true })
    .click();
  await expect(
    page.getByLabel("پیام به راهنمای خودکار", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "بستن گفتگو", exact: true }).click();
  await page
    .locator(".student-service-grid")
    .getByRole("button", { name: "پشتیبانی", exact: true })
    .click();
  await page.getByRole("button", { name: "تیکت جدید", exact: true }).click();
  const title = "گفت‌وگوی آزمایشی بدون ضمیمه";
  await page.getByLabel("عنوان تیکت", { exact: true }).fill(title);
  await page
    .getByLabel("توضیحات", { exact: true })
    .fill("بررسی ثبت تیکت بدون هیچ فایل و دریافت متن گفتگو.");
  const submitted = page.waitForResponse(
    (response) =>
      response.url().endsWith("/support/tickets") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "ثبت تیکت", exact: true }).click();
  const response = await submitted;
  expect(response.ok()).toBeTruthy();
  expect(response.request().postDataJSON().attachments).toEqual([]);
  const ticketId = String((await response.json()).ticket.id);
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "دانلود TXT", exact: true }).click();
  const file = await exported;
  expect(await readFile((await file.path())!, "utf8")).toContain(title);
  await page
    .getByLabel("پاسخ شما", { exact: true })
    .fill("پاسخ همراه با ضمیمه برای بررسی دانلود معتبر فایل.");
  await page
    .getByLabel("افزودن فایل به تیکت")
    .setInputFiles({
      name: "retained.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("isolated attachment download"),
    });
  await expect(page.getByText("retained.txt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "ارسال پاسخ", exact: true }).click();
  const attachment = page.getByRole("button", { name: /retained.txt/ });
  await expect(attachment).toBeVisible();
  const attachmentDownloaded = page.waitForEvent("download");
  await attachment.click();
  const attachmentFile = await attachmentDownloaded;
  expect(await readFile((await attachmentFile.path())!, "utf8")).toBe(
    "isolated attachment download",
  );
  const closed = await request.post(
    `/api1/admin/support/tickets/${ticketId}/status`,
    { headers: catalog.headers, data: { status: "closed" } },
  );
  expect(closed.ok(), await closed.text()).toBeTruthy();
  await page
    .getByRole("button", { name: "بازگشت به فهرست تیکت‌ها", exact: true })
    .click();
  await page
    .getByRole("tab", { name: "تیکت‌های بسته‌شده", exact: true })
    .click();
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .click();
  await expect(
    page.getByText("این تیکت بسته شده است.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("پاسخ شما", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "بازگشت به فهرست تیکت‌ها", exact: true })
    .click();
  await page
    .getByRole("button", { name: "بازگشت به خانه", exact: true })
    .click();
  await page
    .locator(".student-service-grid")
    .getByRole("button", { name: "ثبت ایده و نظرات", exact: true })
    .click();
  await page.getByRole("tab", { name: "ثبت جدید", exact: true }).click();
  await page
    .getByLabel("عنوان", { exact: true })
    .fill("پیشنهاد بدون دسته‌بندی اجباری");
  await page
    .getByLabel("توضیحات", { exact: true })
    .fill("این پیشنهاد آزمایشی برای بررسی حفظ امکان ویرایش و حذف ایده است.");
  const ideaSaved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/ideas") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "ثبت ایده", exact: true }).click();
  const saved = await ideaSaved;
  expect(saved.ok()).toBeTruthy();
  expect(saved.request().postDataJSON()).not.toHaveProperty("category");
  await page.getByRole("button", { name: "ویرایش", exact: true }).click();
  await expect(page.getByLabel("عنوان", { exact: true })).toHaveValue(
    "پیشنهاد بدون دسته‌بندی اجباری",
  );
  await page
    .getByLabel("عنوان", { exact: true })
    .fill("پیشنهاد ویرایش‌شده از رابط جدید");
  await page
    .getByRole("button", { name: "ذخیره تغییرات", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "پیشنهاد ویرایش‌شده از رابط جدید",
      exact: true,
    }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "حذف", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "هنوز ایده‌ای ثبت نکرده‌اید",
      exact: true,
    }),
  ).toBeVisible();
});
