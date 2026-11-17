import React, { useEffect, useRef, useState } from "react";
import { Icons } from "../components/Icons";
import { ResourceState, Transaction, UserProfile } from "../types";
import {
  getWalletTopupStatus,
  initiateTopupWallet,
} from "../services/apiService";
import {
  amountToPersianWordsToman,
  formatAmountFa,
  formatPersianTextNumbers,
  toEnglishDigits,
} from "../utils/numberUtils";
import {
  BottomSheet,
  Button,
  EmptyState,
  IconButton,
  PageHeader,
  StatusMessage,
  StudentPage,
} from "../components/student/StudentUI";

interface WalletViewProps {
  userProfile: UserProfile;
  onBack: () => void;
  transactions: Transaction[];
  showToast: (message: string, type: "success" | "error" | "info") => void;
  balanceResource: ResourceState;
  transactionsResource: ResourceState;
  onRefresh: () => Promise<unknown>;
}

const WalletView: React.FC<WalletViewProps> = ({
  userProfile,
  onBack,
  transactions,
  showToast,
  balanceResource,
  transactionsResource,
  onRefresh,
}) => {
  const [showTopUp, setShowTopUp] = useState(false);
  const [amountDigits, setAmountDigits] = useState("20000");
  const [amountTouched, setAmountTouched] = useState(false);
  const [topupError, setTopupError] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingTransaction, setPendingTransaction] = useState(() =>
    new URLSearchParams(window.location.search).get("topupTransactionId"),
  );
  const [paymentCheck, setPaymentCheck] = useState(0);
  const [polling, setPolling] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const refresh = useRef(onRefresh);
  const notify = useRef(showToast);
  refresh.current = onRefresh;
  notify.current = showToast;

  useEffect(() => {
    if (!pendingTransaction) return;
    let active = true;
    setPolling(true);
    setPaymentNotice(null);
    const cleanResolvedUrl = () => {
      const url = new URL(window.location.href);
      for (const key of [
        "topupTransactionId",
        "topupStatus",
        "topupReferenceId",
        "topupMessage",
      ])
        url.searchParams.delete(key);
      window.history.replaceState(
        window.history.state,
        "",
        url.pathname + url.search + url.hash,
      );
      setPendingTransaction(null);
    };
    const check = async () => {
      try {
        const start = Date.now();
        let status = await getWalletTopupStatus(pendingTransaction);
        while (
          active &&
          status.status === "pending" &&
          Date.now() - start < 40_000
        ) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
          if (!active) return;
          status = await getWalletTopupStatus(pendingTransaction);
        }
        if (!active) return;
        if (status.status === "pending") {
          setPaymentNotice({
            type: "info",
            message:
              "وضعیت پرداخت هنوز نهایی نشده است. برای بررسی دوباره تلاش کنید.",
          });
          return;
        }
        const type = status.status === "success" ? "success" : "error";
        const message =
          status.message ||
          (type === "success"
            ? "پرداخت توسط درگاه تأیید شد."
            : "پرداخت تأیید نشد.");
        setPaymentNotice({ type, message });
        notify.current(message, type);
        if (status.status === "success") await refresh.current();
        if (active) cleanResolvedUrl();
      } catch (error) {
        if (active)
          setPaymentNotice({
            type: "error",
            message:
              (error as Error).message || "دریافت وضعیت پرداخت ناموفق بود.",
          });
      } finally {
        if (active) setPolling(false);
      }
    };
    void check();
    return () => {
      active = false;
    };
  }, [pendingTransaction, paymentCheck]);

  const balanceText = formatPersianTextNumbers(userProfile.balance);
  const amount = Number(amountDigits);
  const amountError =
    !Number.isSafeInteger(amount) || amount < 10_000
      ? "حداقل مبلغ افزایش موجودی ۱۰٬۰۰۰ تومان است."
      : amount > 50_000_000
        ? "حداکثر مبلغ افزایش موجودی ۵۰٬۰۰۰٬۰۰۰ تومان است."
        : "";
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAmountTouched(true);
    setTopupError("");
    if (amountError || submitting.current || polling || pendingTransaction)
      return;
    submitting.current = true;
    setPending(true);
    try {
      // This endpoint accepts Toman. The server performs the sole conversion to Rial.
      const initiated = await initiateTopupWallet(amount);
      if (!initiated.paymentUrl)
        throw new Error("لینک پرداخت معتبر دریافت نشد.");
      const url = new URL(initiated.paymentUrl, window.location.origin);
      const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
      if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
        throw new Error("لینک پرداخت معتبر نیست.");
      window.location.assign(url.href);
    } catch (error) {
      const message = (error as Error).message || "ایجاد پرداخت ناموفق بود.";
      setTopupError(message);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  return (
    <StudentPage
      header={
        <PageHeader
          title="کیف پول"
          onBack={onBack}
          action={
            <IconButton
              aria-label="بروزرسانی کیف پول"
              className="student-header-action"
              onClick={() => {
                void onRefresh();
              }}
              disabled={
                balanceResource.status === "loading" ||
                transactionsResource.status === "loading"
              }
            >
              <Icons.Activity size={25} />
            </IconButton>
          }
        />
      }
    >
      {polling && (
        <StatusMessage loading>در حال بررسی وضعیت واقعی پرداخت…</StatusMessage>
      )}
      {paymentNotice && (
        <StatusMessage
          error={
            paymentNotice.type === "error" ? paymentNotice.message : undefined
          }
          onRetry={
            pendingTransaction
              ? () => setPaymentCheck((previous) => previous + 1)
              : undefined
          }
        >
          {paymentNotice.message}
        </StatusMessage>
      )}
      <section
        className="student-hero student-wallet-card"
        aria-label="موجودی کیف پول"
      >
        <svg
          className="student-hero-route"
          viewBox="0 0 250 200"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M155 12C220 60-45 25 25 108S280 150 150 220"
            stroke="#1acbb4"
            strokeWidth="7"
          />
          <circle
            cx="155"
            cy="12"
            r="7"
            fill="white"
            stroke="#1acbb4"
            strokeWidth="4"
          />
        </svg>
        <img
          src="/illustrations/wallet.png"
          className="student-wallet-art"
          alt=""
          width="176"
          height="138"
        />
        <div className="student-hero-text">
          <h2>موجودی فعلی</h2>
          <div
            className="student-wallet-balance"
            data-compact={balanceText.length > 16 ? "true" : undefined}
          >
            {balanceResource.status === "ready" ? (
              balanceText
            ) : balanceResource.status === "error" ? (
              <span className="student-wallet-unavailable">
                دریافت موجودی ناموفق بود
              </span>
            ) : (
              <span className="student-wallet-unavailable">در حال دریافت…</span>
            )}
          </div>
        </div>
        <Button variant="secondary" onClick={() => setShowTopUp(true)}>
          <Icons.PlusSquare size={24} aria-hidden="true" />
          افزایش موجودی
        </Button>
      </section>
      {balanceResource.status === "error" && (
        <StatusMessage
          error={balanceResource.error}
          onRetry={() => {
            void onRefresh();
          }}
        />
      )}
      <div className="student-section-heading">
        <h2>
          <Icons.Activity
            size={24}
            className="student-inline-icon"
            aria-hidden="true"
          />{" "}
          تراکنش‌های اخیر
        </h2>
      </div>
      {transactionsResource.status === "loading" ||
      transactionsResource.status === "idle" ? (
        <StatusMessage loading>در حال دریافت تراکنش‌ها…</StatusMessage>
      ) : transactionsResource.status === "error" ? (
        <StatusMessage
          error={transactionsResource.error}
          onRetry={() => {
            void onRefresh();
          }}
        />
      ) : transactions.length === 0 ? (
        <EmptyState illustration="wallet" title="هنوز تراکنشی ثبت نشده است" />
      ) : (
        transactions.map((transaction) => (
          <article
            className="student-card student-transaction"
            key={transaction.id}
          >
            <button
              type="button"
              onClick={() =>
                setExpanded(expanded === transaction.id ? null : transaction.id)
              }
              aria-expanded={expanded === transaction.id}
              aria-controls={`transaction-details-${transaction.id}`}
              aria-label={
                "جزئیات تراکنش " + transaction.title.replace(/بلیط/g, "بلیت")
              }
            >
              <span className="student-icon-tile" aria-hidden="true">
                {transaction.type === "deposit" ? (
                  <Icons.ArrowDownLeft size={23} />
                ) : (
                  <Icons.ArrowUpRight size={23} />
                )}
              </span>
              <div className="student-transaction-main">
                <strong>{transaction.title.replace(/بلیط/g, "بلیت")}</strong>
                <small>
                  <bdi>{transaction.date}</bdi> | <bdi>{transaction.time}</bdi>
                </small>
              </div>
              <div
                className={
                  "student-transaction-amount" +
                  (transaction.type === "deposit"
                    ? " student-transaction-deposit"
                    : "")
                }
              >
                <bdi>
                  {transaction.type === "deposit" ? "+" : "−"}
                  {formatAmountFa(transaction.amount)}
                </bdi>
                <small>تومان</small>
              </div>
            </button>
            {expanded === transaction.id && (
              <div id={`transaction-details-${transaction.id}`} className="student-transaction-detail">
                <div>
                  کد پیگیری
                  <br />
                  <bdi>{transaction.trackingNumber}</bdi>
                </div>
                <div>
                  وضعیت
                  <br />
                  ثبت‌شده
                </div>
              </div>
            )}
          </article>
        ))
      )}
      <BottomSheet
        open={showTopUp}
        onClose={() => setShowTopUp(false)}
        title="افزایش موجودی"
        icon={<Icons.Wallet size={26} />}
        dismissible={!pending}
      >
        <form onSubmit={submit} noValidate>
          <div className="student-topup-input">
            <label htmlFor="wallet-topup-amount">
              مبلغ مورد نظر را وارد کنید
            </label>
            <div className="student-topup-input-row">
              <input
                id="wallet-topup-amount"
                inputMode="numeric"
                type="text"
                value={amountDigits ? formatAmountFa(amount) : ""}
                onChange={(event) => {
                  setAmountDigits(
                    toEnglishDigits(event.target.value)
                      .replace(/\D/g, "")
                      .slice(0, 9),
                  );
                  setTopupError("");
                }}
                onBlur={() => setAmountTouched(true)}
                disabled={pending}
                aria-invalid={amountTouched && Boolean(amountError)}
                aria-describedby={
                  amountTouched && amountError
                    ? "wallet-topup-error"
                    : "wallet-topup-words"
                }
              />
              <span>تومان</span>
            </div>
            <p id="wallet-topup-words">{amountToPersianWordsToman(amount)}</p>
          </div>
          <div className="student-amount-options">
            {[10_000, 20_000, 50_000].map((value) => (
              <button
                type="button"
                key={value}
                disabled={pending}
                aria-pressed={amount === value}
                onClick={() => {
                  setAmountDigits(String(value));
                  setAmountTouched(false);
                  setTopupError("");
                }}
              >
                {formatAmountFa(value)}
              </button>
            ))}
          </div>
          {amountTouched && amountError && (
            <p
              id="wallet-topup-error"
              className="student-field-error student-topup-error"
              role="alert"
            >
              {amountError}
            </p>
          )}
          {topupError && (
            <div className="student-topup-error">
              <StatusMessage error={topupError} />
            </div>
          )}
          {pendingTransaction && (
            <div className="student-topup-error">
              <StatusMessage>
                ابتدا وضعیت پرداخت قبلی را در همین صفحه بررسی کنید.
              </StatusMessage>
            </div>
          )}
          <Button
            type="submit"
            className="student-button-block"
            pending={pending}
            disabled={
              Boolean(amountError) ||
              pending ||
              polling ||
              Boolean(pendingTransaction)
            }
          >
            <Icons.CreditCard size={24} aria-hidden="true" />
            {pending ? "در حال اتصال به درگاه…" : "پرداخت آنلاین"}
          </Button>
        </form>
      </BottomSheet>
    </StudentPage>
  );
};
export default WalletView;
