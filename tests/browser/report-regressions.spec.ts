import { test, expect } from '@playwright/test';

test('a stored administrative session cannot trap public student login on Splash', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('vira_admin_session', 'true'));
  await page.goto('/');
  await expect(page.getByLabel('شماره دانشجویی', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ورود به حساب', exact: true })).toBeVisible();
});

test('unresolved wallet checks retain recovery, release polling, and preserve accessible dialog controls', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('شماره دانشجویی', { exact: true }).fill('900000001');
  await page.getByLabel('کد ملی', { exact: true }).fill('1234567891');
  await page.getByRole('button', { name: 'ورود به حساب', exact: true }).click();
  await expect(page.getByRole('button', { name: 'حساب کاربری', exact: true })).toBeVisible();
  const admin = await page.request.post('/api1/admin/login', { data: { username: 'test-admin', password: 'local-admin-test-password' } });
  expect(admin.ok()).toBe(true);
  const funding = await page.request.post('/api1/admin/topup', { headers: { Authorization: `Bearer ${(await admin.json()).token}` }, data: { studentId: '900000001', amount: 10000 } });
  expect(funding.ok()).toBe(true);
  let calls = 0;
  await page.route('**/api1/wallet/topup/status/brm-unresolved', route => {
    calls += 1;
    return route.fulfill(calls === 1
      ? { status: 200, json: { status: 'pending' } }
      : { status: 503, json: { error: 'قطع ارتباط آزمایشی پیگیری' } });
  });
  await page.goto('/?view=wallet&topupTransactionId=brm-unresolved');
  await expect(page.getByText('قطع ارتباط آزمایشی پیگیری', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/topupTransactionId=brm-unresolved/);
  const retry = page.getByRole('button', { name: 'تلاش دوباره', exact: true });
  await expect(retry).toBeEnabled();
  await page.unroute('**/api1/wallet/topup/status/brm-unresolved');
  await page.route('**/api1/wallet/topup/status/brm-unresolved', route => route.fulfill({ status: 200, json: { status: 'failed', message: 'رد قطعی آزمایشی' } }));
  await retry.click();
  await expect(page).not.toHaveURL(/topupTransactionId/);
  const trigger = page.getByRole('button', { name: 'افزایش موجودی', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'افزایش موجودی', exact: true });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByLabel('مبلغ مورد نظر را وارد کنید', { exact: true })).toBeVisible();
  const close = dialog.getByRole('button', { name: 'بستن افزایش موجودی', exact: true });
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(dialog).not.toBeVisible();
  const transactions = page.getByRole('button', { name: /^جزئیات تراکنش / });
  await expect(transactions.first()).toBeVisible();
  await transactions.first().focus();
  await page.keyboard.press('Enter');
  await expect(transactions.first()).toHaveAttribute('aria-expanded', 'true');
  const id = await transactions.first().getAttribute('aria-controls');
  await expect(page.locator(`[id="${id}"]`)).toBeVisible();
  await page.keyboard.press('Space');
  await expect(transactions.first()).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('navigation', { name: 'پیمایش اصلی' }).getByRole('button', { name: 'خانه', exact: true }).click();
  await page.getByRole('button', { name: 'حساب کاربری', exact: true }).click();
  const language = page.locator('select').filter({ has: page.locator('option[value="en"]') });
  await expect(language.locator('option[value="en"]')).toBeDisabled();
  await expect(language.locator('option[value="ar"]')).toBeDisabled();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  // An HTML success from a misrouted proxy is not a server logout receipt.
  await page.route('**/api1/auth/logout', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>unavailable endpoint</html>' }));
  await page.getByRole('button', { name: 'خروج از حساب کاربری', exact: true }).click();
  await expect(page.getByText('خروج محلی انجام شد؛ ابطال نشست سرور تأیید نشد.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('vira_user_auth_token'))).toBeNull();
});
