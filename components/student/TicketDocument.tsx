import React from "react";
import { Ticket } from "../../types";
import { Icons } from "../Icons";
import QrCodeImage from "../QrCodeImage";
import { Button } from "./StudentUI";
import { formatAmountFa, formatPersianTextNumbers } from "../../utils/numberUtils";

export default function TicketDocument({
  ticket,
  arrivalTime,
  onBack,
  onDownload,
  downloading,
  onRate,
}: {
  ticket: Ticket;
  arrivalTime?: string;
  onBack: () => void;
  onDownload?: () => void;
  downloading?: boolean;
  onRate?: () => void;
}) {
  return (
    <div className="student-qr-document">
      <span className="student-icon-tile" aria-hidden="true">
        <Icons.Ticket size={34} />
      </span>
      <h2>{ticket.status === "active" ? "بلیت رزرو شد" : "اطلاعات بلیت"}</h2>
      <div className="student-qr-route">
        <div>
          <small>مبدأ</small>
          <strong>{ticket.origin}</strong>
        </div>
        <div>
          <small>مقصد</small>
          <strong>{ticket.destination}</strong>
        </div>
      </div>
      <div className="student-qr-facts">
        <div>
          <small>حرکت</small>
          <b dir="ltr">{ticket.time}</b>
        </div>
        <div>
          <small>{arrivalTime ? "رسیدن" : "صندلی"}</small>
          <b dir={arrivalTime ? "ltr" : undefined}>
            {arrivalTime || formatAmountFa(ticket.seatNumber)}
          </b>
        </div>
        <div>
          <small>قیمت</small>
          <b>{formatPersianTextNumbers(ticket.price)}</b>
        </div>
      </div>
      <div className="student-qr-code">
        <div className="student-qr-image">
          <QrCodeImage value={ticket.qrCode} size={240} />
        </div>
        <div className="student-qr-validation" dir="ltr">
          {ticket.validationCode || "ثبت نشده"}
        </div>
      </div>
      <small>کد چهاررقمی بلیت</small>
      {(ticket.passengerCount || 1) > 1 && (
        <p>{`این QR برای ${formatAmountFa(ticket.passengerCount || 1)} مسافر است.`}</p>
      )}
      <p className="student-qr-help">
        {ticket.status === "active" ? (
          <>
            این QR را به راننده نشان دهید.
            <br />
            بلیت برای روز صدور معتبر است.
          </>
        ) : ticket.boardedAt ? (
          "سوارشدن این بلیت توسط راننده ثبت شده است."
        ) : ticket.status === "cancelled" ? (
          "این بلیت لغو شده است و اعتبار استفاده ندارد."
        ) : (
          "اعتبار این بلیت به پایان رسیده است."
        )}
      </p>
      <details className="student-qr-identifier">
        <summary>شناسه بلیت و QR</summary>
        <p>
          شماره بلیت: <bdi>{ticket.id}</bdi>
        </p>
        <code dir="ltr">{ticket.qrCode}</code>
      </details>
      <div className="student-qr-buttons">
        {onRate && ticket.boardedAt && !ticket.feedbackRating && (
          <Button onClick={onRate}>ثبت نظر سفر</Button>
        )}
        {onDownload && (
          <Button
            variant="outline"
            pending={downloading}
            disabled={downloading}
            onClick={onDownload}
          >
            <Icons.Download size={21} aria-hidden="true" />
            {downloading ? "در حال ذخیره…" : "دانلود بلیت"}
          </Button>
        )}
        <Button variant="outline" onClick={onBack}>
          بازگشت
        </Button>
      </div>
    </div>
  );
}
