import React, { useEffect, useRef, useState } from "react";
import { Icons } from "../components/Icons";
import { UserIdea } from "../types";
import {
  createIdea,
  deleteMyIdea,
  listMyIdeas,
  updateMyIdea,
} from "../services/apiService";
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
import { formatAmountFa } from "../utils/numberUtils";

const statusLabel: Record<UserIdea["status"], string> = {
  submitted: "ثبت شده",
  reviewing: "در حال بررسی",
  approved: "تأیید شده",
  rejected: "رد شده",
  done: "انجام شد",
};
interface FeedbackViewProps {
  onBack: () => void;
  showToast: (message: string, type: "success" | "error" | "info") => void;
}

const FeedbackView: React.FC<FeedbackViewProps> = ({ onBack, showToast }) => {
  const [tab, setTab] = useState<"list" | "new">("list");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const saveBusy = useRef(false);
  const deleteBusy = useRef(false);
  const requestId = useRef(0);
  const [ideas, setIdeas] = useState<UserIdea[]>([]);
  const [listError, setListError] = useState("");
  const [formError, setFormError] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<UserIdea | null>(null);
  const [touched, setTouched] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 50;
  const titleError =
    title.trim().length < 5 ? "عنوان ایده باید حداقل ۵ کاراکتر باشد." : "";
  const descriptionError =
    description.trim().length < 15
      ? "توضیحات ایده باید حداقل ۱۵ کاراکتر باشد."
      : "";
  const resetForm = () => {
    setTitle("");
    setDescription("");
    setCategory("");
    setEditing(null);
    setFormError("");
    setTouched(false);
  };
  const loadIdeas = async (target = page) => {
    const request = ++requestId.current;
    setLoading(true);
    setListError("");
    try {
      const result = await listMyIdeas({ page: target, pageSize });
      if (!Array.isArray(result.items) || !Number.isFinite(result.total))
        throw new Error("پاسخ فهرست ایده‌ها معتبر نیست.");
      if (request !== requestId.current) return;
      setIdeas(Array.isArray(result.items) ? result.items : []);
      setTotal(result.total);
      const last = Math.max(1, Math.ceil(result.total / pageSize));
      if (target > last) setPage(last);
    } catch (error) {
      if (request === requestId.current)
        setListError((error as Error).message || "دریافت ایده‌ها ناموفق بود.");
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  };
  useEffect(() => {
    void loadIdeas(page);
    return () => {
      requestId.current += 1;
    };
  }, [page]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    setFormError("");
    if (titleError || descriptionError || saveBusy.current) return;
    saveBusy.current = true;
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        category: category.trim() || undefined,
      };
      if (editing) await updateMyIdea(editing.id, payload);
      else await createIdea(payload);
      showToast(editing ? "ایده ویرایش شد" : "ایده ثبت شد", "success");
      resetForm();
      setTab("list");
      if (page !== 1) setPage(1);
      else await loadIdeas(1);
    } catch (error) {
      setFormError((error as Error).message || "ثبت ایده ناموفق بود.");
    } finally {
      saveBusy.current = false;
      setSaving(false);
    }
  };
  const startEdit = (idea: UserIdea) => {
    if (idea.status !== "submitted") return;
    setEditing(idea);
    setTitle(idea.title);
    setDescription(idea.description);
    setCategory(idea.category || "");
    setFormError("");
    setTouched(false);
    setTab("new");
  };
  const remove = async (idea: UserIdea) => {
    if (
      idea.status !== "submitted" ||
      deleteBusy.current ||
      !window.confirm("آیا از حذف این ایده مطمئن هستید؟")
    )
      return;
    deleteBusy.current = true;
    setDeleting(true);
    try {
      await deleteMyIdea(idea.id);
      showToast("ایده حذف شد", "success");
      await loadIdeas();
    } catch (error) {
      setListError((error as Error).message || "حذف ایده ناموفق بود.");
    } finally {
      deleteBusy.current = false;
      setDeleting(false);
    }
  };

  return (
    <StudentPage
      header={
        <PageHeader
          title="ثبت ایده و نظرات"
          onBack={onBack}
          action={
            <IconButton
              aria-label="تازه‌سازی ایده‌ها"
              onClick={() => {
                void loadIdeas();
              }}
              disabled={loading || saving}
            >
              <Icons.RefreshCw
                size={25}
                className={loading ? "animate-spin" : ""}
              />
            </IconButton>
          }
        />
      }
    >
      <SegmentedTabs
        value={tab}
        disabled={saving}
        onChange={(next) => {
          if (!saving) setTab(next);
        }}
        label="ایده‌ها"
        options={[
          { value: "list", label: "ایده‌های من" },
          { value: "new", label: editing ? "ویرایش" : "ثبت جدید" },
        ]}
      />
      {tab === "new" ? (
        <section className="student-card">
          <div className="student-section-heading student-form-heading">
            <h2>{editing ? "ویرایش ایده" : "ثبت ایده جدید"}</h2>
            {editing && (
              <Button variant="outline" disabled={saving} onClick={resetForm}>
                انصراف از ویرایش
              </Button>
            )}
          </div>
          <form className="student-form" onSubmit={submit} noValidate>
            <Field
              id="idea-title"
              label="عنوان"
              error={touched ? titleError : ""}
            >
              <input
                id="idea-title"
                className="student-input"
                placeholder="مثلاً: پیشنهاد برای بهبود سرویس‌ها"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                required
                disabled={saving}
                aria-invalid={touched && Boolean(titleError)}
                aria-describedby={
                  touched && titleError ? "idea-title-error" : undefined
                }
              />
            </Field>
            <Field id="idea-category" label="دسته‌بندی (اختیاری)">
              <input
                id="idea-category"
                className="student-input"
                placeholder="مثلاً: سرویس، کیف پول، اپلیکیشن"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                maxLength={60}
                disabled={saving}
              />
            </Field>
            <Field
              id="idea-description"
              label="توضیحات"
              error={touched ? descriptionError : ""}
            >
              <textarea
                id="idea-description"
                className="student-input"
                placeholder="مشکل یا پیشنهاد خود را کامل بنویسید…"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={3000}
                rows={6}
                required
                disabled={saving}
                aria-invalid={touched && Boolean(descriptionError)}
                aria-describedby={
                  touched && descriptionError
                    ? "idea-description-error idea-counter"
                    : "idea-counter"
                }
              />
            </Field>
            <p className="student-counter" id="idea-counter">
              {formatAmountFa(description.length)} از ۳۰۰۰
            </p>
            {formError && <StatusMessage error={formError} />}
            <Button
              type="submit"
              className="student-button-block"
              pending={saving}
              disabled={saving}
            >
              {saving ? "در حال ثبت…" : editing ? "ذخیره تغییرات" : "ثبت ایده"}
            </Button>
          </form>
        </section>
      ) : loading ? (
        <StatusMessage loading>در حال دریافت ایده‌ها…</StatusMessage>
      ) : listError ? (
        <StatusMessage
          error={listError}
          onRetry={() => {
            void loadIdeas();
          }}
        />
      ) : ideas.length === 0 ? (
        <EmptyState
          illustration="ideas"
          title="هنوز ایده‌ای ثبت نکرده‌اید"
          description="پیشنهادها و مشکلاتتان را ثبت کنید تا بررسی شود."
          action={
            <Button
              onClick={() => {
                resetForm();
                setTab("new");
              }}
            >
              <Icons.PlusSquare size={24} aria-hidden="true" />
              ثبت ایده
            </Button>
          }
        />
      ) : (
        <>
          {ideas.map((idea) => (
            <article key={idea.id} className="student-card student-idea-card">
              <div className="student-idea-meta">
                <span>
                  {new Date(idea.createdAt).toLocaleDateString("fa-IR")}
                </span>
                <span className="student-badge" data-status={idea.status}>
                  {statusLabel[idea.status]}
                </span>
              </div>
              <h2>{idea.title}</h2>
              <p>{idea.description}</p>
              {idea.adminResponse && (
                <section className="student-idea-response">
                  <strong>پاسخ مدیریت</strong>
                  <p>{idea.adminResponse}</p>
                </section>
              )}
              <div className="student-idea-meta">
                <span>
                  {idea.category
                    ? "دسته‌بندی: " + idea.category
                    : "بدون دسته‌بندی"}
                </span>
                <span>
                  به‌روزرسانی:{" "}
                  {new Date(idea.updatedAt).toLocaleDateString("fa-IR")}
                </span>
              </div>
              <div className="student-idea-actions">
                <Button
                  variant="outline"
                  onClick={() => startEdit(idea)}
                  disabled={idea.status !== "submitted" || deleting}
                >
                  ویرایش
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    void remove(idea);
                  }}
                  disabled={idea.status !== "submitted" || deleting}
                >
                  حذف
                </Button>
              </div>
              {idea.status !== "submitted" && (
                <p className="student-field-hint">
                  پس از شروع بررسی، امکان ویرایش یا حذف وجود ندارد.
                </p>
              )}
            </article>
          ))}
          {total > pageSize && (
            <div className="student-pagination">
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((previous) => previous - 1)}
              >
                قبلی
              </Button>
              <span>
                صفحه {formatAmountFa(page)} از{" "}
                {formatAmountFa(Math.ceil(total / pageSize))}
              </span>
              <Button
                variant="outline"
                disabled={page * pageSize >= total}
                onClick={() => setPage((previous) => previous + 1)}
              >
                بعدی
              </Button>
            </div>
          )}
        </>
      )}
    </StudentPage>
  );
};
export default FeedbackView;
