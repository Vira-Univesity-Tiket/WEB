import React, { useRef, useState } from "react";
import { Icons } from "../components/Icons";
import { ResourceState, Ticket } from "../types";
import {
  BottomSheet,
  Button,
  EmptyState,
  IconButton,
  PageHeader,
  SegmentedTabs,
  StatusMessage,
  StudentPage,
} from "../components/student/StudentUI";
import TicketDocument from "../components/student/TicketDocument";
import { formatAmountFa, formatPersianTextNumbers } from "../utils/numberUtils";
import { downloadTicketImage } from "../utils/downloadTicket";

interface TicketsViewProps {
  onBack: () => void;
  tickets: Ticket[];
  onFinishTrip: (ticketId: string) => void;
  showToast: (message: string, type: "success" | "error" | "info") => void;
  resource: ResourceState;
  onRefresh: () => void;
  onBook: () => void;
  onMessages: () => void;
}

const TicketsView: React.FC<TicketsViewProps> = ({
  onBack,
  tickets,
  onFinishTrip,
  showToast,
  resource,
  onRefresh,
  onBook,
  onMessages,
}) => {
  const [activeTab, setActiveTab] = useState<"active" | "expired">("active");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [downloading, setDownloading] = useState(false);
  const downloadBusy = useRef(false);
  const activeTickets = tickets.filter((ticket) => ticket.status === "active");
  const archivedTickets = tickets.filter(
    (ticket) => ticket.status !== "active",
  );
  const items = activeTab === "active" ? activeTickets : archivedTickets;
  const known = resource.status === "ready" || tickets.length > 0;
  const download = async () => {
    if (!selectedTicket || downloadBusy.current) return;
    downloadBusy.current = true;
    setDownloading(true);
    try {
      await downloadTicketImage(selectedTicket);
      showToast("تصویر بلیت ذخیره شد", "success");
    } catch (error) {
      showToast((error as Error).message || "ذخیره بلیت ناموفق بود.", "error");
    } finally {
      downloadBusy.current = false;
      setDownloading(false);
    }
  };

  return (
    <StudentPage
      header={
        <PageHeader
          title="بلیت‌های من"
          onBack={onBack}
          action={
            <IconButton
              className="student-header-action"
              aria-label="باز کردن راهنمای خودکار"
              onClick={onMessages}
            >
              <Icons.MessageSquare size={25} />
            </IconButton>
          }
        />
      }
    >
      <SegmentedTabs<"active" | "expired">
        label="فهرست بلیت‌ها"
        value={activeTab}
        onChange={setActiveTab}
        options={[
          {
            value: "active",
            label:
              "فعال (" +
              (known ? formatAmountFa(activeTickets.length) : "…") +
              ")",
          },
          {
            value: "expired",
            label:
              "آرشیو (" +
              (known ? formatAmountFa(archivedTickets.length) : "…") +
              ")",
          },
        ]}
      />
      {resource.status === "loading" || resource.status === "idle" ? (
        <StatusMessage loading>در حال دریافت بلیت‌ها…</StatusMessage>
      ) : resource.status === "error" ? (
        <StatusMessage error={resource.error} onRetry={onRefresh} />
      ) : items.length === 0 ? (
        <EmptyState
          illustration="tickets"
          title={
            activeTab === "active"
              ? "بلیت فعالی ندارید"
              : "هنوز بلیتی در آرشیو ندارید"
          }
          description="برای سفر بعدی، سرویس مورد نظرتان را رزرو کنید."
          action={
            <Button className="student-button-block" onClick={onBook}>
              <Icons.Bus size={25} aria-hidden="true" />
              رزرو سرویس
            </Button>
          }
        />
      ) : (
        items.map((ticket) => (
          <article key={ticket.id} className="student-card student-ticket-card">
            <div className="student-ticket-heading">
              <span>
                شماره بلیت: <bdi>{ticket.id}</bdi>
              </span>
              <span className="student-badge">
                {ticket.status === "active"
                  ? "فعال"
                  : ticket.status === "cancelled"
                    ? "لغوشده"
                    : ticket.boardedAt
                      ? "سفر انجام‌شده"
                      : "پایان اعتبار"}
              </span>
            </div>
            <h2 className="student-ticket-route">
              {ticket.origin}
              <span aria-hidden="true"> ← </span>
              <br />
              {ticket.destination}
            </h2>
            <div className="student-ticket-facts">
              <div className="student-ticket-fact">
                <span className="student-icon-tile" aria-hidden="true">
                  <Icons.Calendar size={24} />
                </span>
                <div>
                  <small>زمان</small>
                  <b>
                    <bdi>{ticket.date}</bdi> | <bdi>{ticket.time}</bdi>
                  </b>
                </div>
              </div>
              <div className="student-ticket-fact">
                <span className="student-icon-tile" aria-hidden="true">
                  <Icons.Armchair size={24} />
                </span>
                <div>
                  <small>صندلی</small>
                  <b>شماره {formatAmountFa(ticket.seatNumber)}</b>
                </div>
              </div>
              <div className="student-ticket-fact">
                <span className="student-icon-tile" aria-hidden="true">
                  <Icons.Wallet size={24} />
                </span>
                <div>
                  <small>قیمت</small>
                  <b>{formatPersianTextNumbers(ticket.price)}</b>
                </div>
              </div>
              <div className="student-ticket-fact">
                <span className="student-icon-tile" aria-hidden="true">
                  <Icons.QrCode size={24} />
                </span>
                <div>
                  <small>کد چهاررقمی</small>
                  <b dir="ltr">{ticket.validationCode || "ثبت نشده"}</b>
                </div>
              </div>
            </div>
            <div className="student-ticket-actions">
              <Button onClick={() => setSelectedTicket(ticket)}>
                <Icons.QrCode size={24} aria-hidden="true" />
                نمایش بلیت و QR
              </Button>
              <Button
                disabled={!ticket.boardedAt || Boolean(ticket.feedbackRating)}
                onClick={() => onFinishTrip(ticket.id)}
                title={
                  !ticket.boardedAt
                    ? "پس از اسکن راننده فعال می‌شود"
                    : undefined
                }
              >
                {ticket.feedbackRating
                  ? "امتیاز شما: " +
                    formatAmountFa(ticket.feedbackRating) +
                    " از ۵"
                  : "ثبت نظر سفر"}
              </Button>
            </div>
            {ticket.feedbackComment && (
              <p className="student-field-hint">{ticket.feedbackComment}</p>
            )}
          </article>
        ))
      )}
      <BottomSheet
        open={Boolean(selectedTicket)}
        onClose={() => setSelectedTicket(null)}
        title="نمایش بلیت و QR"
        className="student-qr-sheet"
        presentation="document"
      >
        {selectedTicket && (
          <TicketDocument
            ticket={selectedTicket}
            onBack={() => setSelectedTicket(null)}
            onDownload={download}
            downloading={downloading}
            onRate={() => {
              setSelectedTicket(null);
              onFinishTrip(selectedTicket.id);
            }}
          />
        )}
      </BottomSheet>
    </StudentPage>
  );
};
export default TicketsView;
