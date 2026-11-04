import React from "react";
import { Icons } from "../Icons";
import type { DriverLogic } from "../../hooks/useDriverLogic";
import { formatAmountFa, formatTomanFa } from "../../utils/numberUtils";
import {
  Button,
  DriverHeading,
  DriverManualCode,
  DriverScanLauncher,
  StatusMessage,
} from "./DriverUI";

export default function DriverDashboard({ logic }: { logic: DriverLogic }) {
  const { session, resources, summary, services, scans } = logic.state;
  if (!session) return null;
  const refresh = () => {
    void logic.actions.refreshData();
  };
  return (
    <>
      <section className="driver-card driver-identity" aria-label="هویت راننده">
        <span className="driver-icon-tile">
          <Icons.Car size={29} aria-hidden="true" />
        </span>
        <div>
          <h1>{session.name}</h1>
          <p>
            <bdi dir="ltr">{session.licensePlate}</bdi>
          </p>
        </div>
        <Button
          className="driver-logout"
          variant="outline"
          onClick={() => logic.actions.logout()}
        >
          <Icons.LogOut size={18} />
          خروج
        </Button>
      </section>
      <section aria-label="آمار امروز راننده" className="driver-statistics">
        <article className="driver-card driver-stat">
          <span>
            <small>مسافر سوار شده</small>
            <strong aria-label="تعداد مسافران امروز">
              {resources.summary.status === "ready" && summary
                ? formatAmountFa(summary.boardedCount)
                : "—"}
            </strong>
          </span>
          <span className="driver-icon-tile driver-stat-blue">
            <Icons.Users size={29} aria-hidden="true" />
          </span>
        </article>
        <article className="driver-card driver-stat">
          <span>
            <small>درآمد خالص امروز</small>
            <strong aria-label="درآمد خالص امروز">
              {resources.summary.status === "ready" && summary ? (
                <>
                  {formatAmountFa(summary.totalRevenue)} <small>تومان</small>
                </>
              ) : (
                "—"
              )}
            </strong>
          </span>
          <span className="driver-icon-tile driver-stat-green">
            <Icons.Wallet size={29} aria-hidden="true" />
          </span>
        </article>
      </section>
      {resources.summary.status === "error" ? (
        <StatusMessage error={resources.summary.error} onRetry={refresh} />
      ) : resources.summary.status !== "ready" ? (
        <StatusMessage loading>در حال دریافت آمار واقعی امروز…</StatusMessage>
      ) : null}
      <DriverScanLauncher logic={logic} dashboard />
      <DriverManualCode logic={logic} dashboard />
      <section
        className="driver-card driver-services"
        aria-labelledby="driver-services-title"
      >
        <DriverHeading icon={<Icons.Calendar size={25} />}>
          <span id="driver-services-title">وضعیت سرویس‌های من</span>
        </DriverHeading>
        {resources.services.status === "error" ? (
          <StatusMessage error={resources.services.error} onRetry={refresh} />
        ) : resources.services.status !== "ready" ? (
          <StatusMessage loading>در حال دریافت سرویس‌ها…</StatusMessage>
        ) : services.length === 0 ? (
          <StatusMessage>برنامه فعالی برای امروز ثبت نشده است.</StatusMessage>
        ) : (
          services.map((service) => (
            <article className="driver-service-card" key={service.id}>
              <div className="driver-service-route">
                <span className="driver-icon-tile">
                  <Icons.Bus size={29} aria-hidden="true" />
                </span>
                <div>
                  <h3>{service.route}</h3>
                  <p>
                    ساعت حرکت: <bdi dir="ltr">{service.departureTime}</bdi>
                  </p>
                </div>
              </div>
              <div className="driver-service-sales">
                <span
                  className="driver-service-badge"
                  data-status={
                    service.soldOut
                      ? "full"
                      : service.hasSales
                        ? "sales"
                        : "empty"
                  }
                >
                  {service.soldOut
                    ? "تکمیل ظرفیت"
                    : service.hasSales
                      ? "دارای فروش"
                      : "بدون فروش"}
                </span>
                <span>{formatAmountFa(service.soldCount)} فروش</span>
                <strong>{formatTomanFa(service.soldAmount)}</strong>
              </div>
              <p className="driver-service-capacity">
                ظرفیت باقی‌مانده: {formatAmountFa(service.remainingSeats)} از{" "}
                {formatAmountFa(service.totalSeats)} · قیمت بلیت:{" "}
                {formatTomanFa(service.ticketPrice)}
              </p>
            </article>
          ))
        )}
      </section>
      <section
        className="driver-card driver-recent-scans"
        aria-labelledby="driver-recent-title"
      >
        <DriverHeading
          icon={<Icons.Clock size={25} />}
          action={
            <button
              type="button"
              className="driver-text-refresh"
              aria-label="تازه‌سازی اسکن‌های اخیر"
              onClick={refresh}
              disabled={resources.scans.status === "loading"}
            >
              <Icons.RefreshCw size={21} />
            </button>
          }
        >
          <span id="driver-recent-title">اسکن‌های اخیر</span>
        </DriverHeading>
        {resources.scans.status === "error" ? (
          <StatusMessage error={resources.scans.error} onRetry={refresh} />
        ) : resources.scans.status !== "ready" ? (
          <StatusMessage loading>در حال دریافت سوابق…</StatusMessage>
        ) : scans.length === 0 ? (
          <StatusMessage>هنوز مسافری ثبت نشده است.</StatusMessage>
        ) : (
          <div className="driver-scan-list">
            {scans.map((scan) => (
              <article key={scan.id} className="driver-recent-row">
                <div>
                  <strong>{scan.passengerName}</strong>
                  <p>
                    کد: <bdi dir="ltr">{scan.validationCode}</bdi> | روش:{" "}
                    {scan.method === "qr" ? "اسکن QR" : "کد دستی"}
                    {(scan.count || 1) > 1 && (
                      <> | {formatAmountFa(scan.count || 1)} مسافر</>
                    )}
                  </p>
                </div>
                <div>
                  <b>{formatTomanFa(scan.amount)}</b>
                  <time dateTime={scan.scannedAt}>
                    {new Date(scan.scannedAt).toLocaleTimeString("fa-IR", {
                      timeZone: "Asia/Tehran",
                    })}
                  </time>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
