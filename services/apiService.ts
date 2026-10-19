
import { AdminAccount, AdminUser, AdminIdea, BusOption, Driver, IdeaStatusHistoryItem, Station, Transaction, UserIdea, UserProfile, BusSchedule, FinanceRecord, SystemSettings, DriverRequest, AppNotification, DriverRouteRequest, TicketFeedbackItem, Ticket } from '../types';
import type { SupportTicketDetail, SupportTicketListItem, SupportTicketStatus } from '../types';
import { buildApiUrl, getApiRetryCount, initializeFrontendConfig } from '../config/frontend-config';

const USER_TOKEN_KEY = 'vira_user_auth_token';
const ADMIN_TOKEN_KEY = 'vira_admin_auth_token';
const DRIVER_TOKEN_KEY = 'vira_driver_auth_token';

let configPrimed = false;

const primeFrontendConfig = async () => {
  if (configPrimed) return;
  try {
    await initializeFrontendConfig();
  } catch (error) {
    console.warn('[VIRA_CONFIG] API runtime config warmup failed', error);
  } finally {
    configPrimed = true;
  }
};

const saveToken = (key: string, token?: string) => {
  if (typeof window === 'undefined' || !token) return;
  const storage = key === ADMIN_TOKEN_KEY ? sessionStorage : localStorage;
  storage.setItem(key, token);
};

export const clearAuthTokens = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_TOKEN_KEY);
  localStorage.removeItem(DRIVER_TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
};

export const hasDriverAuthToken = (): boolean => {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem(DRIVER_TOKEN_KEY));
};

export const clearDriverAuthToken = () => localStorage.removeItem(DRIVER_TOKEN_KEY);

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'ApiError'; }
}

const getTokenForResource = (resource: string) => {
  if (typeof window === 'undefined') return '';
  if (resource.includes('/admin/')) return sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
  if (resource.includes('/driver/')) return localStorage.getItem(DRIVER_TOKEN_KEY) || '';
  if (resource.includes('/notifications/')) {
    return localStorage.getItem(USER_TOKEN_KEY) || localStorage.getItem(DRIVER_TOKEN_KEY) || '';
  }
  return localStorage.getItem(USER_TOKEN_KEY) || '';
};

const errorTranslations: Record<string, string> = {
  'Login failed': 'ورود ناموفق بود.',
  'Invalid credentials': 'اطلاعات ورود اشتباه است.',
  'Authentication required': 'برای ادامه، ورود به حساب کاربری الزامی است.',
  'Forbidden': 'شما مجوز انجام این عملیات را ندارید.',
  'Too many requests': 'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.',
  'Payload too large': 'حجم اطلاعات ارسالی بیش از حد مجاز است.',
  'User not found': 'کاربر یافت نشد.',
  'Driver not found': 'راننده یافت نشد.',
  'Station not found': 'ایستگاه یافت نشد.',
  'Schedule not found': 'برنامه سرویس یافت نشد.',
  'Insufficient balance': 'موجودی کیف پول کافی نیست.',
  'Server error': 'خطای داخلی سرور رخ داد. لطفاً بعداً دوباره تلاش کنید.',
  'NetworkError': 'ارتباط با سرور برقرار نشد.',
  'Failed to fetch': 'ارتباط با سرور برقرار نشد.',
  'User suspended': 'حساب کاربری شما غیرفعال شده است.',
  'student_id required': 'شماره دانشجویی الزامی است.',
  'amount must be a positive number': 'مبلغ واردشده معتبر نیست.',
  'amount exceeds allowed limit': 'مبلغ واردشده بیش از سقف مجاز است.',
  'Invalid bus schedule': 'برنامه سرویس انتخاب‌شده معتبر نیست.',
  'Invalid schedule price': 'قیمت برنامه سرویس معتبر نیست.',
  'seatCount exceeds allowed limit': 'تعداد صندلی انتخاب‌شده بیش از حد مجاز است.',
  'origin and destination are required': 'مبدأ و مقصد الزامی است.',
  'origin, destination, departure_time, bus_number required': 'مبدأ، مقصد، زمان حرکت و سرویس الزامی است.',
  'username and password are required': 'وارد کردن نام کاربری و رمز عبور الزامی است.',
  'All fields are required': 'تکمیل فیلدهای ضروری الزامی است.',
  'Required fields missing': 'تکمیل اطلاعات ضروری الزامی است.',
  'Invalid ID': 'شناسه ارسالی نامعتبر است.',
  'Invalid driver id': 'شناسه راننده نامعتبر است.',
  'Invalid user ID': 'شناسه کاربر نامعتبر است.',
  'Title and message required': 'عنوان و متن اطلاعیه الزامی است.',
  'Invalid percentage': 'درصد واردشده معتبر نیست.',
  'INVALID_CAPACITY': 'ظرفیت راننده معتبر نیست.',
  'INVALID_PHONE': 'شماره تماس معتبر نیست.',
  'نام راننده الزامی است.': 'نام راننده الزامی است.',
  'پلاک راننده الزامی است.': 'پلاک راننده الزامی است.',
  'نام کاربری راننده الزامی است.': 'نام کاربری راننده الزامی است.',
  'رمز عبور راننده الزامی است.': 'رمز عبور راننده الزامی است.',
  'این راننده برنامه سرویس ثبت‌شده دارد و حذف کامل آن ممکن نیست. ابتدا برنامه‌ها را غیرفعال یا حذف کنید.': 'این راننده برنامه سرویس ثبت‌شده دارد و حذف کامل آن ممکن نیست. ابتدا برنامه‌ها را غیرفعال یا حذف کنید.',
  'Username or license plate already used': 'نام کاربری یا پلاک این راننده قبلاً ثبت شده است.',
  'INVALID_WEEKLY_LIMIT': 'سقف شارژ هفتگی واردشده معتبر نیست.',
  'INVALID_AUDIENCE': 'مخاطب اطلاعیه نامعتبر است.'
};

const normalizeErrorMessage = (message: string, fallback: string) => {
  if (!message) return fallback;
  const trimmed = message.trim();
  if (errorTranslations[trimmed]) return errorTranslations[trimmed];
  if (/^[\x00-\x7F]+$/.test(trimmed)) return fallback;
  return trimmed;
};

interface FetchOptions extends RequestInit {
  timeout?: number;
  includeCredentials?: boolean;
}

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

const resolveResourceUrl = (resource: string) => {
  const raw = String(resource || '').trim();
  if (!raw) return buildApiUrl('/');
  if (isAbsoluteUrl(raw)) {
    const url = new URL(raw);
    if (typeof window === 'undefined' || url.origin !== window.location.origin) throw new Error('آدرس API باید در همین دامنه باشد.');
    return url.pathname + url.search;
  }
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return buildApiUrl(path);
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetriableStatus = (status: number) => status === 429 || status >= 500;

const isLikelyHtml = (text: string) => {
  const v = String(text || '').trim().toLowerCase();
  if (!v) return false;
  return v.startsWith('<!doctype') || v.startsWith('<html') || v.includes('<body');
};

const parseJsonSafely = <T>(text: string): T | null => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

const fetchWithTimeout = async (resource: string, options: FetchOptions = {}) => {
  await primeFrontendConfig();
  const { timeout = 25000, includeCredentials = false, ...rest } = options;
  const maxRetries = getApiRetryCount();
  const method = String(rest.method || 'GET').toUpperCase();
  const canRetryResponse = method === 'GET' || method === 'HEAD';
  const targetUrl = resolveResourceUrl(resource);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const headers = new Headers(rest.headers || {});
    const token = getTokenForResource(targetUrl);
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    try {
      const response = await fetch(targetUrl, {
        ...rest,
        headers,
        signal: controller.signal,
        credentials: includeCredentials ? 'include' : 'same-origin'
      });
      clearTimeout(id);

      if (attempt < maxRetries && canRetryResponse && isRetriableStatus(response.status)) {
        await delay(150 * (attempt + 1));
        continue;
      }
      return response;
    } catch (error) {
      clearTimeout(id);
      const errorName = (error as any)?.name;
      if (canRetryResponse && attempt < maxRetries && errorName !== 'AbortError') {
        await delay(150 * (attempt + 1));
        continue;
      }
      if (errorName === 'AbortError') {
        throw new Error('زمان پاسخ‌گویی سرور به پایان رسید. لطفاً دوباره تلاش کنید.', { cause: error });
      }
      const message = (error as any)?.message;
      if (message) {
        throw new Error(normalizeErrorMessage(String(message), 'ارتباط با سرور برقرار نشد.'), { cause: error });
      }
      throw new Error('ارتباط با سرور برقرار نشد.', { cause: error });
    }
  }
  throw new Error('ارتباط با سرور برقرار نشد.');
};

const asJson = async <T>(response: Response, fallbackMessage: string): Promise<T> => {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const url = response.url || 'unknown_url';
  const raw = await response.text();
  const json = parseJsonSafely<any>(raw);

  if (!response.ok) {
    let message = fallbackMessage;
    if (json?.error) message = json.error;
    else if (json?.message) message = json.message;
    else if (isLikelyHtml(raw)) {
      message = 'پاسخ API نامعتبر است (HTML به جای JSON). تنظیمات مسیر API روی سرور بررسی شود.';
    }

    if (!json) {
      console.warn('[VIRA_API] non-json error response', {
        status: response.status,
        url,
        contentType,
        snippet: raw.slice(0, 120)
      });
    }
    throw new ApiError(normalizeErrorMessage(message, fallbackMessage), response.status);
  }

  if (!json) {
    const htmlResponse = contentType.includes('text/html') || isLikelyHtml(raw);
    console.warn('[VIRA_API] invalid success payload', {
      status: response.status,
      url,
      contentType,
      snippet: raw.slice(0, 120)
    });
    if (htmlResponse) {
      throw new Error('پاسخ API نامعتبر است (HTML به جای JSON). تنظیمات مسیر API روی سرور بررسی شود.');
    }
    throw new Error('پاسخ دریافتی از سرور معتبر نیست. لطفاً دوباره تلاش کنید.');
  }

  return json as T;
};

export const loginAPI = async (studentId: string, nationalCode: string): Promise<UserProfile> => {
  const response = await fetchWithTimeout(`/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: studentId, national_code: nationalCode })
  });
  const data = await asJson<UserProfile & { authToken?: string; token?: string }>(response, 'ورود با خطا مواجه شد');
  saveToken(USER_TOKEN_KEY, data.authToken || data.token);
  const { authToken: _authToken, token: _token, ...profile } = data;
  return profile;
};

export const registerAPI = async (name: string, studentId: string, nationalCode: string): Promise<UserProfile> => {
  const response = await fetchWithTimeout(`/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, student_id: studentId, national_code: nationalCode })
  });
  const data = await asJson<UserProfile & { authToken?: string; token?: string }>(response, 'ثبت نام با خطا مواجه شد');
  saveToken(USER_TOKEN_KEY, data.authToken || data.token);
  const { authToken: _authToken, token: _token, ...profile } = data;
  return profile;
};

export const getCurrentUserAPI = async (): Promise<UserProfile> => asJson(await fetchWithTimeout('/auth/me'), 'دریافت اطلاعات حساب ناموفق بود');

export const adminLoginAPI = async (username: string, password: string): Promise<{ success: boolean; role?: 'admin' | 'analyst'; username?: string; authToken?: string; token?: string }> => {
  const response = await fetchWithTimeout(`/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password })
  });
  const data = await asJson<{ success: boolean; role?: 'admin' | 'analyst'; username?: string; authToken?: string; token?: string }>(response, 'ورود مدیر ناموفق بود');
  saveToken(ADMIN_TOKEN_KEY, data.authToken || data.token);
  return data;
};

export const listAnalysts = async (): Promise<AdminAccount[]> => {
  const response = await fetchWithTimeout(`/admin/analysts`, { method: 'GET' });
  return asJson<AdminAccount[]>(response, 'دریافت لیست تحلیل‌گران ناموفق بود');
};

export const createAnalyst = async (payload: { username: string; password: string; role?: 'analyst' | 'admin' }): Promise<AdminAccount> => {
  const response = await fetchWithTimeout(`/admin/analysts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  return asJson<AdminAccount>(response, 'ایجاد تحلیل‌گر ناموفق بود');
};

export const updateAnalyst = async (id: number, payload: { username: string; role: 'analyst' | 'admin' }): Promise<{ success: boolean }> => {
  const response = await fetchWithTimeout(`/admin/analysts/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  return asJson(response, 'ویرایش تحلیل‌گر ناموفق بود');
};

export const toggleAnalystStatus = async (id: number): Promise<{ success: boolean; newStatus: string }> => {
  const response = await fetchWithTimeout(`/admin/analysts/${id}/status`, { method: 'PUT' });
  return asJson(response, 'تغییر وضعیت تحلیل‌گر ناموفق بود');
};

export const resetAnalystPassword = async (id: number, password: string): Promise<{ success: boolean }> => {
  const response = await fetchWithTimeout(`/admin/analysts/${id}/reset-password`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password })
  });
  return asJson(response, 'ریست رمز تحلیل‌گر ناموفق بود');
};

export const updateProfileAPI = async (studentId: string, data: Partial<UserProfile>): Promise<{ success: boolean; message: string }> => {
  const response = await fetchWithTimeout(`/auth/update-profile`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: studentId, ...data })
  });
  return asJson(response, 'بروزرسانی پروفایل انجام نشد');
};

// --- USERS ---
export const getAdminUsers = async (): Promise<AdminUser[]> => {
  const response = await fetchWithTimeout(`/admin/users`, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
  return asJson<AdminUser[]>(response, 'دریافت لیست کاربران ناموفق بود');
};

export const updateUser = async (userId: number, data: { name: string; studentId: string; nationalCode: string }): Promise<void> => {
  const response = await fetchWithTimeout(`/admin/users/${userId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  return asJson(response, 'ویرایش کاربر ناموفق بود');
};

export const toggleUserStatus = async (userId: number): Promise<{ success: boolean; newStatus: string }> => {
  const response = await fetchWithTimeout(`/admin/users/${userId}/status`, { method: 'PUT' });
  return asJson(response, 'تغییر وضعیت کاربر ناموفق بود');
};

export const deleteUser = async (userId: number): Promise<void> => {
  const response = await fetchWithTimeout(`/admin/users/${userId}`, { method: 'DELETE' });
  return asJson(response, 'حذف کاربر ناموفق بود');
};

export const topUpUser = async (studentId: string, amount: number): Promise<{ balance: number; trackingNumber: string; studentId: string }> => {
  const response = await fetchWithTimeout(`/admin/topup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: studentId, amount })
  });
  return asJson(response, 'شارژ حساب کاربر ناموفق بود');
};

// --- STATIONS ---
export const getStations = async (): Promise<Station[]> => {
  const response = await fetchWithTimeout(`/stations`);
  return asJson<Station[]>(response, 'دریافت ایستگاه‌ها ناموفق بود');
};

export const createStation = async (payload: { name: string; lat: number; lng: number }): Promise<Station> => {
  const response = await fetchWithTimeout(`/admin/stations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  return asJson<Station>(response, 'ایجاد ایستگاه ناموفق بود');
};

export const updateStation = async (stationId: string, data: { name: string; lat: number; lng: number }): Promise<void> => {
  const response = await fetchWithTimeout(`/admin/stations/${stationId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  return asJson(response, 'ویرایش ایستگاه ناموفق بود');
};

export const toggleStationStatus = async (stationId: string): Promise<{ success: boolean; isActive: boolean }> => {
  const response = await fetchWithTimeout(`/admin/stations/${stationId}/status`, { method: 'PUT' });
  return asJson(response, 'تغییر وضعیت ایستگاه ناموفق بود');
};

export const deleteStation = async (stationId: string): Promise<{ success: boolean }> => {
  const response = await fetchWithTimeout(`/admin/stations/${stationId}`, { method: 'DELETE' });
  return asJson(response, 'حذف ایستگاه ناموفق بود');
};

// --- DRIVERS ---
export const getDrivers = async (): Promise<Driver[]> => {
  const response = await fetchWithTimeout(`/admin/drivers`);
  return asJson<Driver[]>(response, 'دریافت لیست رانندگان ناموفق بود');
};

export const createDriver = async (payload: any): Promise<Driver> => {
  const response = await fetchWithTimeout(`/admin/drivers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  return asJson<Driver>(response, 'ایجاد راننده ناموفق بود');
};

export const updateDriver = async (driverId: string, data: any): Promise<void> => {
  const response = await fetchWithTimeout(`/admin/drivers/${driverId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  return asJson(response, 'ویرایش راننده ناموفق بود');
};

export const toggleDriverStatus = async (driverId: string): Promise<{ success: boolean; newStatus: string }> => {
  const response = await fetchWithTimeout(`/admin/drivers/${driverId}/status`, { method: 'PUT' });
  return asJson(response, 'تغییر وضعیت راننده ناموفق بود');
};

export const deleteDriver = async (driverId: string): Promise<{ success: boolean }> => {
  const response = await fetchWithTimeout(`/admin/drivers/${driverId}`, { method: 'DELETE' });
  return asJson(response, 'حذف راننده ناموفق بود');
};

export const getPendingDriverRequests = async (): Promise<DriverRequest[]> => {
  const response = await fetchWithTimeout(`/admin/driver-requests`);
  return asJson<DriverRequest[]>(response, 'دریافت لیست درخواست‌ها ناموفق بود');
};

export const getDriverRequestHistory = async (): Promise<DriverRequest[]> => {
  const response = await fetchWithTimeout(`/admin/driver-requests/history`);
  return asJson<DriverRequest[]>(response, 'دریافت تاریخچه درخواست‌ها ناموفق بود');
};

export const approveDriverRequest = async (driverId: string): Promise<void> => {
  const response = await fetchWithTimeout(`/admin/driver-requests/${driverId}/approve`, { method: 'POST' });
  return asJson(response, 'تایید راننده ناموفق بود');
};

export const rejectDriverRequest = async (driverId: string, reason: string): Promise<void> => {
  const response = await fetchWithTimeout(`/admin/driver-requests/${driverId}/reject`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason })
  });
  return asJson(response, 'رد درخواست ناموفق بود');
};

export const getDriverExportData = async (driverId: string): Promise<any[]> => {
  const response = await fetchWithTimeout(`/admin/drivers/${driverId}/export`);
  return asJson<any[]>(response, 'دریافت داده‌های خروجی ناموفق بود');
};

// --- SCHEDULES ---
export const getSchedules = async (): Promise<BusSchedule[]> => {
  const response = await fetchWithTimeout(`/admin/schedules`);
  return asJson<BusSchedule[]>(response, 'دریافت برنامه سرویس ناموفق بود');
};

export const createSchedule = async (payload: any): Promise<BusSchedule> => {
  const response = await fetchWithTimeout(`/admin/schedules`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  return asJson<BusSchedule>(response, 'ایجاد برنامه ناموفق بود');
};

export const updateSchedule = async (scheduleId: string, data: any): Promise<void> => {
  const response = await fetchWithTimeout(`/admin/schedules/${scheduleId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  return asJson(response, 'ویرایش برنامه ناموفق بود');
};

export const toggleScheduleStatus = async (scheduleId: string): Promise<{ success: boolean; newStatus: string }> => {
  const response = await fetchWithTimeout(`/admin/schedules/${scheduleId}/status`, { method: 'PUT' });
  return asJson(response, 'تغییر وضعیت برنامه ناموفق بود');
};

export const deleteSchedule = async (scheduleId: string): Promise<{ success: boolean }> => {
  const response = await fetchWithTimeout(`/admin/schedules/${scheduleId}`, { method: 'DELETE' });
  return asJson(response, 'حذف برنامه ناموفق بود');
};

// --- NOTIFICATIONS ---
export const getActiveNotification = async (): Promise<AppNotification | null> => {
  try {
    const response = await fetchWithTimeout(`/notifications/active`);
    return await asJson<AppNotification | null>(response, 'دریافت اطلاعیه ناموفق بود');
  } catch {
    return null;
  }
};

export const getAdminNotifications = async (): Promise<AppNotification[]> => {
  const response = await fetchWithTimeout(`/admin/notifications`);
  return asJson<AppNotification[]>(response, 'دریافت لیست اطلاعیه‌ها ناموفق بود');
};

export const createNotification = async (payload: { title: string; message: string; type: string; audience?: 'student' | 'driver' | 'both' }): Promise<AppNotification> => {
  const response = await fetchWithTimeout(`/admin/notifications`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  return asJson<AppNotification>(response, 'ایجاد اطلاعیه ناموفق بود');
};

export const updateNotification = async (id: string, payload: { title: string; message: string; type: string; audience?: 'student' | 'driver' | 'both' }): Promise<void> => {
  const response = await fetchWithTimeout(`/admin/notifications/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  return asJson(response, 'ویرایش اطلاعیه ناموفق بود');
};

export const toggleNotificationStatus = async (id: string): Promise<{ success: boolean; newStatus: string }> => {
  const response = await fetchWithTimeout(`/admin/notifications/${id}/status`, { method: 'PUT' });
  return asJson(response, 'تغییر وضعیت اطلاعیه ناموفق بود');
};

export const deleteNotification = async (id: string): Promise<void> => {
  const response = await fetchWithTimeout(`/admin/notifications/${id}`, { method: 'DELETE' });
  return asJson(response, 'حذف اطلاعیه ناموفق بود');
};

export const getLegalContent = async (audience: 'user' | 'driver'): Promise<{ audience: 'user' | 'driver'; content: string; updatedBy?: string | null; updatedAt?: string }> => {
  const response = await fetchWithTimeout(`/legal?audience=${encodeURIComponent(audience)}`);
  return asJson(response, 'دریافت قوانین ناموفق بود');
};

export const getAdminLegalContent = async (audience: 'user' | 'driver'): Promise<{ audience: 'user' | 'driver'; content: string; updatedBy?: string | null; updatedAt?: string }> => {
  const response = await fetchWithTimeout(`/admin/legal?audience=${encodeURIComponent(audience)}`);
  return asJson(response, 'دریافت قوانین ناموفق بود');
};

export const updateAdminLegalContent = async (payload: { audience: 'user' | 'driver'; content: string }): Promise<{ success: boolean }> => {
  const response = await fetchWithTimeout(`/admin/legal`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return asJson(response, 'ذخیره قوانین ناموفق بود');
};

// --- OTHER ---
export const getWalletTransactions = async (studentId: string): Promise<Transaction[]> => {
  const response = await fetchWithTimeout(`/wallet/transactions?student_id=${encodeURIComponent(studentId)}`, {
    method: 'GET', headers: { 'Content-Type': 'application/json' }
  });
  return asJson<Transaction[]>(response, 'دریافت تراکنش‌ها ناموفق بود');
};

export const initiateTopupWallet = async (amountToman: number): Promise<{ success: boolean; transactionId: string; paymentUrl: string; expiresAt: string }> => {
  const response = await fetchWithTimeout(`/wallet/topup/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountToman })
  });
  return asJson(response, 'ایجاد درخواست پرداخت ناموفق بود');
};

export const getWalletTopupStatus = async (transactionId: string): Promise<{
  transactionId: string;
  status: 'pending' | 'success' | 'failed' | 'cancelled' | 'expired';
  message: string;
  referenceId?: string | null;
  verifiedAt?: string | null;
}> => {
  const response = await fetchWithTimeout(`/wallet/topup/status/${encodeURIComponent(transactionId)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  return asJson(response, 'دریافت وضعیت پرداخت ناموفق بود');
};

export const reserveTicket = async (payload: any, requestKey: string): Promise<{ balance: number; ticket?: Ticket; tickets?: Ticket[]; transaction: Transaction }> => {
  const response = await fetchWithTimeout(`/tickets/reserve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestKey },
    body: JSON.stringify(payload)
  });
  return asJson(response, 'رزرو بلیط با خطا مواجه شد');
};

export const submitTicketFeedback = async (ticketId: string, payload: { rating: number; comment: string }): Promise<{ success: boolean; ticket: Ticket }> => {
  const response = await fetchWithTimeout(`/tickets/${encodeURIComponent(ticketId)}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return asJson<{ success: boolean; ticket: Ticket }>(response, 'ثبت نظر ناموفق بود');
};

export const getUserTickets = async (studentId: string) => {
  const response = await fetchWithTimeout(`/tickets?student_id=${encodeURIComponent(studentId)}`, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
  return asJson(response, 'دریافت بلیط‌ها ناموفق بود');
};

export const getBusSchedule = async (origin: string, destination: string): Promise<BusOption[]> => {
  const response = await fetchWithTimeout(`/bus/schedule`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin, destination }), timeout: 8000
  });
  return asJson<BusOption[]>(response, 'دریافت برنامه حرکت ناموفق بود');
};

export const chatWithSupport = async (history: string[], message: string): Promise<string> => {
  const response = await fetchWithTimeout(`/support/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ history, message })
  });
  const data = await asJson<{ reply: string }>(response, 'ارتباط با پشتیبانی برقرار نشد');
  return data.reply;
};

// Support Tickets (HelpDesk)
export const createSupportTicket = async (payload: { title: string; message: string; attachments?: { name: string; dataUrl: string }[] }) => {
  const response = await fetchWithTimeout(`/support/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeout: 25000
  });
  return asJson<{ success: boolean; ticket: { id: string; title: string; status: SupportTicketStatus; createdAt: string } }>(response, 'ثبت تیکت ناموفق بود');
};

export const listSupportTickets = async (bucket: 'active' | 'closed' = 'active'): Promise<SupportTicketListItem[]> => {
  const url = bucket === 'closed' ? `/support/tickets?status=closed` : `/support/tickets`;
  const response = await fetchWithTimeout(url, { method: 'GET' });
  return asJson<SupportTicketListItem[]>(response, 'دریافت لیست تیکت‌ها ناموفق بود');
};

export const getSupportTicketDetail = async (ticketId: string): Promise<SupportTicketDetail> => {
  const response = await fetchWithTimeout(`/support/tickets/${encodeURIComponent(ticketId)}`, { method: 'GET' });
  return asJson<SupportTicketDetail>(response, 'دریافت تیکت ناموفق بود');
};

export const replySupportTicket = async (ticketId: string, payload: { message: string; attachments?: { name: string; dataUrl: string }[] }) => {
  const response = await fetchWithTimeout(`/support/tickets/${encodeURIComponent(ticketId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeout: 25000
  });
  return asJson<{ success: boolean; messageId: string }>(response, 'ارسال پیام ناموفق بود');
};

export const supportTicketTxtUrl = (ticketId: string) => buildApiUrl(`/support/tickets/${encodeURIComponent(ticketId)}/txt`);
export const supportAttachmentDownloadUrl = (attachmentId: string) => buildApiUrl(`/support/attachments/${encodeURIComponent(attachmentId)}/download`);
const findTokenForAbsoluteUrl = (resourceUrl: string) => {
  if (resourceUrl.includes('/admin/')) return sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
  if (resourceUrl.includes('/driver/')) return localStorage.getItem(DRIVER_TOKEN_KEY) || '';
  return localStorage.getItem(USER_TOKEN_KEY) || sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
};

export const downloadAuthenticatedFile = async (url: string, fallbackFilename: string) => {
  const headers = new Headers();
  const token = findTokenForAbsoluteUrl(url);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetchWithTimeout(url, { method: 'GET', headers, timeout: 40000 });
  if (!response.ok) {
    await asJson(response, 'دانلود فایل ناموفق بود');
    return;
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const disposition = response.headers.get('content-disposition') || '';
  const filenameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const fileName = filenameMatch?.[1] ? decodeURIComponent(filenameMatch[1]) : fallbackFilename;
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
};

// Admin Support Tickets
export const adminListSupportTickets = async (status?: SupportTicketStatus): Promise<SupportTicketListItem[]> => {
  const url = status ? `/admin/support/tickets?status=${encodeURIComponent(status)}` : `/admin/support/tickets`;
  const response = await fetchWithTimeout(url, { method: 'GET' });
  return asJson<SupportTicketListItem[]>(response, 'دریافت تیکت‌ها ناموفق بود');
};

export const adminGetSupportTicketDetail = async (ticketId: string): Promise<SupportTicketDetail> => {
  const response = await fetchWithTimeout(`/admin/support/tickets/${encodeURIComponent(ticketId)}`, { method: 'GET' });
  return asJson<SupportTicketDetail>(response, 'دریافت تیکت ناموفق بود');
};

export const adminSetSupportTicketStatus = async (ticketId: string, status: SupportTicketStatus, note?: string) => {
  const response = await fetchWithTimeout(`/admin/support/tickets/${encodeURIComponent(ticketId)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, note: note || '' })
  });
  return asJson<{ success: boolean }>(response, 'ذخیره وضعیت ناموفق بود');
};

export const adminReplySupportTicket = async (ticketId: string, payload: { message: string; attachments?: { name: string; dataUrl: string }[] }) => {
  const response = await fetchWithTimeout(`/admin/support/tickets/${encodeURIComponent(ticketId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeout: 25000
  });
  return asJson<{ success: boolean; messageId: string }>(response, 'ارسال پاسخ ناموفق بود');
};

export const adminSupportTicketTxtUrl = (ticketId: string) => buildApiUrl(`/admin/support/tickets/${encodeURIComponent(ticketId)}/txt`);
export const adminSupportAttachmentDownloadUrl = (attachmentId: string) => buildApiUrl(`/admin/support/attachments/${encodeURIComponent(attachmentId)}/download`);
export const adminListTicketFeedback = async (status?: 'pending' | 'reviewing' | 'resolved') => {
  const url = status ? `/admin/tickets/feedback?status=${encodeURIComponent(status)}` : `/admin/tickets/feedback`;
  const response = await fetchWithTimeout(url);
  return asJson<TicketFeedbackItem[]>(response, 'دریافت نظرات سفر ناموفق بود');
};
export const adminUpdateTicketFeedbackStatus = async (ticketId: string, status: 'pending' | 'reviewing' | 'resolved', note?: string) => {
  const response = await fetchWithTimeout(`/admin/tickets/${encodeURIComponent(ticketId)}/feedback/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, note: note || '' })
  });
  return asJson<{ success: boolean; ticket?: TicketFeedbackItem }>(response, 'بروزرسانی نظر ناموفق بود');
};

// Admin Finance & Settings
export const getAdminFinanceData = async (type: 'student' | 'driver' | 'company', startDate?: string, endDate?: string): Promise<FinanceRecord[]> => {
  let url = `/admin/finance?type=${type}`;
  if (startDate) url += `&startDate=${startDate}`;
  if (endDate) url += `&endDate=${endDate}`;
  
  const response = await fetchWithTimeout(url);
  return asJson<FinanceRecord[]>(response, 'دریافت گزارش مالی ناموفق بود');
};

export const getSystemSettings = async (): Promise<SystemSettings> => {
  const response = await fetchWithTimeout(`/admin/settings`);
  return asJson<SystemSettings>(response, 'دریافت تنظیمات ناموفق بود');
};

export const updateSystemSettings = async (settings: SystemSettings): Promise<{ success: boolean }> => {
  const response = await fetchWithTimeout(`/admin/settings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings)
  });
  return asJson(response, 'ذخیره تنظیمات ناموفق بود');
};

export interface DriverSession {
  id: string;
  name: string;
  username: string;
  licensePlate: string;
  phone: string;
  status: 'active' | 'inactive' | 'pending' | 'rejected';
}

export interface DriverSummary {
  serviceDate: string;
  boardedCount: number;
  totalRevenue: number;
}

export interface DriverScanItem {
  id: number;
  ticketId: string;
  qrCode: string;
  validationCode: string;
  passengerName: string;
  amount: number;
  scannedAt: string;
  method: 'qr' | 'code';
  count?: number;
}

export interface DriverScheduleCard {
  id: string;
  route: string;
  departureTime: string;
  ticketPrice: number;
  soldCount: number;
  soldAmount: number;
  totalSeats: number;
  remainingSeats: number;
  soldOut: boolean;
  hasSales: boolean;
}

export const driverLogin = async (username: string, password: string): Promise<DriverSession | { status: 'pending', message: string } | { status: 'rejected', reason: string, data: any }> => {
  const response = await fetchWithTimeout(`/driver/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password })
  });
  const data = await asJson<any>(response, 'ورود راننده ناموفق بود');
  if (data?.status === 'active') saveToken(DRIVER_TOKEN_KEY, data.authToken || data.token);
  const { authToken: _authToken, token: _token, ...session } = data;
  return session;
};

export const driverRegister = async (payload: any): Promise<{ success: boolean }> => {
  const response = await fetchWithTimeout(`/driver/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  return asJson(response, 'ثبت نام راننده ناموفق بود');
};

export const driverScanQr = async (driverId: string, qrCode: string): Promise<DriverScanItem> => {
  const response = await fetchWithTimeout(`/driver/scan/qr`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ driverId, qrCode })
  });
  const data = await asJson<{ success: boolean; scan: DriverScanItem }>(response, 'اسکن QR ناموفق بود');
  return data.scan;
};

export const driverScanCode = async (driverId: string, code: string): Promise<DriverScanItem> => {
  const response = await fetchWithTimeout(`/driver/scan/code`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ driverId, code })
  });
  const data = await asJson<{ success: boolean; scan: DriverScanItem }>(response, 'اسکن کد ۴ رقمی ناموفق بود');
  return data.scan;
};

export const getDriverSummary = async (driverId: string): Promise<DriverSummary> => {
  const response = await fetchWithTimeout(`/driver/${driverId}/summary`);
  return asJson<DriverSummary>(response, 'دریافت خلاصه وضعیت ناموفق بود');
};

export const getDriverRecentScans = async (driverId: string): Promise<DriverScanItem[]> => {
  const response = await fetchWithTimeout(`/driver/${driverId}/recent-scans`);
  return asJson<DriverScanItem[]>(response, 'دریافت اسکن‌های اخیر ناموفق بود');
};

export const getDriverDashboard = async (driverId: string): Promise<DriverScheduleCard[]> => {
  const response = await fetchWithTimeout(`/driver/${driverId}/dashboard`);
  return asJson<DriverScheduleCard[]>(response, 'دریافت داشبورد راننده ناموفق بود');
};

// Driver Route Requests (Service Program)
export const driverCreateRouteRequest = async (payload: { originStationId: string; destinationStationId: string; departureTime: string; priceToman: number; stationIds?: string[] }) => {
  const response = await fetchWithTimeout(`/driver/route-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return asJson<{ success: boolean; id: string }>(response, 'ثبت درخواست مسیر ناموفق بود');
};

export const driverListRouteRequests = async (): Promise<DriverRouteRequest[]> => {
  const response = await fetchWithTimeout(`/driver/route-requests`, { method: 'GET' });
  return asJson<DriverRouteRequest[]>(response, 'دریافت درخواست‌های مسیر ناموفق بود');
};

export const adminListRouteRequests = async (status?: 'pending' | 'approved' | 'rejected'): Promise<DriverRouteRequest[]> => {
  const url = status ? `/admin/route-requests?status=${encodeURIComponent(status)}` : `/admin/route-requests`;
  const response = await fetchWithTimeout(url, { method: 'GET' });
  return asJson<DriverRouteRequest[]>(response, 'دریافت درخواست‌های مسیر ناموفق بود');
};

export const adminApproveRouteRequest = async (requestId: string, payload: { driverId: string; originStationId: string; destinationStationId: string; departureTime: string; priceToman: number; adminNote?: string }) => {
  const response = await fetchWithTimeout(`/admin/route-requests/${encodeURIComponent(requestId)}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return asJson<{ success: boolean; scheduleId: string }>(response, 'تایید درخواست ناموفق بود');
};

export const adminRejectRouteRequest = async (requestId: string, adminNote: string) => {
  const response = await fetchWithTimeout(`/admin/route-requests/${encodeURIComponent(requestId)}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminNote })
  });
  return asJson<{ success: boolean }>(response, 'رد درخواست ناموفق بود');
};

// --- IDEAS / FEEDBACK (User) ---
export const createIdea = async (payload: { title: string; description: string; category?: string }): Promise<UserIdea> => {
  const response = await fetchWithTimeout(`/ideas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return asJson<UserIdea>(response, 'ثبت ایده ناموفق بود');
};

export const listMyIdeas = async (params?: { page?: number; pageSize?: number }): Promise<{ items: UserIdea[]; page: number; pageSize: number; total: number }> => {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 20;
  const response = await fetchWithTimeout(`/ideas/mine?page=${page}&pageSize=${pageSize}`, { method: 'GET' });
  return asJson(response, 'دریافت ایده‌های شما ناموفق بود');
};

export const updateMyIdea = async (id: string, payload: { title: string; description: string; category?: string }): Promise<UserIdea> => {
  const response = await fetchWithTimeout(`/ideas/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return asJson<UserIdea>(response, 'ویرایش ایده ناموفق بود');
};

export const deleteMyIdea = async (id: string): Promise<{ success: boolean }> => {
  const response = await fetchWithTimeout(`/ideas/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return asJson(response, 'حذف ایده ناموفق بود');
};

// --- IDEAS / FEEDBACK (Admin) ---
export const adminListIdeas = async (params?: { page?: number; pageSize?: number; status?: string; q?: string; user?: string; from?: string; to?: string }): Promise<{ items: AdminIdea[]; page: number; pageSize: number; total: number }> => {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 20;
  const qs = new URLSearchParams();
  qs.set('page', String(page));
  qs.set('pageSize', String(pageSize));
  if (params?.status) qs.set('status', params.status);
  if (params?.q) qs.set('q', params.q);
  if (params?.user) qs.set('user', params.user);
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);

  const response = await fetchWithTimeout(`/admin/ideas?${qs.toString()}`, { method: 'GET' });
  return asJson(response, 'دریافت لیست ایده‌ها ناموفق بود');
};

export const adminGetIdeaDetail = async (id: string): Promise<{ idea: AdminIdea; history: IdeaStatusHistoryItem[] }> => {
  const response = await fetchWithTimeout(`/admin/ideas/${encodeURIComponent(id)}`, { method: 'GET' });
  return asJson(response, 'دریافت جزئیات ایده ناموفق بود');
};

export const adminUpdateIdea = async (id: string, payload: { status: string; adminResponse?: string; adminNote?: string }): Promise<AdminIdea> => {
  const response = await fetchWithTimeout(`/admin/ideas/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return asJson(response, 'به‌روزرسانی ایده ناموفق بود');
};
