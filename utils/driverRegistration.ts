import { toEnglishDigits } from "./numberUtils";
import { validateNationalCodeFa } from "./validationUtils";

export type DriverPage = "dashboard" | "scan" | "request" | "profile";
export type DriverDocumentKind = "nationalCard" | "licenseCard" | "carCard";
export interface DriverRegistrationDraft {
  name: string;
  nationalCode: string;
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  phone: string;
  plate: { part1: string; letter: string; part2: string; part3: string };
  documents: Record<DriverDocumentKind, string>;
  documentNames: Record<DriverDocumentKind, string>;
  regUsername: string;
  regPassword: string;
}
export const emptyDriverDraft = (): DriverRegistrationDraft => ({
  name: "",
  nationalCode: "",
  birthDay: "",
  birthMonth: "1",
  birthYear: "",
  phone: "",
  plate: { part1: "", letter: "ع", part2: "", part3: "" },
  documents: { nationalCard: "", licenseCard: "", carCard: "" },
  documentNames: { nationalCard: "", licenseCard: "", carCard: "" },
  regUsername: "",
  regPassword: "",
});
export const driverPages: readonly DriverPage[] = [
  "dashboard",
  "scan",
  "request",
  "profile",
];
export const readDriverPage = (search: string): DriverPage => {
  const value = new URLSearchParams(search).get("driverView");
  return driverPages.includes(value as DriverPage)
    ? (value as DriverPage)
    : "dashboard";
};
export const DRIVER_DOCUMENT_MIMES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
];
export const DRIVER_DOCUMENT_BYTES = 3 * 1024 * 1024;
export const documentError = (file: { type: string; size: number }) =>
  !DRIVER_DOCUMENT_MIMES.includes(file.type)
    ? "فایل باید PNG، JPEG، WebP یا PDF باشد."
    : file.size > DRIVER_DOCUMENT_BYTES
      ? "حجم هر مدرک حداکثر ۳ مگابایت است."
      : file.size === 0
        ? "فایل انتخاب‌شده خالی است."
        : "";
export const isDriverDocument = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= Math.ceil((DRIVER_DOCUMENT_BYTES * 4) / 3) + 64 &&
  /^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(
    value,
  );
export const normalizeDriverPhone = (value: string) => {
  let phone = toEnglishDigits(value).replace(/[\s-]/g, "").trim();
  if (phone.startsWith("+98")) phone = "0" + phone.slice(3);
  else if (phone.startsWith("98")) phone = "0" + phone.slice(2);
  return phone;
};
const persianDate = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", {
  timeZone: "UTC",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
export function validPersianDate(
  year: string,
  month: string,
  day: string,
): boolean {
  if (
    !/^\d{1,4}$/.test(year) ||
    !/^\d{1,2}$/.test(month) ||
    !/^\d{1,2}$/.test(day)
  )
    return false;
  const y = Number(year),
    m = Number(month),
    d = Number(day);
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > (m <= 6 ? 31 : 30)) return false;
  if (m !== 12 || d < 30) return true;
  // Derive Esfand 30 from the platform's Persian calendar, without an age rule or Gregorian date conversion in the payload.
  for (let date = 1; date <= 31; date++) {
    const parts = persianDate.formatToParts(
      new Date(Date.UTC(y + 622, 2, date, 12)),
    );
    const field = (name: string) =>
      Number(parts.find((part) => part.type === name)?.value);
    if (field("year") === y && field("month") === 12 && field("day") === 30)
      return true;
  }
  return false;
}
export function driverPersonalErrors(
  draft: DriverRegistrationDraft,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.name.trim()) errors.name = "نام و نام خانوادگی الزامی است.";
  const national = validateNationalCodeFa(toEnglishDigits(draft.nationalCode));
  if (!national.ok) errors.nationalCode = national.error;
  if (!validPersianDate(draft.birthYear, draft.birthMonth, draft.birthDay))
    errors.birthDate = "تاریخ تولد شمسی معتبر وارد کنید.";
  if (!/^09\d{9}$/.test(normalizeDriverPhone(draft.phone)))
    errors.phone = "شماره موبایل معتبر وارد کنید.";
  if (
    !/^\d{2}$/.test(draft.plate.part1) ||
    !/^\d{3}$/.test(draft.plate.part2) ||
    !/^\d{2}$/.test(draft.plate.part3) ||
    !draft.plate.letter.trim()
  )
    errors.plate = "همه بخش‌های پلاک را کامل کنید.";
  return errors;
}
export function driverAccountErrors(
  draft: DriverRegistrationDraft,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.regUsername.trim().length < 3)
    errors.regUsername = "نام کاربری باید حداقل ۳ کاراکتر باشد.";
  if (draft.regPassword.trim().length < 4)
    errors.regPassword = "رمز عبور باید حداقل ۴ کاراکتر باشد.";
  return errors;
}
export const driverRegistrationPayload = (draft: DriverRegistrationDraft) => ({
  name: draft.name.trim(),
  nationalCode: toEnglishDigits(draft.nationalCode).trim(),
  birthDate: `${draft.birthYear}/${draft.birthMonth}/${draft.birthDay}`,
  phone: normalizeDriverPhone(draft.phone),
  plateData: draft.plate,
  documents: draft.documents,
  username: toEnglishDigits(draft.regUsername).trim(),
  password: toEnglishDigits(draft.regPassword).trim(),
});
