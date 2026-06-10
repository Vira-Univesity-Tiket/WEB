const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const arabicDigits = '٠١٢٣٤٥٦٧٨٩';

export const normalizeDigits = (value) => String(value ?? '')
  .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)));

export const sanitizeText = (value, max = 255) => {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
};

export const sanitizePlainText = (value, max = 5000) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  // Store as plain text (helps prevent XSS if a consumer accidentally renders as HTML).
  return trimmed
    .replace(/[<>]/g, '')
    .slice(0, max);
};

export const isDigits = (value, length) => {
  const normalized = normalizeDigits(value);
  return new RegExp(`^\\d{${length}}$`).test(normalized);
};

export const normalizePersianText = (value) => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Normalize common Arabic/Persian variants
    .replace(/ك/g, 'ک')
    .replace(/ي/g, 'ی')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/إ|أ/g, 'ا');
};

// Allow only letters (no digits/symbols/emoji) + spaces + ZWNJ, and forbid Latin.
const PERSIAN_FULLNAME_REGEX = /^[\p{L}\u200C ]+$/u;
export const validatePersianFullName = (value, { min = 3, max = 100 } = {}) => {
  const name = normalizePersianText(String(value ?? ''));
  if (!name) return { ok: false, value: name, error: 'REQUIRED_NAME' };
  if (name.length < min || name.length > max) return { ok: false, value: name, error: 'INVALID_NAME_LENGTH' };
  // Reject Latin letters and any digits (English/Persian/Arabic-Indic).
  if (/[A-Za-z]/u.test(name)) return { ok: false, value: name, error: 'INVALID_FULL_NAME' };
  if (/[0-9\u06F0-\u06F9\u0660-\u0669]/u.test(name)) return { ok: false, value: name, error: 'INVALID_FULL_NAME' };
  // Only letters + space + ZWNJ; rejects emoji and special characters.
  if (!PERSIAN_FULLNAME_REGEX.test(name)) return { ok: false, value: name, error: 'INVALID_FULL_NAME' };
  // Prevent names that are only spaces / separators.
  if (!/[\u0600-\u06FF]/u.test(name)) return { ok: false, value: name, error: 'INVALID_FULL_NAME' };
  return { ok: true, value: name };
};

export const validateNationalCode = (value) => {
  const code = normalizeDigits(value).trim();
  if (!/^\d{10}$/.test(code)) return { ok: false, value: code, error: 'INVALID_NATIONAL_CODE' };
  if (/^(\d)\1{9}$/.test(code)) return { ok: false, value: code, error: 'INVALID_NATIONAL_CODE' };

  const check = Number(code[9]);
  const sum = code
    .slice(0, 9)
    .split('')
    .reduce((acc, digit, index) => acc + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  const valid = remainder < 2 ? check === remainder : check === 11 - remainder;
  return valid ? { ok: true, value: code } : { ok: false, value: code, error: 'INVALID_NATIONAL_CODE' };
};

export const validateStudentId = (value) => {
  const studentId = normalizeDigits(value).trim();
  if (!/^\d{9}$/.test(studentId)) {
    return { ok: false, value: studentId, error: 'INVALID_STUDENT_ID' };
  }
  return { ok: true, value: studentId };
};

export const validateIranMobile = (value) => {
  let phone = normalizeDigits(value).replace(/[\s-]/g, '').trim();
  if (phone.startsWith('+98')) phone = `0${phone.slice(3)}`;
  if (phone.startsWith('98')) phone = `0${phone.slice(2)}`;
  if (!/^09\d{9}$/.test(phone)) {
    return { ok: false, value: phone, error: 'INVALID_PHONE' };
  }
  return { ok: true, value: phone };
};

export const parsePositiveInt = (value, { min = 1, max = Number.MAX_SAFE_INTEGER, error = 'INVALID_NUMBER' } = {}) => {
  const normalized = normalizeDigits(value).trim();
  if (!/^\d+$/.test(normalized)) return { ok: false, error };
  const asBigInt = BigInt(normalized);
  if (asBigInt < BigInt(min) || asBigInt > BigInt(max)) return { ok: false, error };
  const number = Number(asBigInt);
  if (!Number.isSafeInteger(number)) return { ok: false, error };
  return { ok: true, value: number };
};

export const parseMoneyToman = (value, {
  min = Number(process.env.MIN_WALLET_TOPUP_TOMAN || 1000),
  max = Number(process.env.MAX_WALLET_TOPUP_TOMAN || 5000000),
  error = 'INVALID_AMOUNT'
} = {}) => {
  const normalized = normalizeDigits(value).replace(/,/g, '').trim();
  if (!/^\d+$/.test(normalized)) return { ok: false, error };
  const asBigInt = BigInt(normalized);
  if (asBigInt < BigInt(min)) return { ok: false, error: 'AMOUNT_MIN' };
  if (asBigInt > BigInt(max)) return { ok: false, error: 'AMOUNT_LIMIT' };
  const rial = asBigInt * 10n;
  if (rial > 999999999999999n) return { ok: false, error: 'AMOUNT_LIMIT' };
  return { ok: true, toman: Number(asBigInt), rial: Number(rial) };
};

export const parseCoordinate = (value, { min, max, error = 'INVALID_COORDINATES' }) => {
  const normalized = normalizeDigits(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return { ok: false, error };
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < min || number > max) return { ok: false, error };
  return { ok: true, value: number };
};

export const parseTime = (value) => {
  const normalized = normalizeDigits(value).trim();
  const match = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return { ok: false, error: 'INVALID_TIME' };
  return { ok: true, value: `${match[1]}:${match[2]}:00` };
};

export const rejectUnexpectedFields = (body, allowedFields) => {
  const unexpected = Object.keys(body || {}).filter((key) => !allowedFields.includes(key));
  return unexpected.length ? { ok: false, error: 'UNEXPECTED_FIELDS', fields: unexpected } : { ok: true };
};

export const validateIdeaTitle = (value) => {
  const title = sanitizePlainText(value, 120);
  if (!title) return { ok: false, value: title, error: 'IDEA_TITLE_REQUIRED' };
  if (title.length < 5) return { ok: false, value: title, error: 'IDEA_TITLE_MIN' };
  return { ok: true, value: title };
};

export const validateIdeaDescription = (value) => {
  const description = sanitizePlainText(value, 3000);
  if (!description) return { ok: false, value: description, error: 'IDEA_DESCRIPTION_REQUIRED' };
  if (description.length < 15) return { ok: false, value: description, error: 'IDEA_DESCRIPTION_MIN' };
  return { ok: true, value: description };
};
