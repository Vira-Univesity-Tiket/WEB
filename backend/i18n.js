import { logError } from './logging.js';
const faMessages = {
  AUTH_REQUIRED: 'برای ادامه، ورود به حساب کاربری الزامی است.',
  FORBIDDEN: 'شما مجوز انجام این عملیات را ندارید.',
  TOO_MANY_REQUESTS: 'تعداد درخواست‌ها بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.',
  PAYLOAD_TOO_LARGE: 'حجم اطلاعات ارسالی بیش از حد مجاز است.',
  SERVER_ERROR: 'خطای داخلی سرور رخ داد. لطفاً بعداً دوباره تلاش کنید.',
  NOT_FOUND: 'مسیر درخواستی یافت نشد.',
  INVALID_CREDENTIALS: 'نام کاربری یا رمز عبور اشتباه است.',
  USER_CREDENTIALS_INVALID: 'اطلاعات ورود اشتباه است.',
  CREDENTIALS_REQUIRED: 'وارد کردن اطلاعات ورود الزامی است.',
  FIELDS_REQUIRED: 'تکمیل فیلدهای ضروری الزامی است.',
  USER_NOT_FOUND: 'کاربر یافت نشد.',
  DRIVER_NOT_FOUND: 'راننده یافت نشد.',
  STATION_NOT_FOUND: 'ایستگاه یافت نشد.',
  SCHEDULE_NOT_FOUND: 'برنامه سرویس یافت نشد.',
  USER_EXISTS: 'کاربری با این مشخصات قبلاً ثبت شده است.',
  DUPLICATE_USER: 'شماره دانشجویی یا کد ملی قبلاً ثبت شده است.',
  DUPLICATE_DRIVER: 'نام کاربری یا پلاک خودرو قبلاً ثبت شده است.',
  USER_SUSPENDED: 'حساب کاربری شما غیرفعال شده است.',
  DRIVER_INACTIVE: 'حساب راننده غیرفعال است.',
  REQUIRED_STUDENT_ID: 'شماره دانشجویی الزامی است.',
  REQUIRED_DRIVER_SCAN: 'شناسه راننده و کد بلیط الزامی است.',
  REQUIRED_DRIVER_CODE: 'شناسه راننده و کد چهار رقمی الزامی است.',
  INVALID_DRIVER_ID: 'شناسه راننده نامعتبر است.',
  INVALID_USER_ID: 'شناسه کاربر نامعتبر است.',
  INVALID_ID: 'شناسه ارسالی نامعتبر است.',
  INVALID_STATION_ID: 'شناسه ایستگاه نامعتبر است.',
  INVALID_SCHEDULE_ID: 'شناسه برنامه سرویس نامعتبر است.',
  INVALID_AMOUNT: 'مبلغ واردشده معتبر نیست.',
  AMOUNT_LIMIT: 'مبلغ واردشده بیش از سقف مجاز است.',
  WALLET_CHARGED: 'کیف پول با موفقیت شارژ شد.',
  PROFILE_UPDATED: 'پروفایل با موفقیت به‌روزرسانی شد.',
  PROFILE_UPDATE_FAILED: 'به‌روزرسانی پروفایل انجام نشد.',
  REQUEST_UPDATED: 'درخواست با موفقیت به‌روزرسانی شد.',
  DRIVER_REGISTER_FAILED: 'ثبت‌نام راننده انجام نشد.',
  INVALID_COORDINATES: 'مختصات واردشده معتبر نیست.',
  INVALID_STATION_DATA: 'اطلاعات ایستگاه معتبر نیست.',
  INVALID_PRICE: 'مبلغ برنامه سرویس معتبر نیست.',
  INVALID_PERCENTAGE: 'درصد واردشده معتبر نیست.',
  REQUIRED_STATION: 'نام و مختصات ایستگاه الزامی است.',
  REQUIRED_NOTIFICATION: 'عنوان و متن اطلاعیه الزامی است.',
  REQUIRED_REJECTION_REASON: 'ثبت دلیل رد درخواست الزامی است.',
  REQUIRED_SCHEDULE_FIELDS: 'تکمیل اطلاعات برنامه سرویس الزامی است.',
  REQUIRED_BUS_ROUTE: 'مبدأ و مقصد الزامی است.',
  REQUIRED_RESERVE_FIELDS: 'مبدأ، مقصد، زمان حرکت و سرویس الزامی است.',
  INVALID_BUS_SCHEDULE: 'برنامه سرویس انتخاب‌شده معتبر نیست.',
  INVALID_SCHEDULE_PRICE: 'قیمت برنامه سرویس معتبر نیست.',
  INSUFFICIENT_BALANCE: 'موجودی کیف پول کافی نیست.',
  SOLD_OUT: 'ظرفیت سرویس تکمیل است.',
  SEAT_LIMIT: 'تعداد صندلی انتخاب‌شده بیش از حد مجاز است.',
  TICKET_DUPLICATE: 'خطا در ثبت بلیط. لطفاً دوباره تلاش کنید.',
  RESERVE_FAILED: 'ثبت رزرو انجام نشد. لطفاً دوباره تلاش کنید.',
  TICKET_NOT_FOUND: 'کد بلیط یافت نشد.',
  TICKET_NOT_DRIVER_SERVICE: 'این بلیط متعلق به سرویس شما نیست.',
  TICKET_INACTIVE: 'این بلیط قبلاً استفاده شده یا منقضی شده است.',
  TICKET_ALREADY_SCANNED: 'این بلیط قبلاً اسکن شده است.',
  TICKET_ALREADY_REGISTERED: 'این بلیط قبلاً ثبت شده است.',
  DRIVER_UNKNOWN: 'راننده شناسایی نشد.',
  FINANCE_ERROR: 'دریافت اطلاعات مالی انجام نشد.',
  DB_SCHEMA_ERROR: 'ساختار پایگاه داده نیاز به بررسی دارد.',
  SUPPORT_TICKET_CREATED: 'تیکت شما با موفقیت ثبت شد.',
  API_OK: 'API با موفقیت در دسترس است.',
  CORS_BLOCKED: 'مبدأ درخواست مجاز نیست.',
  INVALID_NATIONAL_CODE: 'کد ملی واردشده معتبر نیست.',
  INVALID_STUDENT_ID: 'شماره دانشجویی باید دقیقاً ۹ رقم و فقط شامل عدد باشد.',
  REQUIRED_NAME: 'وارد کردن نام و نام خانوادگی الزامی است.',
  INVALID_FULL_NAME: 'نام و نام خانوادگی فقط باید شامل حروف فارسی باشد.',
  INVALID_NAME_LENGTH: 'طول نام و نام خانوادگی معتبر نیست.',
  IDEA_TITLE_REQUIRED: 'عنوان ایده الزامی است.',
  IDEA_TITLE_MIN: 'عنوان ایده باید حداقل ۵ کاراکتر باشد.',
  IDEA_DESCRIPTION_REQUIRED: 'توضیحات ایده الزامی است.',
  IDEA_DESCRIPTION_MIN: 'توضیحات ایده باید حداقل ۱۵ کاراکتر باشد.',
  IDEA_NOT_FOUND: 'ایده موردنظر یافت نشد.',
  IDEA_NOT_EDITABLE: 'این ایده قابل ویرایش نیست.',
  IDEA_NOT_DELETABLE: 'این ایده قابل حذف نیست.',
  INVALID_IDEA_STATUS: 'وضعیت ایده نامعتبر است.',
  REQUIRED_STATUS: 'ارسال وضعیت الزامی است.',
  INVALID_PHONE: 'شماره تماس واردشده معتبر نیست.',
  INVALID_NUMBER: 'عدد واردشده معتبر نیست.',
  INVALID_TIME: 'زمان واردشده معتبر نیست.',
  AMOUNT_MIN: 'مبلغ واردشده کمتر از حداقل مجاز است.',
  UNEXPECTED_FIELDS: 'اطلاعات ارسالی شامل فیلدهای غیرمجاز است.',
  INVALID_STATION_IDS: 'شناسه مبدأ یا مقصد معتبر نیست.',
  INACTIVE_STATION: 'ایستگاه انتخاب‌شده فعال نیست.',
  INVALID_CAPACITY: 'ظرفیت واردشده معتبر نیست.'
  ,
  INVALID_AUDIENCE: 'مخاطب اطلاعیه نامعتبر است.',
  TOPUP_DIRECT_DISABLED: 'شارژ مستقیم غیرفعال شده است. لطفاً از مسیر امن پرداخت استفاده کنید.',
  PAYMENT_INITIATED: 'پرداخت ایجاد شد. لطفاً به درگاه پرداخت منتقل شوید.',
  PAYMENT_VERIFIED: 'پرداخت با موفقیت تایید شد.',
  PAYMENT_PENDING: 'پرداخت در حال پردازش است.',
  PAYMENT_CANCELLED: 'پرداخت توسط کاربر لغو شد.',
  PAYMENT_FAILED: 'تایید پرداخت ناموفق بود.',
  PAYMENT_UNAVAILABLE: 'زیرساخت پرداخت در حال حاضر فعال نیست. لطفاً بعداً تلاش کنید.'
};

const englishToKey = new Map([
  ['Authentication required', 'AUTH_REQUIRED'],
  ['Forbidden', 'FORBIDDEN'],
  ['Too many requests', 'TOO_MANY_REQUESTS'],
  ['Payload too large', 'PAYLOAD_TOO_LARGE'],
  ['Server error', 'SERVER_ERROR'],
  ['Server error retrieving finance data', 'FINANCE_ERROR'],
  ['Not Found', 'NOT_FOUND'],
  ['Invalid credentials', 'USER_CREDENTIALS_INVALID'],
  ['Credentials required', 'CREDENTIALS_REQUIRED'],
  ['Fields required', 'FIELDS_REQUIRED'],
  ['User not found', 'USER_NOT_FOUND'],
  ['Driver not found', 'DRIVER_NOT_FOUND'],
  ['Station not found', 'STATION_NOT_FOUND'],
  ['Schedule not found', 'SCHEDULE_NOT_FOUND'],
  ['User already exists', 'USER_EXISTS'],
  ['Student ID or National Code already exists', 'DUPLICATE_USER'],
  ['Username or license plate already used', 'DUPLICATE_DRIVER'],
  ['User suspended', 'USER_SUSPENDED'],
  ['student_id required', 'REQUIRED_STUDENT_ID'],
  ['amount must be a positive number', 'INVALID_AMOUNT'],
  ['amount exceeds allowed limit', 'AMOUNT_LIMIT'],
  ['Wallet charged successfully', 'WALLET_CHARGED'],
  ['Profile updated successfully', 'PROFILE_UPDATED'],
  ['Could not update user', 'PROFILE_UPDATE_FAILED'],
  ['No fields to update', 'FIELDS_REQUIRED'],
  ['Request Updated', 'REQUEST_UPDATED'],
  ['All fields are required', 'FIELDS_REQUIRED'],
  ['Server error during registration', 'DRIVER_REGISTER_FAILED'],
  ['username and password are required', 'CREDENTIALS_REQUIRED'],
  ['driverId and qrCode are required', 'REQUIRED_DRIVER_SCAN'],
  ['driverId and 4-digit code are required', 'REQUIRED_DRIVER_CODE'],
  ['Invalid driver id', 'INVALID_DRIVER_ID'],
  ['INVALID_AUDIENCE', 'INVALID_AUDIENCE'],
  ['TOPUP_DIRECT_DISABLED', 'TOPUP_DIRECT_DISABLED'],
  ['PAYMENT_INITIATED', 'PAYMENT_INITIATED'],
  ['PAYMENT_VERIFIED', 'PAYMENT_VERIFIED'],
  ['PAYMENT_PENDING', 'PAYMENT_PENDING'],
  ['PAYMENT_CANCELLED', 'PAYMENT_CANCELLED'],
  ['PAYMENT_FAILED', 'PAYMENT_FAILED'],
  ['PAYMENT_UNAVAILABLE', 'PAYMENT_UNAVAILABLE'],
  ['Invalid user ID', 'INVALID_USER_ID'],
  ['Invalid ID', 'INVALID_ID'],
  ['Invalid station id', 'INVALID_STATION_ID'],
  ['Invalid schedule id', 'INVALID_SCHEDULE_ID'],
  ['Invalid coordinates', 'INVALID_COORDINATES'],
  ['Invalid station data', 'INVALID_STATION_DATA'],
  ['Invalid price', 'INVALID_PRICE'],
  ['Invalid percentage', 'INVALID_PERCENTAGE'],
  ['name, lat and lng are required', 'REQUIRED_STATION'],
  ['Title and message required', 'REQUIRED_NOTIFICATION'],
  ['Rejection reason required', 'REQUIRED_REJECTION_REASON'],
  ['Required fields missing', 'REQUIRED_SCHEDULE_FIELDS'],
  ['origin and destination are required', 'REQUIRED_BUS_ROUTE'],
  ['origin, destination, departure_time, bus_number required', 'REQUIRED_RESERVE_FIELDS'],
  ['Invalid bus schedule', 'INVALID_BUS_SCHEDULE'],
  ['Invalid schedule price', 'INVALID_SCHEDULE_PRICE'],
  ['seatCount exceeds allowed limit', 'SEAT_LIMIT'],
  ['DB Schema Error', 'DB_SCHEMA_ERROR'],
  ['API Router is working correctly!', 'API_OK']
]);

export const t = (keyOrMessage) => {
  if (!keyOrMessage) return faMessages.SERVER_ERROR;
  if (faMessages[keyOrMessage]) return faMessages[keyOrMessage];
  const mappedKey = englishToKey.get(String(keyOrMessage));
  if (mappedKey) return faMessages[mappedKey];
  return String(keyOrMessage);
};

export const messageKey = (message) => {
  if (faMessages[message]) return message;
  return englishToKey.get(String(message)) || 'GENERAL_ERROR';
};

export const localizePayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const next = { ...payload };
  if (typeof next.error === 'string') {
    next.code = next.code || messageKey(next.error);
    next.error = t(next.error);
  }
  if (typeof next.message === 'string') {
    next.message = t(next.message);
  }
  return next;
};

export const responseLocalizer = (_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (payload) => originalJson(localizePayload(payload));
  next();
};

export const notFoundPayload = (req) => ({
  error: t('NOT_FOUND'),
  code: 'NOT_FOUND',
  message: `مسیر ${req.method} ${req.url} در سرور تعریف نشده است.`
});

export const errorHandler = (err, _req, res, _next) => {
  logError('Unhandled API error', err);
  if (res.headersSent) return;
  if (err?.message === 'CORS blocked for this origin') {
    return res.status(403).json({ error: t('CORS_BLOCKED'), code: 'CORS_BLOCKED' });
  }
  const status = err?.status || err?.statusCode || 500;
  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: status === 429 ? t('TOO_MANY_REQUESTS') : t('SERVER_ERROR'),
    code: status === 429 ? 'TOO_MANY_REQUESTS' : 'SERVER_ERROR'
  });
};
