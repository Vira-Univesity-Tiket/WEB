export interface StudentAttachment {
  name: string;
  dataUrl: string;
  size: number;
}
export const SUPPORT_FILE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
];
export const SUPPORT_MAX_FILES = 5;
export const SUPPORT_FILE_BYTES = 5 * 1024 * 1024;
export const SUPPORT_TOTAL_BYTES = 8 * 1024 * 1024;

export function validateStudentAttachments(
  files: readonly Pick<File, "size" | "type">[],
  previous: readonly Pick<StudentAttachment, "size">[] = [],
): string {
  if (files.length + previous.length > SUPPORT_MAX_FILES)
    return "حداکثر ۵ فایل برای هر پیام مجاز است.";
  if (files.some((file) => file.size > SUPPORT_FILE_BYTES))
    return "حجم هر فایل باید حداکثر ۵ مگابایت باشد.";
  if (files.some((file) => !SUPPORT_FILE_TYPES.includes(file.type)))
    return "فرمت فایل مجاز نیست؛ PNG، JPEG، WebP، PDF یا TXT انتخاب کنید.";
  const total = [...files, ...previous].reduce(
    (sum, file) => sum + file.size,
    0,
  );
  if (total > SUPPORT_TOTAL_BYTES)
    return "مجموع فایل‌های هر پیام باید حداکثر ۸ مگابایت باشد.";
  return "";
}

export const supportAttachmentPayload = (files: readonly StudentAttachment[]) =>
  files.map(({ name, dataUrl }) => ({ name, dataUrl }));
