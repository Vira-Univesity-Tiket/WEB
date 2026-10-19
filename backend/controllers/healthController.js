import { logError } from '../logging.js';

import { probeDb } from '../db.js';

const endpoints = [
  { method: 'POST', path: '/auth/login', description: 'ورود کاربر' },
  { method: 'POST', path: '/auth/register', description: 'ثبت نام کاربر' },
  { method: 'POST', path: '/auth/update-profile', description: 'بروزرسانی پروفایل' },
  { method: 'POST', path: '/bus/schedule', description: 'برنامه سرویس' },
  { method: 'GET', path: '/wallet/transactions', description: 'تراکنش ها' },
  { method: 'POST', path: '/wallet/topup/initiate', description: 'ایجاد درخواست شارژ کیف پول' },
  { method: 'POST', path: '/wallet/topup/callback', description: 'کالبک تایید پرداخت کیف پول' },
  { method: 'GET', path: '/wallet/topup/status/:transactionId', description: 'وضعیت تراکنش شارژ کیف پول' },
  { method: 'GET', path: '/admin/users', description: 'لیست کاربران' },
  { method: 'POST', path: '/admin/topup', description: 'شارژ کاربر توسط ادمین' },
  { method: 'GET', path: '/admin/stations', description: 'ایستگاه ها' },
  { method: 'POST', path: '/admin/stations', description: 'ایجاد ایستگاه' },
  { method: 'GET', path: '/admin/drivers', description: 'لیست رانندگان' },
  { method: 'POST', path: '/admin/drivers', description: 'ایجاد راننده' },
  { method: 'GET', path: '/admin/schedules', description: 'لیست برنامه ها' },
  { method: 'POST', path: '/admin/schedules', description: 'ایجاد برنامه سرویس' },
  { method: 'POST', path: '/driver/login', description: 'ورود راننده' },
  { method: 'POST', path: '/driver/scan/qr', description: 'اسکن QR راننده' },
  { method: 'POST', path: '/driver/scan/code', description: 'اسکن کد ۴ رقمی راننده' },
  { method: 'GET', path: '/driver/:driverId/summary', description: 'خلاصه راننده' },
  { method: 'GET', path: '/driver/:driverId/recent-scans', description: 'اسکن های اخیر راننده' },
  { method: 'GET', path: '/driver/:driverId/dashboard', description: 'داشبورد راننده' },
  { method: 'GET', path: '/tickets', description: 'بلیط های کاربر' },
  { method: 'POST', path: '/tickets/reserve', description: 'رزرو بلیط' }
];

export const handleHealth = async (_req, res) => {
  const production = String(process.env.BACKEND_NODE_ENV || process.env.NODE_ENV) === 'production';
  if (production || process.env.HEALTH_HTML_ENABLED !== 'true') {
    const result = await probeDb();
    return res.status(result.ok ? 200 : 503).json({ ok: result.ok, service: 'vira-backend' });
  }

  if ((_req.path === '/healthz' || _req.originalUrl?.endsWith('/healthz')) && String(process.env.HEALTH_HTML_ENABLED || 'true').toLowerCase() !== 'true') {
    return res.json({
      ok: true,
      service: 'vira-backend',
      time: new Date().toISOString()
    });
  }
  let dbStatus;
  let dbClass = 'status-offline';
  let dbIcon = '❌';
  let serviceStatus = 'Online';
  let serviceClass = 'status-online';
  let errorMessage = '';

  try {
    const probe = await probeDb();
    if (!probe.ok) {
      throw probe.error;
    }
    dbStatus = 'Connected';
    dbClass = 'status-online';
    dbIcon = '✅';
  } catch (error) {
    logError('DB Health Check Failed:', error);
    dbStatus = 'Error';
    serviceStatus = 'Degraded';
    serviceClass = 'status-warning';
    const code = String(error?.code || '').trim();
    errorMessage = code
      ? `اتصال به پایگاه داده برقرار نیست. (code: ${code})`
      : 'اتصال به پایگاه داده در حال حاضر برقرار نیست.';
  }

  const html = `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>وضعیت سرویس‌های Vira</title>
  <style>
    :root {
      --primary: #3674B5;
      --bg: #f3f4f6;
      --card-bg: #ffffff;
      --text: #1f2937;
      --border: #e5e7eb;
    }
    body { font-family: Tahoma, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 20px; line-height: 1.6; }
    .container { max-width: 1000px; margin: 0 auto; background: var(--card-bg); border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); padding: 30px; overflow: hidden; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--border); padding-bottom: 20px; margin-bottom: 30px; }
    .logo { display: flex; align-items: center; gap: 10px; font-size: 24px; font-weight: bold; color: var(--primary); }
    .refresh-btn { background: var(--bg); border: 1px solid var(--border); padding: 8px 16px; border-radius: 8px; cursor: pointer; transition: all 0.2s; font-family: inherit; font-size: 14px; }
    .refresh-btn:hover { background: #e5e7eb; }
    
    .status-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 40px; }
    .card { background: #f9fafb; padding: 20px; border-radius: 12px; border: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    .card h3 { margin: 0 0 10px 0; color: #6b7280; font-size: 14px; font-weight: normal; }
    .status-value { font-size: 20px; font-weight: bold; display: flex; align-items: center; gap: 8px; }
    
    .status-online { color: #059669; background: #ecfdf5; padding: 4px 12px; border-radius: 20px; font-size: 14px; }
    .status-offline { color: #dc2626; background: #fef2f2; padding: 4px 12px; border-radius: 20px; font-size: 14px; }
    .status-warning { color: #d97706; background: #fffbeb; padding: 4px 12px; border-radius: 20px; font-size: 14px; }

    .error-box { grid-column: 1 / -1; background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; padding: 10px; border-radius: 8px; font-size: 12px; margin-top: 10px; font-family: monospace; direction: ltr; text-align: left; }

    h2 { font-size: 18px; margin-bottom: 15px; display: flex; align-items: center; gap: 8px; }
    .endpoint-table-wrapper { overflow-x: auto; border-radius: 12px; border: 1px solid var(--border); }
    table { width: 100%; border-collapse: collapse; min-width: 600px; }
    th { background: #f9fafb; color: #6b7280; font-size: 13px; font-weight: 600; padding: 16px; text-align: right; border-bottom: 1px solid var(--border); }
    td { padding: 16px; border-bottom: 1px solid var(--border); font-size: 14px; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #f8fafc; }

    .method { font-family: monospace; font-weight: bold; padding: 4px 8px; border-radius: 6px; font-size: 12px; display: inline-block; min-width: 60px; text-align: center; }
    .method-GET { background: #eff6ff; color: #3b82f6; border: 1px solid #dbeafe; }
    .method-POST { background: #f0fdf4; color: #22c55e; border: 1px solid #dcfce7; }
    .method-DELETE { background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2; }
    .method-PUT { background: #fff7ed; color: #f97316; border: 1px solid #ffedd5; }

    .path { font-family: monospace; direction: ltr; text-align: left; display: inline-block; color: #4b5563; }
    .api-status { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: #059669; }
    .dot { width: 8px; height: 8px; background: #059669; border-radius: 50%; display: inline-block; box-shadow: 0 0 0 2px #d1fae5; }

    .footer { margin-top: 30px; text-align: center; color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <span>🚌</span>
        <span>وضعیت سرویس‌های Vira</span>
      </div>
      <button class="refresh-btn" onclick="window.location.reload()">بروزرسانی</button>
    </div>

    <div class="status-cards">
      <div class="card">
        <h3>وضعیت کلی سیستم</h3>
        <div class="status-value ${serviceClass}">
          ${serviceStatus === 'Online' ? '🟢 فعال' : '⚠️ دارای اختلال'}
        </div>
      </div>
      <div class="card">
        <h3>اتصال پایگاه داده</h3>
        <div class="status-value ${dbClass}">
          ${dbIcon} ${dbStatus === 'Connected' ? 'متصل' : 'قطع'}
        </div>
        ${errorMessage ? `<div class="error-box">${errorMessage}</div>` : ''}
      </div>
      <div class="card">
        <h3>تعداد API ها</h3>
        <div class="status-value">
          ${endpoints.length} مسیر
        </div>
      </div>
    </div>

    <h2>لیست API ها و وضعیت</h2>
    <div class="endpoint-table-wrapper">
      <table>
        <thead>
          <tr>
            <th>متد (Method)</th>
            <th>مسیر (Endpoint)</th>
            <th>توضیحات</th>
            <th>وضعیت</th>
          </tr>
        </thead>
        <tbody>
          ${endpoints.map(ep => `
            <tr>
              <td><span class="method method-${ep.method}">${ep.method}</span></td>
              <td style="direction: ltr; text-align: left;"><span class="path">${ep.path}</span></td>
              <td>${ep.description}</td>
              <td>
                <div class="api-status">
                  <span class="dot"></span>
                  Online
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="footer">
      Server Time: ${new Date().toLocaleString('fa-IR')} | Node Environment: ${process.env.BACKEND_NODE_ENV || process.env.NODE_ENV || 'development'}
    </div>
  </div>
</body>
</html>
  `;

  res.send(html);
};
