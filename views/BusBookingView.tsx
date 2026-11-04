import React, { useEffect, useState } from "react";
import { Icons } from "../components/Icons";
import { MapRef } from "../components/MapVisual";
import {
  BusOption,
  BookingStage,
  Station,
  Ticket,
  ResourceState,
} from "../types";
import {
  formatAmountFa,
  amountToPersianWordsToman,
} from "../utils/numberUtils";
import {
  BottomSheet,
  Button,
  IconButton,
  PageHeader,
  RouteArtwork,
  StatusMessage,
  StudentPage,
} from "../components/student/StudentUI";
import StationPicker from "../components/student/StationPicker";
import TicketDocument from "../components/student/TicketDocument";

interface BusBookingViewProps {
  bookingStage: BookingStage;
  origin: string;
  destination: string;
  busOptions: BusOption[];
  selectedBus: BusOption | null;
  loading: boolean;
  bookingPending?: boolean;
  mapRef: React.RefObject<MapRef>;
  onBack: () => void;
  onLocate: () => void;
  onStationChange: (stationId: string, type: "origin" | "destination") => void;
  onSelectBus: (bus: BusOption) => void;
  onReset: () => void;
  onConfirm: (count: number) => void;
  onRefresh: () => void;
  onProfile: () => void;
  onFinishTrip: (ticketId: string) => void;
  onTickets: () => void;
  onStationsRetry: () => void;
  ticketId?: string;
  currentTicket?: Ticket;
  stations?: Station[];
  stationResource: ResourceState;
  scheduleResource: ResourceState;
  bookingError?: string;
}

const BusBookingView: React.FC<BusBookingViewProps> = ({
  bookingStage,
  origin,
  destination,
  busOptions,
  selectedBus,
  loading,
  bookingPending = false,
  onBack,
  onStationChange,
  onSelectBus,
  onReset,
  onConfirm,
  onRefresh,
  onProfile,
  onFinishTrip,
  onTickets,
  currentTicket,
  stations = [],
  stationResource,
  scheduleResource,
  bookingError,
  onStationsRetry,
}) => {
  const [ticketCount, setTicketCount] = useState(1);
  useEffect(() => setTicketCount(1), [selectedBus?.id]);
  const count = Math.max(
    1,
    Math.min(ticketCount, 6, selectedBus?.remainingSeats || 1),
  );
  const stationName = (id: string) =>
    stations.find((station) => station.id === id)?.name || id;
  const confirming =
    bookingStage === BookingStage.CONFIRMATION && Boolean(selectedBus);
  const issued = bookingStage === BookingStage.TICKET_VIEW;
  const routeChosen = Boolean(origin && destination);

  return (
    <StudentPage
      className="student-booking"
      header={
        <PageHeader
          title="رزرو سرویس"
          onBack={onBack}
          action={
            <IconButton aria-label="حساب کاربری" onClick={onProfile}>
              <Icons.User size={25} />
            </IconButton>
          }
        />
      }
    >
      <section
        className="student-card student-route-card"
        aria-labelledby="route-selector-heading"
      >
        <div className="student-section-heading">
          <h2 id="route-selector-heading">انتخاب مسیر</h2>
          <IconButton
            onClick={onRefresh}
            aria-label="تازه‌سازی سرویس‌ها"
            disabled={loading}
            title="تازه‌سازی ایستگاه‌ها و سرویس‌های همین مسیر"
          >
            <Icons.RefreshCw
              size={23}
              className={loading ? "animate-spin" : ""}
            />
          </IconButton>
        </div>
        <div className="student-route-fields">
          <StationPicker
            kind="origin"
            value={origin}
            excludedId={destination}
            stations={stations}
            resource={stationResource}
            onChange={(id) => onStationChange(id, "origin")}
            onRetry={onStationsRetry}
          />
          <StationPicker
            kind="destination"
            value={destination}
            excludedId={origin}
            stations={stations}
            resource={stationResource}
            onChange={(id) => onStationChange(id, "destination")}
            onRetry={onStationsRetry}
          />
        </div>
      </section>
      {!routeChosen && (
        <div className="student-route-empty">
          <RouteArtwork />
          <h2>مسیر سفرتان را انتخاب کنید</h2>
          <p>برای مشاهده سرویس‌ها، مبدأ و مقصد را مشخص کنید.</p>
        </div>
      )}
      {routeChosen && (
        <>
          <div className="student-section-heading">
            <h2>سرویس‌های موجود</h2>
            <span>برنامه امروز</span>
          </div>
          {loading ||
          scheduleResource.status === "loading" ||
          scheduleResource.status === "idle" ? (
            <StatusMessage loading>در حال دریافت سرویس‌ها…</StatusMessage>
          ) : scheduleResource.status === "error" ? (
            <StatusMessage error={scheduleResource.error} onRetry={onRefresh} />
          ) : busOptions.length === 0 ? (
            <StatusMessage onRetry={onRefresh}>
              برای این مسیر در حال حاضر سرویسی یافت نشد.
            </StatusMessage>
          ) : (
            <div className="student-service-list">
              {busOptions.map((bus) => (
                <article key={bus.id} className="student-card student-bus-card">
                  <div className="student-bus-card-top">
                    <span className="student-icon-tile" aria-hidden="true">
                      <Icons.Bus size={28} />
                    </span>
                    <h3 className="student-bus-card-route">
                      {bus.originName || stationName(origin)}{" "}
                      <span aria-hidden="true">←</span>{" "}
                      {bus.destinationName || stationName(destination)}
                    </h3>
                    <div className="student-bus-card-price">
                      {formatAmountFa(bus.price)}
                      <small>تومان</small>
                    </div>
                  </div>
                  <div className="student-bus-times">
                    <span>
                      حرکت: <b dir="ltr">{bus.departureTime}</b>
                    </span>
                    {bus.arrivalTime && (
                      <span>
                        رسیدن: <b dir="ltr">{bus.arrivalTime}</b>
                      </span>
                    )}
                  </div>
                  <div className="student-bus-actions">
                    <span
                      className={
                        "student-capacity" +
                        (bus.remainingSeats <= 0
                          ? " student-capacity-full"
                          : "")
                      }
                    >
                      {bus.remainingSeats > 0
                        ? formatAmountFa(bus.remainingSeats) + " صندلی خالی"
                        : "ظرفیت تکمیل است"}
                    </span>
                    <Button
                      onClick={() => onSelectBus(bus)}
                      disabled={bus.remainingSeats <= 0 || bookingPending}
                    >
                      انتخاب بلیت
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      <BottomSheet
        open={confirming}
        onClose={onReset}
        title="تأیید نهایی و پرداخت"
        dismissible={!bookingPending}
      >
        {selectedBus && (
          <>
            <div className="student-booking-summary">
              <div>
                <small>مبدأ</small>
                <strong>{stationName(origin)}</strong>
              </div>
              <div>
                <small>مقصد</small>
                <strong>{stationName(destination)}</strong>
              </div>
            </div>
            <div className="student-time-grid">
              <div>
                <small>ساعت حرکت</small>
                <b dir="ltr">{selectedBus.departureTime}</b>
              </div>
              {selectedBus.arrivalTime && (
                <div>
                  <small>ساعت رسیدن</small>
                  <b dir="ltr">{selectedBus.arrivalTime}</b>
                </div>
              )}
            </div>
            <div className="student-quantity">
              <span>تعداد بلیت</span>
              <div className="student-quantity-controls">
                <button
                  type="button"
                  aria-label="افزایش تعداد بلیت"
                  disabled={
                    bookingPending ||
                    count >= Math.min(6, selectedBus.remainingSeats)
                  }
                  onClick={() => setTicketCount(count + 1)}
                >
                  +
                </button>
                <output aria-label="تعداد بلیت">{formatAmountFa(count)}</output>
                <button
                  type="button"
                  aria-label="کاهش تعداد بلیت"
                  disabled={bookingPending || count <= 1}
                  onClick={() => setTicketCount(count - 1)}
                >
                  −
                </button>
              </div>
            </div>
            <div className="student-payment-total">
              <h3>مبلغ قابل پرداخت</h3>
              <strong>
                {formatAmountFa(selectedBus.price * count)} <small>تومان</small>
              </strong>
              <p className="student-payment-words">
                {amountToPersianWordsToman(selectedBus.price * count)}
              </p>
            </div>
            <p className="student-payment-note">
              با تأیید این مرحله، مبلغ از کیف پول شما کسر خواهد شد.
            </p>
            {bookingError && (
              <div className="student-topup-error">
                <StatusMessage error={bookingError} />
              </div>
            )}
            <Button
              disabled={bookingPending || selectedBus.remainingSeats < count}
              pending={bookingPending}
              onClick={() => onConfirm(count)}
              className="student-button-block"
            >
              <Icons.Wallet size={23} aria-hidden="true" />
              {bookingPending ? "در حال صدور بلیت…" : "ثبت بلیت"}
            </Button>
          </>
        )}
      </BottomSheet>
      <BottomSheet
        open={issued}
        onClose={onTickets}
        title="بلیت صادرشده"
        presentation="document"
        className="student-qr-sheet"
        notice={
          currentTicket && (
            <div className="student-ticket-success">
              <Icons.CheckCircle size={23} />
              {formatAmountFa(currentTicket.passengerCount || 1)} بلیت با موفقیت
              رزرو شد
            </div>
          )
        }
      >
        {currentTicket ? (
          <TicketDocument
            ticket={currentTicket}
            arrivalTime={selectedBus?.arrivalTime}
            onBack={onTickets}
            onRate={() => {
              onReset();
              onFinishTrip(currentTicket.id);
            }}
          />
        ) : (
          <StatusMessage
            error="اطلاعات بلیت هنوز دریافت نشده است؛ برای بررسی نتیجه، فهرست بلیت‌ها را باز کنید."
            onRetry={onTickets}
          />
        )}
      </BottomSheet>
    </StudentPage>
  );
};
export default BusBookingView;
