import React from "react";
import { Coins } from "lucide-react";
import { Icons } from "../Icons";
import StationPicker from "../student/StationPicker";
import type { DriverLogic } from "../../hooks/useDriverLogic";
import {
  amountToPersianWordsToman,
  formatAmountFa,
  toEnglishDigits,
} from "../../utils/numberUtils";
import {
  Button,
  DriverHeading,
  Field,
  StatusMessage,
  DriverEmptyRequests,
} from "./DriverUI";

export default function DriverRouteRequests({ logic }: { logic: DriverLogic }) {
  const {
    routeOrigin,
    routeDestination,
    routeTime,
    routePrice,
    routePending,
    routeErrors: errors,
    routeNotice,
    requests,
    stations,
    resources,
  } = logic.state;
  const refresh = () => {
    void logic.actions.refreshRoute();
  };
  return (
    <>
      <section className="driver-card driver-route-request">
        <DriverHeading
          icon={<Icons.Navigation size={27} />}
          action={
            <Button
              variant="outline"
              onClick={refresh}
              disabled={routePending || resources.requests.status === "loading"}
            >
              <Icons.RefreshCw size={22} />
              به‌روزرسانی
            </Button>
          }
        >
          درخواست مسیر
        </DriverHeading>
        <form
          className="driver-route-form"
          onSubmit={logic.actions.submitRoute}
          noValidate
        >
          <div className="driver-route-stations">
            <StationPicker
              disabled={routePending}
              kind="origin"
              label="ایستگاه مبدأ"
              placeholder="انتخاب مبدأ…"
              value={routeOrigin}
              excludedId={routeDestination}
              stations={stations}
              resource={resources.stations}
              onChange={logic.actions.setRouteOrigin}
              onRetry={refresh}
            />
            {errors.origin && (
              <p className="student-field-error" role="alert">
                {errors.origin}
              </p>
            )}
            <StationPicker
              disabled={routePending}
              kind="destination"
              label="ایستگاه مقصد"
              placeholder="انتخاب مقصد…"
              value={routeDestination}
              excludedId={routeOrigin}
              stations={stations}
              resource={resources.stations}
              onChange={logic.actions.setRouteDestination}
              onRetry={refresh}
            />
            {errors.destination && (
              <p className="student-field-error" role="alert">
                {errors.destination}
              </p>
            )}
          </div>
          {resources.stations.status === "error" && (
            <StatusMessage error={resources.stations.error} onRetry={refresh} />
          )}
          <Field
            id="driver-route-time"
            label="ساعت حرکت"
            error={errors.time}
            className="driver-route-time-field"
          >
            <span className="driver-field-icon" aria-hidden="true">
              <Icons.Clock size={24} />
            </span>
            <input
              id="driver-route-time"
              className="student-input driver-time-input"
              type="time"
              dir="ltr"
              value={routeTime}
              onChange={(event) =>
                logic.actions.setRouteTime(event.target.value)
              }
              disabled={routePending}
              required
              aria-invalid={Boolean(errors.time)}
              aria-describedby={
                errors.time ? "driver-route-time-error" : undefined
              }
            />
          </Field>
          <Field
            id="driver-route-price"
            label="قیمت (تومان)"
            error={errors.price}
            className="driver-route-price-field"
          >
            <span className="driver-field-icon" aria-hidden="true">
              <Coins size={24} />
            </span>
            <input
              id="driver-route-price"
              className="student-input"
              inputMode="numeric"
              value={routePrice ? formatAmountFa(Number(routePrice)) : ""}
              onChange={(event) =>
                logic.actions.setRoutePrice(
                  toEnglishDigits(event.target.value)
                    .replace(/\D/g, "")
                    .slice(0, 9),
                )
              }
              disabled={routePending}
              required
              aria-invalid={Boolean(errors.price)}
              aria-describedby={
                errors.price
                  ? "driver-route-price-error"
                  : "driver-route-price-words"
              }
            />
            <p id="driver-route-price-words" className="driver-amount-words">
              {amountToPersianWordsToman(routePrice)}
            </p>
          </Field>
          {errors.form && <StatusMessage error={errors.form} />}
          {routeNotice && <StatusMessage>{routeNotice}</StatusMessage>}
          <Button
            type="submit"
            pending={routePending}
            disabled={routePending || resources.stations.status !== "ready"}
            className="driver-full-button"
          >
            {routePending ? "در حال ثبت…" : "ثبت درخواست"}
          </Button>
        </form>
      </section>
      <section className="driver-card driver-route-list">
        <DriverHeading icon={<Icons.FileText size={25} />}>
          وضعیت درخواست‌ها
        </DriverHeading>
        {resources.requests.status === "error" ? (
          <StatusMessage error={resources.requests.error} onRetry={refresh} />
        ) : resources.requests.status !== "ready" ? (
          <StatusMessage loading>در حال دریافت درخواست‌ها…</StatusMessage>
        ) : requests.length === 0 ? (
          <DriverEmptyRequests />
        ) : (
          requests.map((request) => (
            <article key={request.id} className="driver-request-card">
              <div>
                <h3>
                  {request.originName || request.originStationId}{" "}
                  <span aria-hidden="true">←</span>{" "}
                  {request.destinationName || request.destinationStationId}
                </h3>
                <span
                  className="driver-request-status"
                  data-status={request.status}
                >
                  {request.status === "approved"
                    ? "تأیید شد"
                    : request.status === "rejected"
                      ? "رد شد"
                      : "در انتظار بررسی"}
                </span>
              </div>
              <p>
                ساعت حرکت: <bdi dir="ltr">{request.departureTime}</bdi> · قیمت:{" "}
                {formatAmountFa(request.price)} تومان
              </p>
              {request.adminNote && (
                <p className="driver-request-note">
                  پاسخ مدیریت: {request.adminNote}
                </p>
              )}
            </article>
          ))
        )}
      </section>
    </>
  );
}
