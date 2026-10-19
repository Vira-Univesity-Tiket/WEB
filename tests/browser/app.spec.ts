import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const login = async (page: Page) => {
  await page.goto('/');
  await page.getByLabel('شماره دانشجویی', { exact: true }).fill('900000001');
  await page.getByLabel('کد ملی', { exact: true }).fill('1234567891');
  await page.getByRole('button', { name: 'ورود به حساب', exact: true }).click();
  await expect(page.getByRole('button', { name: 'حساب کاربری', exact: true })).toBeVisible();
};

test('issue a real ticket, decode it without BarcodeDetector, board once and submit feedback', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page);
  await page.getByRole('button', { name: 'رزرو بلیط' }).click();
  await page.getByRole('button', { name: 'مبدا حرکت', exact: true }).click();
  await page.getByRole('option', { name: 'ایستگاه آزمایشی یک' }).click();
  await page.getByRole('button', { name: 'مقصد نهایی', exact: true }).click();
  await page.getByRole('option', { name: 'ایستگاه آزمایشی دو' }).click();
  await page.getByRole('button', { name: 'انتخاب بلیط', exact: true }).click();
  let purchaseCount = 0;
  page.on('request', request => { if (request.url().endsWith('/tickets/reserve')) purchaseCount += 1; });
  const purchaseResponse = page.waitForResponse(response => response.url().endsWith('/tickets/reserve'));
  await page.getByRole('button', { name: 'ثبت بلیط', exact: true }).click({ clickCount: 3 });
  const purchase = await (await purchaseResponse).json();
  await expect(page.getByText('بلیط رزرو شد', { exact: true })).toBeVisible();
  expect(purchaseCount).toBe(1);
  const qr = page.getByAltText('کد QR بلیط برای اسکن راننده');
  await expect(qr).toHaveAttribute('src', /^data:image\/png/);
  const image = await qr.getAttribute('src');
  await page.screenshot({ path: 'test-results/ticket-issued-mobile.png', fullPage: true });

  const driverContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const driver = await driverContext.newPage();
  await driver.addInitScript(({ image }) => {
    Object.defineProperty(window, 'BarcodeDetector', { value: undefined, configurable: true });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      const canvas = document.createElement('canvas'); canvas.width = 440; canvas.height = 440;
      const img = new Image();
      await new Promise<void>(resolve => { img.onload = () => resolve(); img.src = image!; });
      canvas.getContext('2d')!.drawImage(img, 0, 0, 440, 440);
      const stream = canvas.captureStream(10);
      (window as any).testTracks = stream.getTracks();
      return stream;
    }, configurable: true });
  }, { image });
  await driver.goto('/driver');
  await driver.getByPlaceholder('نام کاربری', { exact: true }).fill('driver-test');
  await driver.getByPlaceholder('رمز عبور', { exact: true }).fill('local-driver-test-password');
  await driver.getByRole('button', { name: 'ورود به پنل', exact: true }).click();
  await driver.getByRole('button', { name: /اسکن بارکد \(دوربین\)/ }).click();
  await expect(driver.getByText('بلیط تایید شد', { exact: true })).toBeVisible();
  await expect.poll(() => driver.evaluate(() => (window as any).testTracks.every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
  await driver.screenshot({ path: 'test-results/driver-scanner-mobile.png', fullPage: true });
  await driver.keyboard.press('Escape');
  await expect(driver.getByRole('dialog', { name: 'اسکن بلیط مسافر' })).not.toBeVisible();
  await driver.getByLabel('کد ۴ رقمی بلیط').fill(purchase.ticket.validationCode);
  await expect(driver.getByText('این بلیط قبلاً اسکن شده است.', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'بازگشت به خانه', exact: true }).last().click();
  await page.getByRole('button', { name: 'بلیط‌ها', exact: true }).click();
  await page.getByRole('tab', { name: /آرشیو/ }).click();
  await page.getByRole('button', { name: 'ثبت نظر سفر', exact: true }).click();
  await page.getByRole('button', { name: '5 از ۵ ستاره' }).click();
  await page.getByLabel('نظر سفر', { exact: true }).fill('آزمون محلی جریان سفر');
  await page.getByRole('button', { name: 'ثبت نظر', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'سفر چطور بود؟' })).not.toBeVisible();
  expect(errors).toEqual([]);
  await driverContext.close();
});

test('small screens, keyboard station picker, corrupted cache remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.evaluate(() => { localStorage.setItem('vira_user_profile', '{broken'); sessionStorage.setItem('vira_admin_auth_meta', '{broken'); });
  await page.reload();
  await expect(page.getByRole('button', { name: 'ورود به حساب', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ثبت نام', exact: true }).click();
  await expect(page.getByLabel('نام و نام خانوادگی')).toBeVisible();
  await page.getByRole('button', { name: 'شروع کنید' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'شروع کنید' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/auth-small-screen.png', fullPage: true });
  await login(page);
  await page.getByRole('button', { name: 'رزرو بلیط' }).click();
  const trigger = page.getByRole('button', { name: 'مبدا حرکت', exact: true });
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'مبدا حرکت' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('admin screen uses the existing routes and backend contracts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const auth = await page.request.post('/api1/admin/login', { data: { username: 'test-admin', password: 'local-admin-test-password' } });
  expect(auth.ok()).toBe(true);
  const data = await auth.json();
  await page.goto('/');
  await page.evaluate(token => {
    sessionStorage.setItem('vira_admin_auth_token', token);
    sessionStorage.setItem('vira_admin_session', 'true');
    sessionStorage.setItem('vira_admin_auth_meta', JSON.stringify({ role: 'admin', username: 'test-admin' }));
  }, data.token);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/mohd/super/admin');
  await expect(page.getByRole('button', { name: /خروج/ }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/admin-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('camera denial keeps manual entry available and closing stops a late camera stream', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'BarcodeDetector', { value: undefined, configurable: true });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new DOMException('Denied', 'NotAllowedError'); }, configurable: true });
  });
  await page.goto('/driver');
  await page.getByLabel('نام کاربری راننده', { exact: true }).fill('driver-test');
  await page.getByLabel('رمز عبور راننده', { exact: true }).fill('local-driver-test-password');
  await page.getByRole('button', { name: 'ورود به پنل', exact: true }).click();
  await page.getByRole('button', { name: /اسکن بارکد \(دوربین\)/ }).click();
  await expect(page.getByRole('alert')).toContainText('دسترسی به دوربین مسدود است');
  await page.getByRole('button', { name: 'ورود کد ۴ رقمی' }).click();
  await expect(page.getByRole('dialog').getByLabel('کد ۴ رقمی بلیط')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: () => new Promise(resolve => {
      (window as any).resolveLateCamera = () => {
        const stream = document.createElement('canvas').captureStream();
        (window as any).lateTracks = stream.getTracks(); resolve(stream);
      };
    }) });
  });
  await page.getByRole('button', { name: /اسکن بارکد \(دوربین\)/ }).click();
  await expect.poll(() => page.evaluate(() => Boolean((window as any).resolveLateCamera))).toBe(true);
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as any).resolveLateCamera());
  await expect.poll(() => page.evaluate(() => (window as any).lateTracks.every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
  await page.getByRole('button', { name: 'خروج', exact: true }).first().click();
  expect(await page.evaluate(() => localStorage.getItem('vira_driver_auth_token'))).toBe(null);
});

test('customer screens have no serious WCAG issues or horizontal overflow', async ({ page }) => {
  const audit = async (name: string) => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(document.getAnimations().filter(animation => Number.isFinite(Number(animation.effect?.getTiming().iterations))).map(animation => animation.finished.catch(() => undefined)));
    });
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    const serious = result.violations.filter(item => ['serious', 'critical'].includes(item.impact || ''));
    expect(serious.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ html: node.html, failure: node.failureSummary })) })), name).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name).toBe(true);
  };
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'ورود به حساب', exact: true })).toBeVisible();
  await audit('authentication');
  await login(page);
  await audit('home');
  for (const [name, title] of [['کیف پول', 'کیف پول'], ['پشتیبانی', 'پشتیبانی'], ['ثبت ایده و نظرات', 'ایده'], ['بلیط‌ها', 'بلیط های من'], ['سرویس دانشگاه', 'رزرو سرویس']] as const) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByText(title, { exact: false }).first()).toBeVisible();
    await audit(name);
    await page.reload();
    await expect(page.getByRole('button', { name: 'حساب کاربری', exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'حساب کاربری', exact: true }).click();
  await audit('profile');
});

test('a late profile response cannot restore cached personal data after logout', async ({ page }) => {
  let releaseProfile!: () => void;
  let profileCaptured!: () => void;
  const captured = new Promise<void>(resolve => { profileCaptured = resolve; });
  const hold = new Promise<void>(resolve => { releaseProfile = resolve; });
  await page.route('**/api1/auth/me', async route => {
    const response = await route.fetch();
    profileCaptured();
    await hold;
    await route.fulfill({ response });
  });
  await login(page);
  await captured;
  await page.getByRole('button', { name: 'حساب کاربری', exact: true }).click();
  await page.getByRole('button', { name: /خروج/ }).click();
  await expect(page.getByRole('button', { name: 'ورود به حساب', exact: true })).toBeVisible();
  const lateResponse = page.waitForResponse(response => response.url().endsWith('/auth/me'));
  releaseProfile();
  await lateResponse;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => localStorage.getItem('vira_user_profile'))).toBe(null);
  expect(await page.evaluate(() => localStorage.getItem('vira_user_auth_token'))).toBe(null);
});
