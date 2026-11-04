import React, { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Icons } from "../Icons";
import type { DriverLogic } from "../../hooks/useDriverLogic";
import {
  DriverDocumentKind,
  DriverRegistrationDraft,
  documentError,
  isDriverDocument,
} from "../../utils/driverRegistration";
import { toEnglishDigits, formatAmountFa } from "../../utils/numberUtils";
import {
  Button,
  Field,
  IconButton,
  StatusMessage,
  DriverTrail,
} from "./DriverUI";

const months = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];
const letters = [
  "الف",
  "ب",
  "پ",
  "ت",
  "ث",
  "ج",
  "چ",
  "ح",
  "خ",
  "د",
  "ذ",
  "ر",
  "ز",
  "ژ",
  "س",
  "ش",
  "ص",
  "ض",
  "ط",
  "ظ",
  "ع",
  "غ",
  "ف",
  "ق",
  "ک",
  "گ",
  "ل",
  "م",
  "ن",
  "و",
  "ه",
  "ی",
];
const digits = (value: string, length: number) =>
  toEnglishDigits(value).replace(/\D/g, "").slice(0, length);
export function DriverRegistrationStepper({ step }: { step: number }) {
  return (
    <nav
      className="driver-registration-progress"
      data-step={step}
      aria-label="مراحل ثبت‌نام"
    >
      <ol>
        {[1, 2, 3].map((number) => (
          <li
            key={number}
            aria-current={step === number ? "step" : undefined}
            aria-label={`مرحله ${formatAmountFa(number)}${step > number ? "، تکمیل‌شده" : ""}`}
            data-complete={step > number}
          >
            <span>
              {step > number ? <Check size={24} aria-hidden="true" /> : <i />}
            </span>
            <small>مرحله {formatAmountFa(number)}</small>
          </li>
        ))}
      </ol>
      <p>مرحله {formatAmountFa(step)} از ۳</p>
    </nav>
  );
}
function DocumentUpload({
  kind,
  title,
  value,
  name,
  disabled,
  onChange,
  onBusy,
}: {
  kind: DriverDocumentKind;
  title: string;
  value: string;
  name: string;
  disabled: boolean;
  onChange: (dataUrl: string, filename: string) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const generation = useRef(0),
    reader = useRef<FileReader | null>(null);
  const busyChange = useRef(onBusy);
  busyChange.current = onBusy;
  useEffect(
    () => () => {
      generation.current += 1;
      reader.current?.abort();
      busyChange.current(false);
    },
    [],
  );
  const select = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const validation = documentError(file);
    setError(validation);
    if (validation) return;
    const current = ++generation.current;
    reader.current?.abort();
    setReading(true);
    onBusy(true);
    try {
      const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const valid =
        file.type === "image/png"
          ? [137, 80, 78, 71, 13, 10, 26, 10].every(
              (byte, index) => bytes[index] === byte,
            )
          : file.type === "image/jpeg"
            ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            : file.type === "image/webp"
              ? String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
                String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
              : String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
      if (!valid)
        throw new Error("محتوای فایل با فرمت انتخاب‌شده مطابقت ندارد.");
      if (current !== generation.current) return;
      const data = await new Promise<string>((resolve, reject) => {
        const next = new FileReader();
        reader.current = next;
        next.onload = () => resolve(String(next.result || ""));
        next.onerror = next.onabort = () =>
          reject(new Error("خواندن مدرک ناموفق بود؛ دوباره انتخاب کنید."));
        next.readAsDataURL(file);
      });
      if (!isDriverDocument(data)) throw new Error("فایل مدرک معتبر نیست.");
      if (current === generation.current) onChange(data, file.name);
    } catch (failure) {
      if (current === generation.current) setError((failure as Error).message);
    } finally {
      if (current === generation.current) {
        reader.current = null;
        setReading(false);
        onBusy(false);
      }
    }
  };
  const image = isDriverDocument(value) && value.startsWith("data:image/");
  return (
    <div className="driver-document-field student-field">
      <label htmlFor={"driver-document-" + kind}>{title}</label>
      <div
        className={
          "driver-document-upload" + (value ? " driver-document-selected" : "")
        }
      >
        {image ? (
          <img src={value} alt={"پیش‌نمایش " + title} />
        ) : (
          <Icons.UploadCloud size={38} aria-hidden="true" />
        )}
        <strong>
          {reading
            ? "در حال خواندن مدرک…"
            : value
              ? "تعویض مدرک"
              : "برای بارگذاری کلیک کنید"}
        </strong>
        {name && (
          <span className="driver-document-name">
            <bdi>{name}</bdi>
          </span>
        )}
        <input
          id={"driver-document-" + kind}
          aria-label={title}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.pdf"
          onChange={select}
          disabled={disabled || reading}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? `driver-document-${kind}-error` : "driver-document-limits"
          }
        />
      </div>
      {value && (
        <button
          type="button"
          className="driver-remove-document"
          disabled={disabled || reading}
          onClick={() => {
            generation.current += 1;
            reader.current?.abort();
            onChange("", "");
            setError("");
          }}
        >
          حذف {title}
        </button>
      )}
      {error && (
        <p
          id={`driver-document-${kind}-error`}
          className="student-field-error"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
export default function DriverRegistration({ logic }: { logic: DriverLogic }) {
  const {
    draft,
    regStep,
    registrationPending,
    registrationErrors: errors,
    rejection,
  } = logic.state;
  const [reading, setReading] = useState<Record<string, boolean>>({});
  const scroll = useRef<HTMLDivElement>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
    stepHeading.current?.focus({ preventScroll: true });
  }, [regStep]);
  const busy = registrationPending || Object.values(reading).some(Boolean);
  const change = <K extends keyof DriverRegistrationDraft>(
    key: K,
    value: DriverRegistrationDraft[K],
  ) => logic.actions.setDraft((previous) => ({ ...previous, [key]: value }));
  const field = (name: string) => ({
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name]
      ? `driver-register-${name}-error`
      : undefined,
  });
  const title =
    regStep === 1
      ? "اطلاعات فردی و خودرو"
      : regStep === 2
        ? "بارگذاری مدارک"
        : "اطلاعات حساب کاربری";
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (regStep === 3) void logic.actions.submitRegistration();
    else logic.actions.advanceRegistration();
  };
  return (
    <div
      ref={scroll}
      className="driver-auth-scroll student-view driver-background"
    >
      <div className="driver-registration-inner">
        <header className="driver-registration-header">
          <IconButton
            aria-label="بازگشت به ورود راننده"
            disabled={busy}
            onClick={logic.actions.leaveRegistration}
          >
            <Icons.ArrowRight size={26} />
          </IconButton>
          <h1>ثبت‌نام راننده جدید</h1>
        </header>
        <DriverRegistrationStepper step={regStep} />
        <form
          className={
            "driver-card driver-registration-card driver-registration-step-" +
            regStep
          }
          onSubmit={submit}
          noValidate
        >
          {rejection && (
            <StatusMessage error={"درخواست قبلی رد شده است: " + rejection} />
          )}
          <div className="driver-registration-heading">
            <img
              src={`/illustrations/driver/${regStep === 1 ? "personal" : regStep === 2 ? "documents" : "account"}.png`}
              width="300"
              height="190"
              alt=""
            />
            <h2 ref={stepHeading} tabIndex={-1}>
              {regStep === 3 && (
                <span className="driver-icon-tile">
                  <Icons.User size={28} />
                </span>
              )}
              {title}
            </h2>
          </div>
          {regStep === 1 && (
            <>
              <Field
                id="driver-register-name"
                label="نام و نام خانوادگی"
                error={errors.name}
              >
                <input
                  id="driver-register-name"
                  className="student-input"
                  value={draft.name}
                  onChange={(event) => change("name", event.target.value)}
                  maxLength={100}
                  autoComplete="name"
                  placeholder="نام و نام خانوادگی خود را وارد کنید"
                  disabled={busy}
                  required
                  {...field("name")}
                />
              </Field>
              <Field
                id="driver-register-nationalCode"
                label="کد ملی"
                error={errors.nationalCode}
              >
                <input
                  id="driver-register-nationalCode"
                  className="student-input"
                  value={draft.nationalCode}
                  onChange={(event) =>
                    change("nationalCode", digits(event.target.value, 10))
                  }
                  maxLength={10}
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="کد ملی ۱۰ رقمی"
                  disabled={busy}
                  required
                  {...field("nationalCode")}
                />
              </Field>
              <fieldset
                className="driver-birth-field"
                aria-describedby={
                  errors.birthDate
                    ? "driver-register-birthDate-error"
                    : undefined
                }
              >
                <legend>تاریخ تولد</legend>
                <div className="driver-birth-inputs">
                  <input
                    className="student-input"
                    aria-label="روز تولد"
                    value={draft.birthDay}
                    onChange={(event) =>
                      change("birthDay", digits(event.target.value, 2))
                    }
                    inputMode="numeric"
                    dir="ltr"
                    placeholder="روز"
                    disabled={busy}
                    required
                    {...field("birthDate")}
                  />
                  <select
                    className="student-input"
                    aria-label="ماه تولد"
                    value={draft.birthMonth}
                    onChange={(event) =>
                      change("birthMonth", event.target.value)
                    }
                    disabled={busy}
                  >
                    {months.map((month, index) => (
                      <option value={String(index + 1)} key={month}>
                        {month}
                      </option>
                    ))}
                  </select>
                  <input
                    className="student-input"
                    aria-label="سال تولد"
                    value={draft.birthYear}
                    onChange={(event) =>
                      change("birthYear", digits(event.target.value, 4))
                    }
                    inputMode="numeric"
                    dir="ltr"
                    placeholder="سال"
                    disabled={busy}
                    required
                    {...field("birthDate")}
                  />
                </div>
                {errors.birthDate && (
                  <p
                    className="student-field-error"
                    id="driver-register-birthDate-error"
                    role="alert"
                  >
                    {errors.birthDate}
                  </p>
                )}
              </fieldset>
              <Field
                id="driver-register-phone"
                label="شماره موبایل"
                error={errors.phone}
              >
                <input
                  id="driver-register-phone"
                  className="student-input"
                  value={draft.phone}
                  onChange={(event) =>
                    change(
                      "phone",
                      toEnglishDigits(event.target.value).slice(0, 16),
                    )
                  }
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  placeholder="شماره موبایل خود را وارد کنید"
                  disabled={busy}
                  required
                  {...field("phone")}
                />
              </Field>
              <fieldset
                className="driver-plate-field"
                aria-describedby={
                  errors.plate ? "driver-register-plate-error" : undefined
                }
              >
                <legend>شماره پلاک</legend>
                <div className="driver-plate" dir="ltr">
                  <div className="driver-plate-flag" aria-hidden="true">
                    <svg viewBox="0 0 36 24">
                      <path fill="#239f40" d="M0 0h36v8H0z" />
                      <path fill="#fff" d="M0 8h36v8H0z" />
                      <path fill="#da0000" d="M0 16h36v8H0z" />
                    </svg>
                    <small>IRAN</small>
                  </div>
                  <input
                    aria-label="دو رقم اول پلاک"
                    value={draft.plate.part1}
                    onChange={(event) =>
                      change("plate", {
                        ...draft.plate,
                        part1: digits(event.target.value, 2),
                      })
                    }
                    placeholder="— —"
                    inputMode="numeric"
                    disabled={busy}
                    maxLength={2}
                    required
                  />
                  <select
                    aria-label="حرف پلاک"
                    value={draft.plate.letter}
                    onChange={(event) =>
                      change("plate", {
                        ...draft.plate,
                        letter: event.target.value,
                      })
                    }
                    disabled={busy}
                  >
                    {letters.map((letter) => (
                      <option key={letter}>{letter}</option>
                    ))}
                  </select>
                  <input
                    aria-label="سه رقم پلاک"
                    value={draft.plate.part2}
                    onChange={(event) =>
                      change("plate", {
                        ...draft.plate,
                        part2: digits(event.target.value, 3),
                      })
                    }
                    placeholder="— — —"
                    inputMode="numeric"
                    disabled={busy}
                    maxLength={3}
                    required
                  />
                  <div className="driver-plate-region">
                    <span>ایران</span>
                    <input
                      aria-label="کد منطقه پلاک"
                      value={draft.plate.part3}
                      onChange={(event) =>
                        change("plate", {
                          ...draft.plate,
                          part3: digits(event.target.value, 2),
                        })
                      }
                      placeholder="— —"
                      inputMode="numeric"
                      disabled={busy}
                      maxLength={2}
                      required
                    />
                  </div>
                </div>
                {errors.plate && (
                  <p
                    id="driver-register-plate-error"
                    className="student-field-error"
                    role="alert"
                  >
                    {errors.plate}
                  </p>
                )}
              </fieldset>
            </>
          )}
          {regStep === 2 && (
            <>
              {(
                [
                  ["nationalCard", "تصویر کارت ملی"],
                  ["licenseCard", "تصویر گواهینامه"],
                  ["carCard", "تصویر کارت خودرو"],
                ] as const
              ).map(([kind, label]) => (
                <DocumentUpload
                  key={kind}
                  kind={kind}
                  title={label}
                  value={draft.documents[kind]}
                  name={draft.documentNames[kind]}
                  disabled={registrationPending}
                  onChange={(dataUrl, filename) =>
                    logic.actions.setDraft((previous) => ({
                      ...previous,
                      documents: { ...previous.documents, [kind]: dataUrl },
                      documentNames: {
                        ...previous.documentNames,
                        [kind]: filename,
                      },
                    }))
                  }
                  onBusy={(value) =>
                    setReading((previous) => ({ ...previous, [kind]: value }))
                  }
                />
              ))}
              <p className="driver-field-help" id="driver-document-limits">
                هر مدرک حداکثر ۳ مگابایت؛ PNG، JPEG، WebP یا PDF. مدارک همراه
                ثبت نهایی ارسال می‌شوند.
              </p>
              {errors.documents && <StatusMessage error={errors.documents} />}
            </>
          )}
          {regStep === 3 && (
            <>
              <p className="driver-account-help">
                لطفاً نام کاربری و رمز عبور دلخواه خود را وارد کنید. از این
                اطلاعات برای ورود به پنل رانندگان استفاده خواهد شد.
              </p>
              <Field
                id="driver-register-regUsername"
                label="نام کاربری (انگلیسی)"
                error={errors.regUsername}
              >
                <div className="driver-input-icon">
                  <Icons.User size={24} aria-hidden="true" />
                  <input
                    id="driver-register-regUsername"
                    className="student-input"
                    value={draft.regUsername}
                    onChange={(event) =>
                      change("regUsername", toEnglishDigits(event.target.value))
                    }
                    autoComplete="username"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    dir="ltr"
                    maxLength={50}
                    placeholder="username"
                    disabled={busy}
                    required
                    {...field("regUsername")}
                  />
                </div>
              </Field>
              <Field
                id="driver-register-regPassword"
                label="رمز عبور"
                error={errors.regPassword}
              >
                <div className="driver-input-icon">
                  <Icons.Lock size={24} aria-hidden="true" />
                  <input
                    id="driver-register-regPassword"
                    className="student-input"
                    type="password"
                    value={draft.regPassword}
                    onChange={(event) =>
                      change("regPassword", toEnglishDigits(event.target.value))
                    }
                    autoComplete="new-password"
                    dir="ltr"
                    placeholder="password"
                    disabled={busy}
                    required
                    {...field("regPassword")}
                  />
                </div>
              </Field>
            </>
          )}
          {errors.form && <StatusMessage error={errors.form} />}
          <div className="driver-registration-actions">
            {regStep > 1 && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  logic.actions.setRegStep(regStep - 1);
                }}
              >
                قبلی
              </Button>
            )}
            <Button type="submit" pending={registrationPending} disabled={busy}>
              {registrationPending
                ? "در حال ثبت درخواست…"
                : regStep === 3
                  ? "ثبت‌نام نهایی"
                  : "مرحله بعد"}
            </Button>
          </div>
        </form>
        <p className="driver-draft-note">
          با بازخوانی این صفحه، فرم از ابتدا شروع می‌شود.
        </p>
        <DriverTrail />
      </div>
    </div>
  );
}
