import React, { useEffect, useRef, useState } from "react";
import { Icons } from "../Icons";
import { IconButton } from "./StudentUI";
import {
  StudentAttachment,
  validateStudentAttachments,
} from "../../utils/studentAttachments";

interface AttachmentPickerProps {
  id: string;
  value: StudentAttachment[];
  onChange: (files: StudentAttachment[]) => void;
  onError: (message: string) => void;
  onReadingChange: (reading: boolean) => void;
  disabled?: boolean;
}

export default function AttachmentPicker({
  id,
  value,
  onChange,
  onError,
  onReadingChange,
  disabled,
}: AttachmentPickerProps) {
  const [reading, setReading] = useState(false);
  const generation = useRef(0);
  const readers = useRef(new Set<FileReader>());
  const busy = useRef(false);
  const onReading = useRef(onReadingChange);
  onReading.current = onReadingChange;
  useEffect(
    () => () => {
      generation.current += 1;
      readers.current.forEach((reader) => reader.abort());
      readers.current.clear();
      onReading.current(false);
    },
    [],
  );
  const selectFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selected.length || busy.current) return;
    const error = validateStudentAttachments(selected, value);
    if (error) {
      onError(error);
      return;
    }
    const request = ++generation.current;
    busy.current = true;
    setReading(true);
    onReading.current(true);
    onError("");
    try {
      const attachments: StudentAttachment[] = [];
      for (const file of selected) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          readers.current.add(reader);
          reader.onload = () => {
            readers.current.delete(reader);
            resolve(String(reader.result || ""));
          };
          reader.onerror = reader.onabort = () => {
            readers.current.delete(reader);
            reject(
              new Error("خواندن فایل ناموفق بود. لطفاً دوباره انتخاب کنید."),
            );
          };
          reader.readAsDataURL(file);
        });
        attachments.push({ name: file.name, dataUrl, size: file.size });
      }
      if (request === generation.current) onChange([...value, ...attachments]);
    } catch (failure) {
      if (request === generation.current) onError((failure as Error).message);
    } finally {
      if (request === generation.current) {
        busy.current = false;
        setReading(false);
        onReading.current(false);
      }
    }
  };
  return (
    <div className="student-field">
      <label htmlFor={id}>فایل‌های ضمیمه (اختیاری)</label>
      <label className="student-file-upload" htmlFor={id}>
        <Icons.UploadCloud size={35} aria-hidden="true" />
        <strong>{reading ? "در حال آماده‌سازی فایل…" : "افزودن فایل"}</strong>
        <small>
          حداکثر ۵ فایل، هر فایل تا ۵ مگابایت
          <br />
          مجموع ضمیمه‌ها تا ۸ مگابایت؛ PNG، JPEG، WebP، PDF، TXT
        </small>
        <input
          id={id}
          aria-label="افزودن فایل به تیکت"
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.pdf,.txt"
          disabled={disabled || reading}
          onChange={selectFiles}
        />
      </label>
      {value.length > 0 && (
        <ul className="student-file-list" aria-label="فایل‌های انتخاب‌شده">
          {value.map((file, index) => (
            <li key={`${index}-${file.name}`} className="student-file-item">
              <span>{file.name}</span>
              <IconButton
                aria-label={`حذف فایل ${file.name}`}
                disabled={disabled || reading}
                onClick={() =>
                  onChange(value.filter((_, position) => position !== index))
                }
              >
                <Icons.X size={20} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
