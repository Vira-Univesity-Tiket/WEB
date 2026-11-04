import React, { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icons } from "../Icons";
import TicketCameraScanner from "../TicketCameraScanner";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import type { DriverLogic } from "../../hooks/useDriverLogic";
import type { DriverPage } from "../../utils/driverRegistration";
import { Button, IconButton } from "../student/StudentUI";
export {
  Button,
  IconButton,
  Field,
  StatusMessage,
  BottomSheet,
} from "../student/StudentUI";

export function DriverBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={"driver-brand" + (compact ? " driver-brand-compact" : "")}>
      <div className="driver-brand-name">
        <img src="/logo/welcome.png" width="56" height="56" alt="نشان ویرا" />
        <strong>ویرا</strong>
      </div>
      <span>پورتال رانندگان</span>
    </div>
  );
}
export function DriverBanner({ shuttle = false }: { shuttle?: boolean }) {
  return (
    <header className="driver-banner">
      <DriverBrand />
      <img
        className="driver-banner-art"
        src={`/illustrations/driver/${shuttle ? "profile-shuttle" : "portal"}.png`}
        width={shuttle ? 520 : 540}
        height={shuttle ? 305 : 208}
        alt=""
      />
    </header>
  );
}
export function DriverTrail({ city = false }: { city?: boolean }) {
  if (city)
    return (
      <img
        className="driver-trail driver-trail-city"
        src="/illustrations/driver/scan-route.png"
        width="717"
        height="430"
        alt=""
      />
    );
  return (
    <svg
      className="driver-trail"
      viewBox="0 0 800 180"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M-15 96C120-35 235 188 420 117S660 46 820 110"
        stroke="#8cddd5"
        strokeWidth="3"
        strokeDasharray="10 13"
        opacity=".65"
      />
      <g fill="#70d5ca">
        <path d="M667 35c-23 0-27 28 0 54 27-26 23-54 0-54Z" />
        <circle cx="667" cy="53" r="7" fill="#f5f8fc" />
      </g>
      <g stroke="#70d5ca" strokeWidth="3" transform="translate(130 57)">
        <rect width="29" height="32" rx="5" />
        <path d="M3 8h23M4 25h21M14 8v11" />
        <circle cx="6" cy="33" r="2" />
        <circle cx="23" cy="33" r="2" />
      </g>
    </svg>
  );
}
export function DriverNavigation({
  page,
  onNavigate,
}: {
  page: DriverPage;
  onNavigate: (page: DriverPage) => void;
}) {
  const entries = [
    { value: "dashboard", text: "داشبورد", Icon: Icons.Activity },
    { value: "scan", text: "اسکن", Icon: Icons.QrCode },
    { value: "request", text: "درخواست مسیر", Icon: Icons.Navigation },
    { value: "profile", text: "پروفایل", Icon: Icons.User },
  ] as const;
  return (
    <nav
      className="student-bottom-nav driver-navigation"
      aria-label="پیمایش راننده"
    >
      {entries.map(({ value, text, Icon }) => (
        <button
          type="button"
          key={value}
          onClick={() => onNavigate(value)}
          aria-current={page === value ? "page" : undefined}
        >
          <Icon size={29} strokeWidth={1.9} aria-hidden="true" />
          <span>{text}</span>
        </button>
      ))}
    </nav>
  );
}
export function DriverHeading({
  children,
  icon,
  action,
}: {
  children: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="driver-section-heading">
      <h2>
        {icon && (
          <span className="driver-icon-tile" aria-hidden="true">
            {icon}
          </span>
        )}
        {children}
      </h2>
      {action}
    </div>
  );
}
export function DriverScanResult({ logic }: { logic: DriverLogic }) {
  const { scanState } = logic.state;
  if (scanState.type === "idle") return null;
  return (
    <div
      className={"driver-scan-result driver-scan-" + scanState.type}
      role={["error", "unknown"].includes(scanState.type) ? "alert" : "status"}
      aria-atomic="true"
    >
      <strong>{scanState.title}</strong>
      {scanState.detail && <p>{scanState.detail.replace(/بلیط/g, "بلیت")}</p>}
      {scanState.type === "unknown" && (
        <Button variant="outline" onClick={logic.actions.reviewScans}>
          بررسی سوابق ثبت مسافر
        </Button>
      )}
    </div>
  );
}
export function DriverScanLauncher({
  logic,
  dashboard = false,
}: {
  logic: DriverLogic;
  dashboard?: boolean;
}) {
  return (
    <section className="driver-card driver-camera-card">
      <DriverHeading icon={<Icons.QrCode size={25} />}>
        {dashboard ? "ثبت مسافر (اسکن بلیت)" : "اسکن بلیت"}
      </DriverHeading>
      <button
        type="button"
        className="driver-camera-launch"
        onClick={logic.actions.openScanner}
      >
        {dashboard ? (
          <Icons.QrCode size={52} aria-hidden="true" />
        ) : (
          <Icons.Camera size={52} aria-hidden="true" />
        )}
        <strong>{dashboard ? "اسکن بارکد (دوربین)" : "اسکن با دوربین"}</strong>
        <span>
          {dashboard
            ? "برای باز کردن اسکنر تمام‌صفحه کلیک کنید"
            : "برای شروع اسکن لمس کنید"}
        </span>
      </button>
    </section>
  );
}
export function DriverManualCode({
  logic,
  dashboard = false,
}: {
  logic: DriverLogic;
  dashboard?: boolean;
}) {
  return (
    <section className="driver-card driver-manual-card">
      <DriverHeading icon={<Icons.Key size={25} />}>
        {dashboard ? "کد ۴ رقمی (داشبورد)" : "ورود دستی کد ۴ رقمی"}
      </DriverHeading>
      <label className="student-visually-hidden" htmlFor="driver-ticket-code">
        کد ۴ رقمی بلیت
      </label>
      <input
        id="driver-ticket-code"
        aria-label="کد ۴ رقمی بلیت"
        className="student-input driver-code-input"
        dir="ltr"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={logic.state.code}
        disabled={logic.state.scanPending}
        onChange={(event) =>
          logic.actions.enterCode(event.target.value, "main")
        }
        placeholder="— — — —"
        aria-describedby="driver-code-help"
      />
      <p id="driver-code-help">
        در صورت مشکل دوربین، کد ۴ رقمی بلیت مسافر را وارد کنید.
      </p>
      {!logic.state.scannerOpen && <DriverScanResult logic={logic} />}
    </section>
  );
}
export function DriverScannerOverlay({ logic }: { logic: DriverLogic }) {
  const { scannerOpen, scannerMode, scanPending, scanState, manualCode } =
    logic.state;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!scannerOpen) return;
    const elements = [
      ...document.querySelectorAll<HTMLElement>(
        ".driver-background, .driver-navigation",
      ),
    ];
    const previous = elements.map((element) => element.inert);
    elements.forEach((element) => {
      element.inert = true;
    });
    return () =>
      elements.forEach((element, index) => {
        element.inert = previous[index];
      });
  }, [scannerOpen]);
  const dialog = useDialogFocus(scannerOpen, logic.actions.closeScanner);
  useEffect(() => {
    if (scannerOpen && scannerMode === "manual") {
      const frame = requestAnimationFrame(() => input.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [scannerOpen, scannerMode]);
  if (!scannerOpen) return null;
  return createPortal(
    <div
      className="vira-student vira-driver driver-scanner-overlay"
      dir="rtl"
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label="اسکن بلیت مسافر"
    >
      <div className="driver-scanner-toolbar">
        <strong>اسکن بلیت مسافر</strong>
        <IconButton
          aria-label="بستن اسکنر"
          onClick={logic.actions.closeScanner}
        >
          <Icons.X size={24} />
        </IconButton>
      </div>
      {scannerMode === "camera" ? (
        <>
          <TicketCameraScanner
            onScan={(value) => logic.actions.scan(value, "qr")}
            onManual={() => logic.actions.setScannerMode("manual")}
            busy={scanPending || scanState.type === "unknown"}
          />
          <div className="driver-camera-result">
            <DriverScanResult logic={logic} />
          </div>
        </>
      ) : (
        <div className="driver-scanner-manual">
          <span className="driver-icon-tile">
            <Icons.Key size={38} />
          </span>
          <h2>ورود کد دستی</h2>
          <p>کد ۴ رقمی زیر QR بلیت را وارد کنید</p>
          <DriverScanResult logic={logic} />
          <input
            ref={input}
            aria-label="کد ۴ رقمی بلیت"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            className="driver-overlay-code"
            disabled={scanPending}
            value={manualCode}
            onChange={(event) =>
              logic.actions.enterCode(event.target.value, "overlay")
            }
            placeholder="— — — —"
            maxLength={4}
          />
          <Button
            variant="outline"
            onClick={() => logic.actions.setScannerMode("camera")}
          >
            <Icons.Camera size={22} />
            بازگشت به دوربین
          </Button>
        </div>
      )}
    </div>,
    document.body,
  );
}
export function DriverEmptyRequests() {
  return (
    <div className="driver-empty-request">
      <svg viewBox="0 0 220 110" fill="none" aria-hidden="true">
        <path
          d="M20 80c15-25 46-23 48-4S28 85 57 56"
          stroke="#1acbb4"
          strokeWidth="2"
          strokeDasharray="5 5"
        />
        <path
          d="m70 45 99-26-39 71-18-25-42-20Z"
          stroke="#2764e7"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path d="m112 65 57-46-76 33" stroke="#2764e7" strokeWidth="3" />
        <ellipse cx="180" cy="78" rx="23" ry="9" fill="#e3f8f4" />
        <ellipse cx="36" cy="29" rx="24" ry="13" fill="#e3f8f4" />
      </svg>
      <p>درخواستی ثبت نشده است.</p>
    </div>
  );
}
