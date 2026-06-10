export const normalizePersianName = (value: string) => {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ك/g, 'ک')
    .replace(/ي/g, 'ی')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/إ|أ/g, 'ا');
};

const PERSIAN_FULLNAME_REGEX = /^[\p{L}\u200C ]+$/u;

export const validateFullNameFa = (value: string) => {
  const normalized = normalizePersianName(value);
  if (!normalized) return { ok: false, value: normalized, error: 'نام و نام خانوادگی الزامی است.' };
  if (normalized.length < 3) return { ok: false, value: normalized, error: 'نام و نام خانوادگی باید حداقل ۳ کاراکتر باشد.' };
  if (normalized.length > 100) return { ok: false, value: normalized, error: 'نام و نام خانوادگی باید حداکثر ۱۰۰ کاراکتر باشد.' };
  if (/[A-Za-z]/u.test(normalized) || /[0-9\u06F0-\u06F9\u0660-\u0669]/u.test(normalized)) {
    return { ok: false, value: normalized, error: 'فقط حروف فارسی مجاز است.' };
  }
  if (!PERSIAN_FULLNAME_REGEX.test(normalized) || !/[\u0600-\u06FF]/u.test(normalized)) {
    return { ok: false, value: normalized, error: 'فقط حروف فارسی مجاز است.' };
  }
  return { ok: true, value: normalized, error: '' };
};

export const validateStudentIdFa = (value: string) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return { ok: false, value: normalized, error: 'شماره دانشجویی الزامی است.' };
  if (!/^\d{9}$/.test(normalized)) {
    return { ok: false, value: normalized, error: 'شماره دانشجویی باید دقیقاً ۹ رقم باشد.' };
  }
  return { ok: true, value: normalized, error: '' };
};

export const validateNationalCodeFa = (value: string) => {
  const code = String(value ?? '').trim();
  if (!code) return { ok: false, value: code, error: 'کد ملی الزامی است.' };
  if (!/^\d{10}$/.test(code)) return { ok: false, value: code, error: 'کد ملی باید دقیقاً ۱۰ رقم باشد.' };
  if (/^(\d)\1{9}$/.test(code)) return { ok: false, value: code, error: 'کد ملی واردشده معتبر نیست.' };
  const check = Number(code[9]);
  const sum = code
    .slice(0, 9)
    .split('')
    .reduce((acc, digit, index) => acc + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  const valid = remainder < 2 ? check === remainder : check === 11 - remainder;
  return valid ? { ok: true, value: code, error: '' } : { ok: false, value: code, error: 'کد ملی واردشده معتبر نیست.' };
};
