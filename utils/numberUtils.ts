
// Add commas to number string (e.g. 10000 -> 10,000)
export const addCommas = (num: string | number): string => {
  if (num === null || num === undefined || num === '') return '';
  const str = String(num).replace(/,/g, '');
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// Remove commas to get raw number (e.g. 10,000 -> 10000)
export const removeCommas = (str: string | number): number => {
  if (!str) return 0;
  return Number(String(str).replace(/,/g, ''));
};

// Convert Persian/Arabic digits to English digits
export const toEnglishDigits = (str: string): string => {
  if (!str) return '';
  return str
    .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1728))
    .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1584));
};

// Convert number to Persian words
export const numberToPersianWords = (number: number | string): string => {
  const num = typeof number === 'string' ? removeCommas(number) : number;
  if (num === 0) return 'صفر';
  
  const delimiter = ' و ';
  const zero = 'صفر';
  const negative = 'منفی ';
  const letters = [
    ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'],
    ['', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'],
    ['', 'ده', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'],
    ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'],
    ['', ' هزار', ' میلیون', ' میلیارد', ' بیلیون', ' بیلیارد', ' تریلیون', ' تریلیارد']
  ];

  if (num < 0) {
    return negative + numberToPersianWords(Math.abs(num));
  }

  let str = '';
  let value = num;
  let i = 0;

  while (value > 0) {
    const chunk = value % 1000;
    if (chunk > 0) {
      const chunkStr = convertChunk(chunk, letters, delimiter);
      str = chunkStr + letters[4][i] + (str ? delimiter + str : '');
    }
    value = Math.floor(value / 1000);
    i++;
  }

  return str;
};

export const formatAmountFa = (value: number | string): string => {
  const raw = typeof value === 'string' ? removeCommas(toEnglishDigits(value)) : Number(value || 0);
  const normalized = Number.isFinite(raw) ? Math.round(raw) : 0;
  return normalized.toLocaleString('fa-IR');
};

export const formatTomanFa = (value: number | string): string => `${formatAmountFa(value)} تومان`;

export const amountToPersianWordsToman = (value: number | string): string => {
  const normalized = typeof value === 'string' ? removeCommas(toEnglishDigits(value)) : Number(value || 0);
  if (!Number.isFinite(normalized) || normalized <= 0) return '';
  return `${numberToPersianWords(normalized)} تومان`;
};

const convertChunk = (num: number, letters: string[][], delimiter: string): string => {
  let str = '';
  const hundreds = Math.floor(num / 100);
  const remainder = num % 100;

  if (hundreds > 0) {
    str += letters[3][hundreds];
    if (remainder > 0) str += delimiter;
  }

  if (remainder > 0) {
    if (remainder < 10) {
      str += letters[0][remainder];
    } else if (remainder >= 11 && remainder <= 19) {
      str += letters[1][remainder - 10];
    } else {
      const tens = Math.floor(remainder / 10);
      const units = remainder % 10;
      str += letters[2][tens];
      if (units > 0) str += delimiter + letters[0][units];
    }
  }

  return str;
};
