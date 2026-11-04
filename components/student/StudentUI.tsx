import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Home } from "lucide-react";
import { Icons } from "../Icons";
import { ViewState } from "../../types";
import { useDialogFocus } from "../../hooks/useDialogFocus";

export const StudentTheme = createContext(false);

export function Button({
  children,
  className = "",
  variant = "primary",
  pending = false,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline";
  pending?: boolean;
}) {
  return (
    <button
      type={type}
      className={`student-button student-button-${variant} ${className}`}
      aria-busy={pending || undefined}
      {...props}
    >
      {pending && <span className="student-spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function IconButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`student-icon-button ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function PageHeader({
  title,
  onBack,
  action,
  backLabel = "بازگشت به خانه",
  backDisabled = false,
}: {
  title: string;
  onBack: () => void;
  action?: ReactNode;
  backLabel?: string;
  backDisabled?: boolean;
}) {
  return (
    <header className="student-header">
      <div className="student-header-title">
        <IconButton
          onClick={onBack}
          aria-label={backLabel}
          disabled={backDisabled}
        >
          <Icons.ArrowRight size={25} />
        </IconButton>
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function StudentPage({
  children,
  header,
  className = "",
}: {
  children: ReactNode;
  header: ReactNode;
  className?: string;
}) {
  return (
    <section className={`student-page ${className}`}>
      {header}
      <div className="student-content">
        <RouteDecoration />
        <div className="student-content-inner">{children}</div>
      </div>
    </section>
  );
}

export function Field({
  id,
  label,
  error,
  hint,
  children,
  className = "",
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`student-field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <p id={`${id}-error`} className="student-field-error" role="alert">
          {error}
        </p>
      )}
      {hint && (
        <p id={`${id}-hint`} className="student-field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled = false,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
  disabled?: boolean;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="student-tabs" role="tablist" aria-label={label}>
      {options.map((option, index) => (
        <button
          type="button"
          role="tab"
          disabled={disabled}
          aria-selected={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          key={option.value}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            let next: number;
            if (event.key === "ArrowLeft") next = (index + 1) % options.length;
            else if (event.key === "ArrowRight")
              next = (index - 1 + options.length) % options.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = options.length - 1;
            else return;
            event.preventDefault();
            onChange(options[next].value);
            buttons.current[next]?.focus();
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function StatusMessage({
  error,
  children,
  onRetry,
  loading = false,
}: {
  error?: string;
  children?: ReactNode;
  onRetry?: () => void;
  loading?: boolean;
}) {
  return (
    <div
      className={`student-status ${error ? "student-status-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {loading ? (
        <span className="student-spinner" aria-hidden="true" />
      ) : error ? (
        <Icons.AlertCircle size={22} aria-hidden="true" />
      ) : (
        <Icons.Info size={20} aria-hidden="true" />
      )}
      <div>{error || children || "در حال دریافت اطلاعات…"}</div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          تلاش دوباره
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  illustration,
  title,
  description,
  action,
}: {
  illustration?: "tickets" | "support" | "ideas" | "wallet";
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={`student-card student-empty ${illustration === "wallet" ? "student-empty-wallet" : ""}`}
    >
      {illustration === "wallet" ? (
        <div className="student-empty-wallet-art" aria-hidden="true">
          <Icons.Wallet size={62} />
          <span />
          <i />
        </div>
      ) : (
        illustration && (
          <img
            className="student-empty-art"
            src={`/illustrations/${illustration}.png`}
            alt=""
            width="320"
            height="220"
            decoding="async"
          />
        )
      )}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function BottomSheet({
  open,
  onClose,
  title,
  icon,
  children,
  className = "",
  dismissible = true,
  presentation = "sheet",
  notice,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  dismissible?: boolean;
  presentation?: "sheet" | "document";
  notice?: ReactNode;
}) {
  const dark = useContext(StudentTheme);
  const headingId = useId();
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    trigger.current = document.activeElement as HTMLElement | null;
    const background = [
      ...document.querySelectorAll<HTMLElement>(
        ".student-view, .student-bottom-nav",
      ),
    ];
    const previous = background.map((element) => element.inert);
    background.forEach((element) => {
      element.inert = true;
    });
    return () => {
      background.forEach((element, index) => {
        element.inert = previous[index];
      });
      if (trigger.current?.isConnected)
        trigger.current.focus({ preventScroll: true });
    };
  }, [open]);
  const dialog = useDialogFocus(
    open,
    () => {
      if (dismissible) onClose();
    },
    "dialog",
  );
  if (!open) return null;
  return createPortal(
    <div
      className={`vira-student student-overlay student-overlay-${presentation} ${dark ? "student-dark" : ""}`}
      dir="rtl"
    >
      <div
        className="student-overlay-backdrop"
        onClick={() => {
          if (dismissible) onClose();
        }}
        aria-hidden="true"
      />
      {notice && <div className="student-document-notice">{notice}</div>}
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className={`student-sheet ${className}`}
      >
        <div className="student-sheet-handle" aria-hidden="true" />
        <div className="student-sheet-header">
          {icon && <span className="student-icon-tile">{icon}</span>}
          <h2 id={headingId}>{title}</h2>
          <IconButton
            onClick={onClose}
            disabled={!dismissible}
            aria-label={`بستن ${title}`}
          >
            <Icons.X size={24} />
          </IconButton>
        </div>
        <div className="student-sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function BottomNavigation({
  view,
  onNavigate,
}: {
  view: ViewState;
  onNavigate: (id: string) => void;
}) {
  const items = [
    { id: "home", view: ViewState.HOME, label: "خانه", Icon: Home },
    { id: "bus", view: ViewState.BUS, label: "رزرو", Icon: Icons.Bus },
    {
      id: "tickets",
      view: ViewState.TICKETS,
      label: "بلیت‌ها",
      Icon: Icons.Ticket,
    },
    {
      id: "wallet",
      view: ViewState.WALLET,
      label: "کیف پول",
      Icon: Icons.Wallet,
    },
  ];
  return (
    <nav className="student-bottom-nav" aria-label="پیمایش اصلی">
      {items.map(({ id, view: target, label, Icon }) => (
        <button
          type="button"
          key={id}
          onClick={() => onNavigate(id)}
          aria-current={view === target ? "page" : undefined}
        >
          <Icon size={26} strokeWidth={1.9} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export function RouteDecoration() {
  return (
    <svg
      className="student-route-decoration"
      viewBox="0 0 760 330"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="-35" cy="350" r="220" fill="currentColor" opacity=".15" />
      <path
        d="M-30 340C85 180 160 210 294 213S408 75 537 76 635 28 790 6"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M622 31a16 16 0 1 0-29 0l14 23 15-23Z" fill="currentColor" />
      <circle cx="607" cy="24" r="6" fill="var(--student-bg)" />
    </svg>
  );
}

export function RouteArtwork() {
  return (
    <svg
      className="student-route-art"
      viewBox="0 0 300 180"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="150" cy="155" rx="95" ry="9" fill="#cfdfef" />
      <path
        d="M30 124h32c42 0 21-39 69-39h52c41 0-15-40 60-40"
        stroke="#86e6db"
        strokeWidth="5"
      />
      <path d="M95 102a75 75 0 0 1 150 0" fill="#dff8f5" />
      <circle
        cx="30"
        cy="124"
        r="10"
        fill="white"
        stroke="#2764e7"
        strokeWidth="5"
      />
      <path d="M256 24a13 13 0 1 0-24 0l12 20 12-20Z" fill="#1acbb4" />
      <circle cx="244" cy="18" r="5" fill="white" />
      <rect
        x="107"
        y="56"
        width="88"
        height="90"
        rx="18"
        fill="white"
        stroke="#2764e7"
        strokeWidth="4"
      />
      <path
        d="M107 72h88v43h-88M107 124l12 5m76-5-12 5"
        stroke="#2764e7"
        strokeWidth="4"
      />
      <rect
        x="96"
        y="73"
        width="11"
        height="27"
        rx="4"
        stroke="#2764e7"
        strokeWidth="3"
      />
      <rect
        x="195"
        y="73"
        width="11"
        height="27"
        rx="4"
        stroke="#2764e7"
        strokeWidth="3"
      />
      <rect
        x="117"
        y="145"
        width="17"
        height="10"
        rx="4"
        stroke="#2764e7"
        strokeWidth="3"
      />
      <rect
        x="168"
        y="145"
        width="17"
        height="10"
        rx="4"
        stroke="#2764e7"
        strokeWidth="3"
      />
      <image href="/logo/welcome.png" x="137" y="119" width="27" height="24" />
    </svg>
  );
}

export function StudentSplash() {
  return (
    <div
      className="vira-student student-splash"
      dir="rtl"
      role="status"
      aria-label="آماده‌سازی ویرا"
    >
      <svg
        className="student-splash-line student-splash-line-top"
        viewBox="0 0 600 200"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M-20 20h120c100 0 90 130 230 130h300"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx="480" cy="150" r="7" fill="currentColor" />
      </svg>
      <div className="student-splash-brand">
        <div className="student-brand-mark">
          <img src="/logo/welcome.png" alt="" width="96" height="96" />
        </div>
        <strong className="student-brand-name">ویرا</strong>
        <h1>
          سامانه هوشمند
          <br />
          حمل‌ونقل دانشگاهی
        </h1>
        <p>سریع، هوشمند و مطمئن</p>
      </div>
      <svg
        className="student-splash-line student-splash-line-bottom"
        viewBox="0 0 600 200"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M-30 200C140 20 180 150 315 100S420-10 630 20"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx="315" cy="100" r="7" fill="currentColor" />
      </svg>
    </div>
  );
}
