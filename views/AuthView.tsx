import React, { useEffect, useRef, useState } from "react";
import { AuthStage } from "../types";
import { Icons } from "../components/Icons";
import { toEnglishDigits } from "../utils/numberUtils";
import {
  normalizePersianName,
  validateFullNameFa,
  validateNationalCodeFa,
  validateStudentIdFa,
} from "../utils/validationUtils";
import { getLegalContent } from "../services/apiService";
import {
  BottomSheet,
  Button,
  Field,
  SegmentedTabs,
  StatusMessage,
  StudentSplash,
} from "../components/student/StudentUI";

interface AuthViewProps {
  authStage: AuthStage;
  onRegister: (
    name: string,
    studentId: string,
    nationalCode: string,
  ) => void | Promise<void>;
  onLogin: (studentId: string, nationalCode: string) => void | Promise<void>;
  error?: string;
}

const AuthView: React.FC<AuthViewProps> = ({
  authStage,
  onRegister,
  onLogin,
  error,
}) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [nationalCode, setNationalCode] = useState("");
  const [pending, setPending] = useState(false);
  const [submittedMode, setSubmittedMode] = useState<typeof mode | null>(null);
  const submitting = useRef(false);
  const [touched, setTouched] = useState({
    name: false,
    studentId: false,
    nationalCode: false,
  });
  const [showLegal, setShowLegal] = useState(false);
  const [legalContent, setLegalContent] = useState("");
  const [legalLoading, setLegalLoading] = useState(false);
  const [legalError, setLegalError] = useState("");
  const legalRequest = useRef(0);
  useEffect(
    () => () => {
      legalRequest.current += 1;
    },
    [],
  );

  const nameCheck = validateFullNameFa(name);
  const studentCheck = validateStudentIdFa(studentId);
  const nationalCheck = validateNationalCodeFa(nationalCode);
  const canSubmit =
    studentCheck.ok && nationalCheck.ok && (mode === "login" || nameCheck.ok);
  const nameError = touched.name && !nameCheck.ok ? nameCheck.error : "";
  const studentError =
    touched.studentId && !studentCheck.ok ? studentCheck.error : "";
  const nationalError =
    touched.nationalCode && !nationalCheck.ok ? nationalCheck.error : "";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched({ name: true, studentId: true, nationalCode: true });
    if (!canSubmit || submitting.current) return;
    submitting.current = true;
    setSubmittedMode(mode);
    setPending(true);
    try {
      if (mode === "login") await onLogin(studentId, nationalCode);
      else {
        const normalized = normalizePersianName(name);
        setName(normalized);
        await onRegister(normalized, studentId, nationalCode);
      }
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  const openLegal = async () => {
    const request = ++legalRequest.current;
    setShowLegal(true);
    setLegalLoading(true);
    setLegalError("");
    try {
      const data = await getLegalContent("user");
      if (request === legalRequest.current)
        setLegalContent(data?.content || "متنی برای قوانین ثبت نشده است.");
    } catch (failure) {
      if (request === legalRequest.current)
        setLegalError(
          (failure as Error).message || "دریافت قوانین ناموفق بود.",
        );
    } finally {
      if (request === legalRequest.current) setLegalLoading(false);
    }
  };

  if (
    authStage === AuthStage.SPLASH_START ||
    authStage === AuthStage.SPLASH_CENTER
  )
    return <StudentSplash />;

  return (
    <div className="vira-student student-auth student-view" dir="rtl">
      <div className="student-auth-inner">
        <header className="student-auth-brand">
          <div className="student-brand-mark">
            <img
              src="/logo/welcome.png"
              width="72"
              height="72"
              alt="نشان ویرا"
              decoding="async"
            />
          </div>
          <strong className="student-brand-name">ویرا</strong>
          <h1>سامانه هوشمند حمل‌ونقل دانشگاهی</h1>
          <p>سریع، هوشمند و مطمئن</p>
        </header>
        <section
          className="student-card student-auth-card"
          aria-label="حساب دانشجو"
        >
          <SegmentedTabs
            value={mode}
            disabled={pending}
            onChange={(next) => {
              if (!pending) {
                setMode(next);
                setTouched({
                  name: false,
                  studentId: false,
                  nationalCode: false,
                });
              }
            }}
            label="ورود یا ثبت‌نام"
            options={[
              { value: "login", label: "ورود" },
              { value: "register", label: "ثبت‌نام" },
            ]}
          />
          <form
            className="student-form"
            onSubmit={submit}
            noValidate
            aria-label={mode === "login" ? "ورود دانشجو" : "ثبت‌نام دانشجو"}
          >
            {mode === "register" && (
              <Field
                id="auth-name"
                label="نام و نام خانوادگی"
                error={nameError}
              >
                <div className="student-auth-input">
                  <span className="student-icon-tile" aria-hidden="true">
                    <Icons.User size={24} />
                  </span>
                  <input
                    id="auth-name"
                    className="student-input"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onBlur={() => {
                      setName(normalizePersianName(name));
                      setTouched((previous) => ({ ...previous, name: true }));
                    }}
                    maxLength={100}
                    autoComplete="name"
                    placeholder="نام کامل خود را وارد کنید"
                    required
                    disabled={pending}
                    aria-invalid={Boolean(nameError)}
                    aria-describedby={nameError ? "auth-name-error" : undefined}
                  />
                </div>
              </Field>
            )}
            <Field
              id="auth-student"
              label="شماره دانشجویی"
              error={studentError}
            >
              <div className="student-auth-input">
                <span className="student-icon-tile" aria-hidden="true">
                  <Icons.Book size={24} />
                </span>
                <input
                  id="auth-student"
                  className="student-input"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  autoComplete="username"
                  placeholder="۹ رقم"
                  value={studentId}
                  onChange={(event) =>
                    setStudentId(
                      toEnglishDigits(event.target.value)
                        .replace(/\D/g, "")
                        .slice(0, 9),
                    )
                  }
                  onBlur={() =>
                    setTouched((previous) => ({ ...previous, studentId: true }))
                  }
                  maxLength={9}
                  required
                  disabled={pending}
                  aria-invalid={Boolean(studentError)}
                  aria-describedby={
                    studentError ? "auth-student-error" : undefined
                  }
                />
              </div>
            </Field>
            <Field id="auth-national" label="کد ملی" error={nationalError}>
              <div className="student-auth-input">
                <span className="student-icon-tile" aria-hidden="true">
                  <Icons.QrCode size={24} />
                </span>
                <input
                  id="auth-national"
                  className="student-input"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  autoComplete="off"
                  placeholder="۱۰ رقم"
                  value={nationalCode}
                  onChange={(event) =>
                    setNationalCode(
                      toEnglishDigits(event.target.value)
                        .replace(/\D/g, "")
                        .slice(0, 10),
                    )
                  }
                  onBlur={() =>
                    setTouched((previous) => ({
                      ...previous,
                      nationalCode: true,
                    }))
                  }
                  maxLength={10}
                  required
                  disabled={pending}
                  aria-invalid={Boolean(nationalError)}
                  aria-describedby={
                    nationalError ? "auth-national-error" : undefined
                  }
                />
              </div>
            </Field>
            {error && submittedMode === mode && <StatusMessage error={error} />}
            <Button
              type="submit"
              pending={pending}
              disabled={pending || !canSubmit}
              className="student-button-block"
            >
              {pending
                ? "در حال ارسال…"
                : mode === "login"
                  ? "ورود به حساب"
                  : "شروع کنید"}
            </Button>
          </form>
          <div className="student-driver-link">
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = "/driver";
              }}
            >
              <Icons.Bus size={24} aria-hidden="true" />
              ورود به بخش رانندگان
            </Button>
          </div>
        </section>
        <p className="student-legal">
          با ورود به اپلیکیشن،{" "}
          <button type="button" onClick={openLegal}>
            قوانین و مقررات
          </button>{" "}
          را می‌پذیرید.
        </p>
      </div>
      <BottomSheet
        open={showLegal}
        onClose={() => {
          legalRequest.current += 1;
          setShowLegal(false);
        }}
        title="قوانین و مقررات کاربر"
        icon={<Icons.FileText size={24} />}
      >
        {legalLoading ? (
          <StatusMessage loading>در حال دریافت قوانین…</StatusMessage>
        ) : legalError ? (
          <StatusMessage error={legalError} onRetry={openLegal} />
        ) : (
          <div className="student-legal-text">{legalContent}</div>
        )}
      </BottomSheet>
    </div>
  );
};

export default AuthView;
