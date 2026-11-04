import React, { useEffect, useRef, useState } from "react";
import { Icons } from "../components/Icons";
import {
  createSupportTicket,
  getSupportTicketDetail,
  listSupportTickets,
  replySupportTicket,
  supportAttachmentDownloadUrl,
  supportTicketTxtUrl,
  downloadAuthenticatedFile,
} from "../services/apiService";
import type {
  SupportTicketDetail,
  SupportTicketListItem,
  SupportTicketStatus,
} from "../types";
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  PageHeader,
  SegmentedTabs,
  StatusMessage,
  StudentPage,
} from "../components/student/StudentUI";
import AttachmentPicker from "../components/student/AttachmentPicker";
import {
  StudentAttachment,
  supportAttachmentPayload,
} from "../utils/studentAttachments";
import { formatAmountFa } from "../utils/numberUtils";

interface SupportViewProps {
  onBack: () => void;
  onMessages?: () => void;
}
const statuses: Record<SupportTicketStatus, string> = {
  open: "باز",
  in_progress: "در حال بررسی",
  answered: "پاسخ داده شده",
  closed: "بسته شده",
};

const SupportView: React.FC<SupportViewProps> = ({ onBack, onMessages }) => {
  const [tab, setTab] = useState<"active" | "closed">("active");
  const [mode, setMode] = useState<"list" | "create" | "detail">("list");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [readingFiles, setReadingFiles] = useState(false);
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [tickets, setTickets] = useState<SupportTicketListItem[]>([]);
  const [selected, setSelected] = useState<SupportTicketDetail | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<StudentAttachment[]>([]);
  const [reply, setReply] = useState("");
  const [replyFiles, setReplyFiles] = useState<StudentAttachment[]>([]);
  const [touched, setTouched] = useState(false);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const lastTicketId = useRef("");
  const saveBusy = useRef(false);
  const mounted = useRef(true);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      listRequest.current += 1;
      detailRequest.current += 1;
    };
  }, []);
  const loadTickets = async () => {
    const request = ++listRequest.current;
    setLoading(true);
    setListError("");
    try {
      const data = await listSupportTickets(tab);
      if (!Array.isArray(data))
        throw new Error("پاسخ فهرست تیکت‌ها معتبر نیست.");
      if (request === listRequest.current && mounted.current) setTickets(data);
    } catch (error) {
      if (request === listRequest.current && mounted.current)
        setListError((error as Error).message || "دریافت تیکت‌ها ناموفق بود.");
    } finally {
      if (request === listRequest.current && mounted.current) setLoading(false);
    }
  };
  useEffect(() => {
    if (mode === "list") void loadTickets();
    return () => {
      listRequest.current += 1;
    };
  }, [tab, mode]);
  const openTicket = async (id: string) => {
    const request = ++detailRequest.current;
    lastTicketId.current = id;
    setLoading(true);
    setDetailError("");
    setMode("detail");
    try {
      const data = await getSupportTicketDetail(id);
      if (request === detailRequest.current && mounted.current)
        setSelected(data);
    } catch (error) {
      if (request === detailRequest.current && mounted.current)
        setDetailError((error as Error).message || "دریافت جزئیات ناموفق بود.");
    } finally {
      if (request === detailRequest.current && mounted.current)
        setLoading(false);
    }
  };
  useEffect(() => {
    if (mode === "detail" && selected)
      bottom.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "nearest",
      });
  }, [selected, mode]);
  const back = () => {
    if (saveBusy.current) return;
    if (mode === "list") {
      onBack();
      return;
    }
    detailRequest.current += 1;
    setMode("list");
    setSelected(null);
    setDetailError("");
    setFormError("");
    setNotice("");
  };
  const submitTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    setFormError("");
    if (
      !title.trim() ||
      !description.trim() ||
      saveBusy.current ||
      readingFiles
    )
      return;
    saveBusy.current = true;
    setSaving(true);
    try {
      const result = await createSupportTicket({
        title: title.trim(),
        message: description.trim(),
        attachments: supportAttachmentPayload(files),
      });
      if (!mounted.current) return;
      setTitle("");
      setDescription("");
      setFiles([]);
      setTouched(false);
      setNotice("تیکت با موفقیت ثبت شد.");
      await openTicket(result.ticket.id);
    } catch (error) {
      if (mounted.current)
        setFormError((error as Error).message || "ثبت تیکت ناموفق بود.");
    } finally {
      saveBusy.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const submitReply = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    if (!selected || saveBusy.current || readingFiles) return;
    if (!reply.trim()) {
      setFormError("متن پاسخ الزامی است.");
      return;
    }
    saveBusy.current = true;
    setSaving(true);
    try {
      await replySupportTicket(selected.id, {
        message: reply.trim(),
        attachments: supportAttachmentPayload(replyFiles),
      });
      if (!mounted.current) return;
      setReply("");
      setReplyFiles([]);
      setNotice("پیام شما ثبت شد.");
      await openTicket(selected.id);
    } catch (error) {
      if (mounted.current)
        setFormError((error as Error).message || "ارسال پاسخ ناموفق بود.");
    } finally {
      saveBusy.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const download = async (url: string, name: string) => {
    try {
      await downloadAuthenticatedFile(url, name);
    } catch (error) {
      if (mounted.current)
        setFormError((error as Error).message || "دانلود ناموفق بود.");
    }
  };
  const heading =
    mode === "create"
      ? "ثبت تیکت جدید"
      : mode === "detail"
        ? "جزئیات تیکت"
        : "پشتیبانی (تیکت)";
  const create = () => {
    if (saveBusy.current) return;
    detailRequest.current += 1;
    setMode("create");
    setNotice("");
    setFormError("");
  };
  const badge = (status: SupportTicketStatus) => (
    <span className="student-badge" data-status={status}>
      {statuses[status]}
    </span>
  );

  return (
    <StudentPage
      header={
        <PageHeader
          title={heading}
          onBack={back}
          backLabel={
            mode === "list" ? "بازگشت به خانه" : "بازگشت به فهرست تیکت‌ها"
          }
          backDisabled={saving}
          action={
            mode !== "create" ? (
              <Button onClick={create} disabled={saving}>
                <Icons.Plus size={20} aria-hidden="true" />
                تیکت جدید
              </Button>
            ) : onMessages ? (
              <IconButton
                className="student-header-action"
                aria-label="باز کردن راهنمای خودکار"
                onClick={onMessages}
              >
                <Icons.MessageSquare size={24} />
              </IconButton>
            ) : undefined
          }
        />
      }
    >
      {notice && <StatusMessage>{notice}</StatusMessage>}
      {mode === "list" && (
        <>
          <SegmentedTabs<"active" | "closed">
            label="وضعیت تیکت‌ها"
            value={tab}
            onChange={setTab}
            options={[
              { value: "active", label: "تیکت‌های فعال" },
              { value: "closed", label: "تیکت‌های بسته‌شده" },
            ]}
          />
          {loading ? (
            <StatusMessage loading>در حال دریافت تیکت‌ها…</StatusMessage>
          ) : listError ? (
            <StatusMessage
              error={listError}
              onRetry={() => {
                void loadTickets();
              }}
            />
          ) : tickets.length === 0 ? (
            <EmptyState
              illustration="support"
              title={
                tab === "active"
                  ? "تیکت فعالی ندارید"
                  : "تیکت بسته‌شده‌ای ندارید"
              }
              description="برای شروع، یک تیکت جدید ثبت کنید."
              action={
                <Button className="student-button-block" onClick={create}>
                  ثبت تیکت جدید
                </Button>
              }
            />
          ) : (
            <div className="student-support-list">
              {tickets.map((ticket) => (
                <button
                  type="button"
                  className="student-card student-support-card"
                  key={ticket.id}
                  onClick={() => {
                    setSelected(null);
                    setNotice("");
                    void openTicket(ticket.id);
                  }}
                >
                  <div className="student-support-card-heading">
                    <h2>{ticket.title}</h2>
                    {badge(ticket.status)}
                  </div>
                  <small>
                    شماره <bdi>{ticket.id}</bdi> ·{" "}
                    {new Date(ticket.createdAt).toLocaleString("fa-IR")}
                  </small>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {mode === "create" && (
        <form
          className="student-card student-form"
          onSubmit={submitTicket}
          noValidate
        >
          <Field
            id="support-title"
            label="عنوان تیکت"
            error={touched && !title.trim() ? "عنوان تیکت الزامی است." : ""}
          >
            <input
              id="support-title"
              className="student-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={80}
              placeholder="مثال: مشکل در رزرو سرویس"
              required
              disabled={saving}
              aria-invalid={touched && !title.trim()}
              aria-describedby={
                touched && !title.trim() ? "support-title-error" : undefined
              }
            />
          </Field>
          <Field
            id="support-description"
            label="توضیحات"
            error={touched && !description.trim() ? "توضیحات الزامی است." : ""}
          >
            <textarea
              id="support-description"
              className="student-input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={4000}
              rows={7}
              placeholder="شرح کامل مشکل را بنویسید…"
              required
              disabled={saving}
              aria-invalid={touched && !description.trim()}
              aria-describedby={
                touched && !description.trim()
                  ? "support-description-error"
                  : undefined
              }
            />
          </Field>
          <AttachmentPicker
            id="support-files"
            value={files}
            onChange={setFiles}
            onError={setFormError}
            onReadingChange={setReadingFiles}
            disabled={saving}
          />
          {formError && <StatusMessage error={formError} />}
          <Button
            type="submit"
            className="student-button-block"
            pending={saving}
            disabled={saving || readingFiles}
          >
            {saving ? "در حال ثبت…" : "ثبت تیکت"}
          </Button>
        </form>
      )}
      {mode === "detail" && (
        <>
          {loading && (
            <StatusMessage loading>در حال دریافت جزئیات…</StatusMessage>
          )}
          {detailError && (
            <StatusMessage
              error={detailError}
              onRetry={() => {
                void openTicket(lastTicketId.current);
              }}
            />
          )}
          {selected && (
            <>
              <section className="student-card">
                <div className="student-conversation-meta">
                  {badge(selected.status)}
                  <Button
                    variant="outline"
                    onClick={() => {
                      void download(
                        supportTicketTxtUrl(selected.id),
                        "ticket-" + selected.id + ".txt",
                      );
                    }}
                  >
                    دانلود TXT
                  </Button>
                </div>
                <h2 className="student-detail-title">{selected.title}</h2>
                <p className="student-field-hint">
                  کاربر: {selected.user.name} ·{" "}
                  <bdi>{selected.user.studentId}</bdi>
                </p>
                <div className="student-conversation">
                  {selected.messages.map((message) => (
                    <article
                      key={message.id}
                      className={
                        "student-message" +
                        (message.senderRole === "user"
                          ? " student-message-user"
                          : "")
                      }
                    >
                      <div className="student-message-meta">
                        <strong>
                          {message.senderRole === "user" ? "شما" : "پشتیبانی"}
                        </strong>
                        <span>
                          {new Date(message.createdAt).toLocaleString("fa-IR")}
                        </span>
                      </div>
                      <p>{message.message}</p>
                      {message.attachments.map((attachment) => (
                        <button
                          type="button"
                          className="student-message-download"
                          key={attachment.id}
                          onClick={() => {
                            void download(
                              supportAttachmentDownloadUrl(attachment.id),
                              attachment.originalName,
                            );
                          }}
                        >
                          <Icons.Download size={20} aria-hidden="true" />
                          <span>
                            {attachment.originalName} ·{" "}
                            {formatAmountFa(
                              Math.round(attachment.sizeBytes / 1024),
                            )}{" "}
                            کیلوبایت
                          </span>
                        </button>
                      ))}
                    </article>
                  ))}
                  <div ref={bottom} />
                </div>
              </section>
              {selected.status !== "closed" ? (
                <form
                  className="student-card student-form"
                  onSubmit={submitReply}
                  noValidate
                >
                  <Field id="support-reply" label="پاسخ شما">
                    <textarea
                      id="support-reply"
                      className="student-input"
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      rows={3}
                      maxLength={4000}
                      placeholder="پاسخ خود را بنویسید…"
                      required
                      disabled={saving}
                    />
                  </Field>
                  <AttachmentPicker
                    id="support-reply-files"
                    value={replyFiles}
                    onChange={setReplyFiles}
                    onError={setFormError}
                    onReadingChange={setReadingFiles}
                    disabled={saving}
                  />
                  {formError && <StatusMessage error={formError} />}
                  <Button
                    type="submit"
                    className="student-button-block"
                    pending={saving}
                    disabled={saving || readingFiles}
                  >
                    {saving ? "در حال ارسال…" : "ارسال پاسخ"}
                  </Button>
                </form>
              ) : (
                <>
                  <StatusMessage>این تیکت بسته شده است.</StatusMessage>
                  {formError && <StatusMessage error={formError} />}
                </>
              )}
            </>
          )}
        </>
      )}
    </StudentPage>
  );
};
export default SupportView;
