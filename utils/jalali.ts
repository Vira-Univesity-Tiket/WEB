
/*
  Jalali (Shamsi) Calendar Conversion Utilities
  Based on jalaali-js implementation
*/

function div(a: number, b: number) {
  return ~~(a / b);
}

function remainder(a: number, b: number) {
  return a - div(a, b) * b;
}

export const toJalaali = (gy: number, gm: number, gd: number) => {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = (gy <= 1600) ? 0 : 979;
  gy -= (gy <= 1600) ? 621 : 1600;
  const gy2 = (gm > 2) ? (gy + 1) : gy;
  let days = (365 * gy) + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * div(days, 12053);
  days %= 12053;
  jy += 4 * div(days, 1461);
  days %= 1461;
  jy += div(days, 365);
  let jm = (days < 186) ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  let jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
  return { jy, jm, jd };
};

export const toGregorian = (jy: number, jm: number, jd: number) => {
  let gy = (jy <= 979) ? 621 : 1600;
  jy -= (jy <= 979) ? 0 : 979;
  let days = (365 * jy) + (div(jy, 33) * 8) + div((jy % 33) + 3, 4) + 78 + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
  gy += 400 * div(days, 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days %= 1461;
  gy += div(days, 365);
  days %= 365;
  let gd = days + 1;
  const sal_a = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm;
  for (gm = 0; gm < 13; gm++) {
    const v = sal_a[gm];
    if (gd <= v) break;
    gd -= v;
  }
  return { gy, gm, gd };
};

export const isValidJalaaliDate = (jy: number, jm: number, jd: number) => {
  return  jy >= -61 && jy <= 3177 &&
          jm >= 1 && jm <= 12 &&
          jd >= 1 && jd <= (jm <= 6 ? 31 : (jm <= 11 ? 30 : 29)); // Rough check
};

// Formats "1402/01/01" -> "2023-03-21"
export const shamsiToGregorianStr = (shamsiDate: string): string | null => {
  if (!shamsiDate || shamsiDate.length !== 10) return null;
  const parts = shamsiDate.split('/');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  if (!isValidJalaaliDate(y, m, d)) return null;

  const g = toGregorian(y, m, d);
  const gStr = `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
  return gStr;
};

// Formats "2023-03-21" -> "1402/01/01"
export const gregorianToShamsiStr = (gregorianDate: string): string => {
    if (!gregorianDate) return '';
    const date = new Date(gregorianDate);
    if (isNaN(date.getTime())) return '';
    
    const g = toJalaali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return `${g.jy}/${String(g.jm).padStart(2, '0')}/${String(g.jd).padStart(2, '0')}`;
};

export const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"
];

export const getJalaliMonthLength = (jy: number, jm: number): number => {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  // Leap year check relies on converting to gregorian logic implicitly or robust algo
  // We use conversion to check if next month starts later
  const d1 = toGregorian(jy, jm, 1);
  const d2 = toGregorian(jy + 1, 1, 1); // Next year start
  // This is too heavy, simpler approach:
  // Use jalaali algorithm for leap year: (jy % 33) % 4 === 1 roughly, but let's use exact
  // Check if date (jy, 12, 30) is valid by converting back and forth
  const g = toGregorian(jy, 12, 30);
  const j = toJalaali(g.gy, g.gm, g.gd);
  if (j.jy === jy && j.jm === 12 && j.jd === 30) return 30;
  return 29;
};

export const getJalaliFirstWeekDay = (jy: number, jm: number): number => {
  // Returns 0 for Saturday, 1 for Sunday, ... 6 for Friday
  const g = toGregorian(jy, jm, 1);
  const date = new Date(g.gy, g.gm - 1, g.gd);
  const day = date.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
  // Map JS Day to Persian Day (Sat=0)
  // JS: Sun(0), Mon(1), Tue(2), Wed(3), Thu(4), Fri(5), Sat(6)
  // FA: Sat(0), Sun(1), Mon(2), Tue(3), Wed(4), Thu(5), Fri(6)
  return (day + 1) % 7;
};
