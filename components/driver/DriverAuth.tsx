import React, { useEffect, useRef, useState } from "react";
import { Icons } from "../Icons";
import { getLegalContent } from "../../services/apiService";
import type { DriverLogic } from "../../hooks/useDriverLogic";
import { toEnglishDigits } from "../../utils/numberUtils";
import {
  BottomSheet,
  Button,
  Field,
  StatusMessage,
  DriverBanner,
  DriverTrail,
} from "./DriverUI";

export function DriverReview({ logic }: { logic: DriverLogic }) {
  return (
    <div className="driver-auth-scroll student-view driver-background driver-review">
      <div className="driver-review-inner">
        <DriverBanner />
        <section
          className="driver-card driver-review-card"
          aria-labelledby="driver-review-title"
        >
          <img
            src="/illustrations/driver/review.png"
            width="377"
            height="342"
            alt=""
          />
          <h1 id="driver-review-title">وضعیت: در حال بررسی</h1>
          <p>{logic.state.pendingMessage}</p>
          <Button onClick={logic.actions.backFromReview}>بازگشت</Button>
        </section>
        <DriverTrail />
      </div>
    </div>
  );
}
export default function DriverAuth({ logic }: { logic: DriverLogic }) {
  const { username, password, authError, loginPending } = logic.state;
  const [legalOpen, setLegalOpen] = useState(false),
    [legalLoading, setLegalLoading] = useState(false);
  const [legalContent, setLegalContent] = useState(""),
    [legalError, setLegalError] = useState("");
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  const closeLegal = () => {
    request.current += 1;
    setLegalOpen(false);
  };
  const openLegal = async () => {
    const current = ++request.current;
    setLegalOpen(true);
    setLegalLoading(true);
    setLegalError("");
    try {
      const response = await getLegalContent("driver");
      if (current === request.current)
        setLegalContent(
          response.content || "متنی برای قوانین رانندگان ثبت نشده است.",
        );
    } catch (error) {
      if (current === request.current)
        setLegalError((error as Error).message || "دریافت قوانین ناموفق بود.");
    } finally {
      if (current === request.current) setLegalLoading(false);
    }
  };
  return (
    <>
      <div className="driver-auth-scroll student-view driver-background">
        <div className="driver-login-inner">
          <header className="driver-login-brand">
            <img
              src="/illustrations/driver/login.png"
              width="249"
              height="244"
              alt=""
            />
            <strong>ویرا</strong>
            <h1>پنل رانندگان</h1>
          </header>
          <section
            className="driver-card driver-login-card"
            aria-label="ورود راننده"
          >
            <form onSubmit={logic.actions.login} noValidate>
              <Field id="driver-login-username" label="نام کاربری">
                <div className="driver-input-icon">
                  <Icons.User size={24} aria-hidden="true" />
                  <input
                    id="driver-login-username"
                    className="student-input"
                    aria-label="نام کاربری راننده"
                    value={username}
                    onChange={(event) =>
                      logic.actions.setUsername(
                        toEnglishDigits(event.target.value),
                      )
                    }
                    placeholder="نام کاربری خود را وارد کنید"
                    dir="ltr"
                    autoComplete="username"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={loginPending}
                    required
                  />
                </div>
              </Field>
              <Field id="driver-login-password" label="رمز عبور">
                <div className="driver-input-icon">
                  <Icons.Lock size={24} aria-hidden="true" />
                  <input
                    id="driver-login-password"
                    className="student-input"
                    aria-label="رمز عبور راننده"
                    type="password"
                    value={password}
                    onChange={(event) =>
                      logic.actions.setPassword(
                        toEnglishDigits(event.target.value),
                      )
                    }
                    placeholder="رمز عبور خود را وارد کنید"
                    dir="ltr"
                    autoComplete="current-password"
                    disabled={loginPending}
                    required
                  />
                </div>
              </Field>
              {authError && <StatusMessage error={authError} />}
              {!authError &&
                new URLSearchParams(location.search).get("driverView") ===
                  "review" && (
                  <StatusMessage>
                    برای بررسی وضعیت درخواست، دوباره وارد شوید.
                  </StatusMessage>
                )}
              <Button
                className="driver-full-button"
                type="submit"
                pending={loginPending}
                disabled={loginPending}
              >
                {loginPending ? "در حال ورود…" : "ورود به پنل"}
              </Button>
            </form>
            <div className="driver-signup-link">
              <span>حساب کاربری ندارید؟</span>
              <button
                type="button"
                disabled={loginPending}
                onClick={logic.actions.beginRegistration}
              >
                ثبت‌نام راننده
              </button>
            </div>
          </section>
          <button
            type="button"
            className="driver-legal-link"
            onClick={() => {
              void openLegal();
            }}
          >
            قوانین و مقررات رانندگان
          </button>
        </div>
      </div>
      <BottomSheet
        open={legalOpen}
        onClose={closeLegal}
        title="قوانین و مقررات رانندگان"
        icon={<Icons.FileText size={24} />}
      >
        {legalLoading ? (
          <StatusMessage loading>در حال دریافت قوانین…</StatusMessage>
        ) : legalError ? (
          <StatusMessage
            error={legalError}
            onRetry={() => {
              void openLegal();
            }}
          />
        ) : (
          <div className="student-legal-text">{legalContent}</div>
        )}
      </BottomSheet>
    </>
  );
}
