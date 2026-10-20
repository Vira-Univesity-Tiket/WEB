import { test, expect, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import QRCode from 'qrcode';

const login = async (page: Page) => {
  await page.goto('/');
  await page.getByLabel('شماره دانشجویی', { exact: true }).fill('900000001');
  await page.getByLabel('کد ملی', { exact: true }).fill('1234567891');
  await page.getByRole('button', { name: 'ورود به حساب', exact: true }).click();
  await expect(page.getByRole('button', { name: 'حساب کاربری', exact: true })).toBeVisible();
};

test('issue tickets, scan continuously without restarting the camera, reject invalid QR and submit feedback', async ({ page, browser }) => {
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
  const nextPurchase = await page.request.post('/api1/tickets/reserve', { headers: { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('vira_user_auth_token'))}`, 'Idempotency-Key': `browser-next-ticket-${Date.now()}` }, data: { schedule_id: 1, origin_station_id: 1, destination_station_id: 2, departure_time: '08:30', seatCount: 1 } });
  expect(nextPurchase.ok()).toBe(true);
  const nextTicket = (await nextPurchase.json()).ticket;
  const nextImage = await QRCode.toDataURL(nextTicket.qrCode, { width: 440, margin: 4, errorCorrectionLevel: 'H' });
  const invalidImage = await QRCode.toDataURL('QR-NOT-ISSUED', { width: 440, margin: 4 });

  const driverContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const driver = await driverContext.newPage();
  driver.on('pageerror', error => errors.push(error.message));
  await driver.addInitScript(({ image }) => {
    Object.defineProperty(window, 'BarcodeDetector', { value: undefined, configurable: true });
    (window as any).cameraRequests = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      (window as any).cameraRequests += 1;
      const canvas = document.createElement('canvas'); canvas.width = 390; canvas.height = 844;
      let currentImage: HTMLImageElement | null = null;
      (window as any).setCameraFrame = async (value: string | null) => {
        if (value) {
          const img = new Image();
          await new Promise<void>(resolve => { img.onload = () => resolve(); img.src = value; });
          currentImage = img;
        } else currentImage = null;
      };
      await (window as any).setCameraFrame(image);
      const stream = canvas.captureStream(10);
      (window as any).testTracks = stream.getTracks();
      const drawFrame = () => {
        if (stream.getTracks().every(track => track.readyState === 'ended')) return;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#334155'; context.fillRect(0, 0, canvas.width, canvas.height);
        if (currentImage) context.drawImage(currentImage, 45, 160, 300, 300);
        requestAnimationFrame(drawFrame);
      };
      drawFrame();
      return stream;
    }, configurable: true });
  }, { image });
  await driver.goto('/driver');
  await driver.getByPlaceholder('نام کاربری', { exact: true }).fill('driver-test');
  await driver.getByPlaceholder('رمز عبور', { exact: true }).fill('local-driver-test-password');
  await driver.getByRole('button', { name: 'ورود به پنل', exact: true }).click();
  let scanRequests = 0; let activeRequests = 0; let maxActiveRequests = 0;
  await driver.route('**/api1/driver/scan/qr', async route => {
    scanRequests += 1; activeRequests += 1; maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    try {
      const response = await route.fetch();
      await new Promise(resolve => setTimeout(resolve, 350));
      await route.fulfill({ response });
    } finally { activeRequests -= 1; }
  });
  await driver.getByRole('button', { name: /اسکن بارکد \(دوربین\)/ }).click();
  await expect(driver.getByText('بلیط تایید شد', { exact: true })).toBeVisible();
  await expect.poll(() => driver.evaluate(() => (window as any).testTracks.every((track: MediaStreamTrack) => track.readyState === 'live'))).toBe(true);
  // React StrictMode intentionally repeats initial effects in development.
  const initialCameraRequests = await driver.evaluate(() => (window as any).cameraRequests);
  const streamId = await driver.locator('video').evaluate(element => ((element as HTMLVideoElement).srcObject as MediaStream).id);
  if (process.env.VIRA_BROWSER_PREVIEW === 'true') expect(initialCameraRequests).toBe(1);
  await expect(driver.getByText('آماده اسکن بلیط بعدی', { exact: true })).toBeVisible();
  const preview = await driver.getByLabel('دوربین اسکن بلیط').boundingBox();
  expect(preview).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await expect(driver.getByText('QR بلیط را داخل کادر نگه دارید', { exact: true })).toHaveCount(0);
  await expect(driver.getByRole('button', { name: 'ورود کد ۴ رقمی', exact: true })).toBeInViewport();
  await driver.screenshot({ path: 'test-results/driver-scanner-mobile.png', fullPage: true });
  await expect(driver.getByText('بلیط تایید شد', { exact: true })).not.toBeVisible();
  expect(scanRequests).toBe(1);
  await driver.evaluate(image => (window as any).setCameraFrame(image), invalidImage);
  await expect(driver.getByRole('alert')).toContainText('بلیط رد شد');
  await driver.evaluate(image => (window as any).setCameraFrame(image), nextImage);
  await expect(driver.getByText('بلیط تایید شد', { exact: true })).toBeVisible({ timeout: 2000 });
  await expect(driver.getByRole('status').filter({ hasText: 'بلیط تایید شد' })).toContainText(nextTicket.validationCode);
  expect(scanRequests).toBe(3);
  expect(maxActiveRequests).toBe(1);
  expect(await driver.evaluate(() => (window as any).cameraRequests)).toBe(initialCameraRequests);
  expect(await driver.locator('video').evaluate(element => ((element as HTMLVideoElement).srcObject as MediaStream).id)).toBe(streamId);
  expect(await driver.evaluate(() => (window as any).testTracks.every((track: MediaStreamTrack) => track.readyState === 'live'))).toBe(true);
  await expect(driver.getByRole('button', { name: 'اسکن بلیط بعدی', exact: true })).toHaveCount(0);
  await expect(driver.getByRole('button', { name: 'بستن اسکنر', exact: true })).toBeInViewport();
  await driver.getByRole('button', { name: 'بستن اسکنر', exact: true }).click();
  await expect.poll(() => driver.evaluate(() => (window as any).testTracks.every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
  await expect(driver.getByRole('dialog', { name: 'اسکن بلیط مسافر' })).not.toBeVisible();
  await expect(driver.getByText('مسافر سوار شده', { exact: true }).locator('..').getByText('2', { exact: true })).toBeVisible();
  await driver.getByLabel('کد ۴ رقمی بلیط').fill(purchase.ticket.validationCode);
  await expect(driver.getByText('این بلیط قبلاً اسکن شده است.', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'بازگشت به خانه', exact: true }).last().click();
  await page.getByRole('button', { name: 'بلیط‌ها', exact: true }).click();
  await page.getByRole('tab', { name: /آرشیو/ }).click();
  await page.getByRole('button', { name: 'ثبت نظر سفر', exact: true }).first().click();
  await page.getByRole('button', { name: '5 از ۵ ستاره' }).click();
  await page.getByLabel('نظر سفر', { exact: true }).fill('آزمون محلی جریان سفر');
  await page.getByRole('button', { name: 'ثبت نظر', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'سفر چطور بود؟' })).not.toBeVisible();
  expect(errors).toEqual([]);
  await driverContext.close();
});

test('touch forms keep readable input sizes and the initial viewport through focus and login', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await context.newPage();
  const focusControl = async (control: Locator) => {
    expect(await control.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    await control.focus();
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  };
  await page.goto('/');
  const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewport).toContain('width=device-width');
  expect(viewport).not.toMatch(/user-scalable\s*=\s*no|maximum-scale/i);
  await focusControl(page.getByLabel('شماره دانشجویی', { exact: true }));
  await focusControl(page.getByLabel('کد ملی', { exact: true }));
  await page.getByRole('button', { name: 'ثبت نام', exact: true }).click();
  await focusControl(page.getByLabel('نام و نام خانوادگی', { exact: true }));
  await login(page);
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  await page.getByRole('button', { name: 'رزرو بلیط', exact: true }).click();
  await page.getByRole('button', { name: 'مبدا حرکت', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeFocused();
  await expect(page.getByRole('dialog').getByRole('textbox')).not.toBeFocused();
  await page.getByRole('dialog').getByRole('textbox').tap();
  await focusControl(page.getByRole('dialog').getByRole('textbox'));
  await page.goto('/driver');
  await focusControl(page.getByLabel('نام کاربری راننده', { exact: true }));
  await focusControl(page.getByLabel('رمز عبور راننده', { exact: true }));
  await page.getByLabel('نام کاربری راننده', { exact: true }).fill('driver-test');
  await page.getByLabel('رمز عبور راننده', { exact: true }).fill('local-driver-test-password');
  await page.getByRole('button', { name: 'ورود به پنل', exact: true }).click();
  const code = page.getByLabel('کد ۴ رقمی بلیط', { exact: true });
  await focusControl(code);
  expect(await code.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(16);
  await context.close();
});

test('station search is optional on mobile and desktop, keyboard navigation and corrupted cache remain usable', async ({ page }) => {
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
  for (const width of [320, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'مبدا حرکت' });
    const search = dialog.getByRole('textbox');
    await expect(dialog).toBeFocused();
    // Guard against the former delayed search autofocus as well as initial dialog focus.
    await page.waitForTimeout(100);
    await expect(dialog).toBeFocused();
    await expect(search).not.toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('option').last()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(width <= 640 ? dialog.getByRole('button', { name: 'بستن فهرست ایستگاه‌ها' }) : search).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByRole('option', { name: 'ایستگاه آزمایشی یک' }).click();
    await expect(trigger).toContainText('ایستگاه آزمایشی یک');
    await trigger.click();
    await expect(dialog).toBeFocused();
    await search.click();
    await expect(search).toBeFocused();
    await search.fill('دو');
    await expect(dialog.getByRole('option')).toHaveCount(1);
    await dialog.getByRole('option', { name: 'ایستگاه آزمایشی دو' }).click();
    await expect(trigger).toContainText('ایستگاه آزمایشی دو');
    await trigger.click();
    await expect(search).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
});

test('driver route requests keep a compact departure time field and submit the selected time', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/driver');
  await page.getByLabel('نام کاربری راننده', { exact: true }).fill('driver-test');
  await page.getByLabel('رمز عبور راننده', { exact: true }).fill('local-driver-test-password');
  await page.getByRole('button', { name: 'ورود به پنل', exact: true }).click();
  await page.getByRole('button', { name: 'درخواست مسیر', exact: true }).click();
  const time = page.getByLabel('ساعت حرکت', { exact: true });
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(time).toBeVisible();
    const box = (await time.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeLessThanOrEqual(52);
    expect(box.width).toBeLessThanOrEqual(176);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await time.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [label, station] of [['ایستگاه مبدا', 'ایستگاه آزمایشی یک'], ['ایستگاه مقصد', 'ایستگاه آزمایشی سه']]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: label, exact: true });
    await expect(dialog).toBeFocused();
    await expect(dialog.getByRole('textbox')).not.toBeFocused();
    await dialog.getByRole('option', { name: station, exact: true }).click();
  }
  await time.fill('09:45');
  await expect(time).toHaveValue('09:45');
  await page.screenshot({ path: 'test-results/driver-route-request-mobile.png', fullPage: true });
  const submission = page.waitForResponse(response => response.url().endsWith('/driver/route-requests') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'ثبت درخواست', exact: true }).click();
  const response = await submission;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toMatchObject({ originStationId: '1', destinationStationId: '3', departureTime: '09:45' });
  expect((await response.json()).success).toBe(true);
  await expect(page.getByText('درخواست مسیر ثبت شد', { exact: true })).toBeVisible();
  await expect(page.getByText('09:45', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
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
  await expect(page.getByText('آماده اسکن بلیط بعدی', { exact: true })).toHaveCount(0);
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
