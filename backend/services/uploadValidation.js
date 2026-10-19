export const parseUpload = (dataUrl, { maxBytes, allowedMime }) => {
  if (typeof dataUrl !== 'string' || dataUrl.length > Math.ceil(maxBytes / 3) * 4 + 100) return { ok: false, error: 'حجم فایل بیش از حد مجاز است.' };
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  if (!match || !allowedMime.includes(match[1]) || match[2].length % 4 !== 0) return { ok: false, error: 'فرمت فایل مجاز نیست.' };
  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > maxBytes || buffer.toString('base64') !== match[2]) return { ok: false, error: 'فایل نامعتبر است.' };
  const signatures = {
    'image/png': () => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/jpeg': () => buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255,
    'image/webp': () => buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP',
    'application/pdf': () => buffer.toString('ascii', 0, 5) === '%PDF-',
    'text/plain': () => !buffer.includes(0) && Buffer.from(buffer.toString('utf8')).equals(buffer)
  };
  if (!signatures[mime]?.()) return { ok: false, error: 'محتوای فایل با فرمت آن مطابقت ندارد.' };
  return { ok: true, mime, buffer };
};
