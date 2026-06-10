import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '../components/Icons';
import {
  createSupportTicket,
  getSupportTicketDetail,
  listSupportTickets,
  replySupportTicket,
  supportAttachmentDownloadUrl,
  supportTicketTxtUrl,
  downloadAuthenticatedFile
} from '../services/apiService';
import type { SupportTicketDetail, SupportTicketListItem, SupportTicketStatus } from '../types';
import { toEnglishDigits } from '../utils/numberUtils';

interface SupportViewProps {
  onBack: () => void;
}

const statusMeta: Record<SupportTicketStatus, { label: string; cls: string }> = {
  open: { label: 'باز', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  in_progress: { label: 'درحال بررسی', cls: 'bg-amber-50 text-amber-700 border-amber-100' },
  answered: { label: 'پاسخ داده شده', cls: 'bg-blue-50 text-blue-700 border-blue-100' },
  closed: { label: 'بسته شده', cls: 'bg-gray-100 text-gray-600 border-gray-200' }
};

const canUploadMime = (mime: string) => ['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain'].includes(mime);

const SupportView: React.FC<SupportViewProps> = ({ onBack }) => {
  const [tab, setTab] = useState<'active' | 'closed'>('active');
  const [mode, setMode] = useState<'list' | 'detail' | 'create'>('list');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [tickets, setTickets] = useState<SupportTicketListItem[]>([]);
  const [selected, setSelected] = useState<SupportTicketDetail | null>(null);

  // Create form
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [files, setFiles] = useState<{ name: string; dataUrl: string }[]>([]);

  // Reply form
  const [reply, setReply] = useState('');
  const [replyFiles, setReplyFiles] = useState<{ name: string; dataUrl: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadTickets = async () => {
    setLoading(true);
    setMessage('');
    try {
      const data = await listSupportTickets(tab);
      setTickets(data);
    } catch (e: any) {
      setMessage(e?.message || 'دریافت تیکت‌ها ناموفق بود');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === 'list') loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, mode]);

  const openTicket = async (id: string) => {
    setLoading(true);
    setMessage('');
    try {
      const data = await getSupportTicketDetail(id);
      setSelected(data);
      setMode('detail');
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (e: any) {
      setMessage(e?.message || 'دریافت تیکت ناموفق بود');
    } finally {
      setLoading(false);
    }
  };

  const readFiles = async (fileList: FileList, set: React.Dispatch<React.SetStateAction<{ name: string; dataUrl: string }[]>>) => {
    const arr = Array.from(fileList).slice(0, 5);
    const results: { name: string; dataUrl: string }[] = [];

    for (const f of arr) {
      if (f.size > 5 * 1024 * 1024) {
        setMessage('حجم هر فایل باید کمتر از ۵ مگابایت باشد.');
        continue;
      }
      if (!canUploadMime(f.type)) {
        setMessage('فرمت فایل مجاز نیست. (png/jpg/webp/pdf/txt)');
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('file read failed'));
        reader.readAsDataURL(f);
      });
      results.push({ name: f.name, dataUrl });
    }
    set((prev) => [...prev, ...results].slice(0, 5));
  };

  const removeFile = (idx: number, set: React.Dispatch<React.SetStateAction<any[]>>) => {
    set((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleDownload = async (url: string, fallbackFilename: string) => {
    setMessage('');
    try {
      await downloadAuthenticatedFile(url, fallbackFilename);
    } catch (e: any) {
      setMessage(e?.message || 'دانلود فایل ناموفق بود');
    }
  };

  const submitTicket = async () => {
    setLoading(true);
    setMessage('');
    try {
      const t = title.trim();
      const d = desc.trim();
      if (!t || !d) {
        setMessage('عنوان و توضیحات الزامی است.');
        return;
      }
      const created = await createSupportTicket({ title: t, message: d, attachments: files });
      setTitle('');
      setDesc('');
      setFiles([]);
      setMessage('تیکت با موفقیت ثبت شد.');
      setMode('list');
      await openTicket(created.ticket.id);
    } catch (e: any) {
      setMessage(e?.message || 'ثبت تیکت ناموفق بود');
    } finally {
      setLoading(false);
    }
  };

  const submitReply = async () => {
    if (!selected) return;
    setLoading(true);
    setMessage('');
    try {
      const text = reply.trim();
      if (!text) {
        setMessage('متن پیام الزامی است.');
        return;
      }
      await replySupportTicket(selected.id, { message: text, attachments: replyFiles });
      setReply('');
      setReplyFiles([]);
      await openTicket(selected.id);
    } catch (e: any) {
      setMessage(e?.message || 'ارسال پیام ناموفق بود');
    } finally {
      setLoading(false);
    }
  };

  const headerTitle = mode === 'create' ? 'ثبت تیکت جدید' : mode === 'detail' ? 'جزئیات تیکت' : 'پشتیبانی (تیکت)';

  const canReply = selected && selected.status !== 'closed';

  const listEmptyText = tab === 'active' ? 'تیکت فعالی ندارید.' : 'تیکت بسته‌شده‌ای ندارید.';

  const ticketBadge = (status: SupportTicketStatus) => (
    <span className={`text-[10px] px-2 py-1 rounded-lg border font-bold ${statusMeta[status].cls}`}>
      {statusMeta[status].label}
    </span>
  );

  const topActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        {mode !== 'create' && (
          <button
            onClick={() => { setMode('create'); setMessage(''); }}
            className="px-3 py-2 rounded-xl bg-vira-primary text-white text-xs font-bold shadow-sm active:scale-95 transition-transform"
          >
            <span className="flex items-center gap-2">
              <Icons.Plus size={16} />
              تیکت جدید
            </span>
          </button>
        )}
      </div>
    ),
    [mode]
  );

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-slate-950 font-sans transition-colors duration-200" dir="rtl">
      <div className="bg-white dark:bg-slate-900 p-4 flex items-center justify-between shadow-sm sticky top-0 z-20 border-b dark:border-slate-800 flex-none">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (mode === 'detail' || mode === 'create') { setMode('list'); setSelected(null); return; }
              onBack();
            }}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800"
          >
            <Icons.ArrowRight size={24} className="text-gray-700 dark:text-gray-200" />
          </button>
          <div className="flex flex-col">
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">{headerTitle}</h2>
            {mode === 'detail' && selected && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-gray-400 font-bold">#{toEnglishDigits(selected.id)}</span>
                {ticketBadge(selected.status)}
              </div>
            )}
          </div>
        </div>
        {topActions}
      </div>

      {message && (
        <div className="px-4 pt-3">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-3 text-sm text-gray-700 dark:text-gray-200 flex items-start gap-2">
            <Icons.Info size={18} className="text-blue-500 mt-0.5 shrink-0" />
            <div className="leading-6">{message}</div>
          </div>
        </div>
      )}

      {mode === 'list' && (
        <div className="flex-1 overflow-y-auto p-4 pb-24">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setTab('active')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${tab === 'active' ? 'bg-vira-primary text-white border-vira-primary' : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-200 border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
            >
              تیکت‌های فعال
            </button>
            <button
              onClick={() => setTab('closed')}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${tab === 'closed' ? 'bg-vira-primary text-white border-vira-primary' : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-200 border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
            >
              تیکت‌های بسته‌شده
            </button>
          </div>

          {loading ? (
            <div className="py-10 text-center text-gray-400">
              <div className="inline-block w-8 h-8 border-4 border-vira-primary border-t-transparent rounded-full animate-spin mb-3" />
              <div className="text-sm font-bold">در حال دریافت...</div>
            </div>
          ) : tickets.length === 0 ? (
            <div className="py-14 text-center bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800">
              <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-400">
                <Icons.Headset size={28} />
              </div>
              <div className="text-sm font-bold text-gray-600 dark:text-gray-200">{listEmptyText}</div>
              <div className="text-xs text-gray-400 mt-1">برای شروع، یک تیکت جدید ثبت کنید.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => openTicket(t.id)}
                  className="w-full text-right bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-black text-gray-800 dark:text-white text-sm">{t.title}</div>
                      <div className="text-[11px] text-gray-400 mt-1">
                        ثبت: {new Date(t.createdAt).toLocaleString('fa-IR')}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {ticketBadge(t.status)}
                      <span className="text-[11px] text-gray-400 font-bold">#{toEnglishDigits(t.id)}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'create' && (
        <div className="flex-1 overflow-y-auto p-4 pb-28">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500">عنوان تیکت</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-4 text-sm font-bold outline-none focus:border-vira-primary"
                placeholder="مثال: مشکل در رزرو سرویس"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500">توضیحات</label>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={5}
                className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-4 text-sm outline-none focus:border-vira-primary leading-7"
                placeholder="شرح کامل مشکل را بنویسید..."
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-500">فایل‌های ضمیمه (اختیاری)</label>
                <span className="text-[10px] text-gray-400">حداکثر ۵ فایل، هر فایل ۵MB</span>
              </div>
              <input
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.webp,.pdf,.txt"
                onChange={(e) => e.target.files && readFiles(e.target.files, setFiles)}
                className="w-full text-xs"
              />
              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((f, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl px-4 py-3">
                      <div className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">{f.name}</div>
                      <button onClick={() => removeFile(idx, setFiles)} className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-500">
                        <Icons.X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              disabled={loading}
              onClick={submitTicket}
              className="w-full bg-vira-primary text-white py-3.5 rounded-2xl font-black shadow-lg shadow-vira-accent/40 active:scale-95 transition-transform disabled:opacity-60"
            >
              {loading ? 'در حال ثبت...' : 'ثبت تیکت'}
            </button>
          </div>
        </div>
      )}

      {mode === 'detail' && selected && (
        <div className="flex-1 overflow-y-auto p-4 pb-28">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-4 pb-4 border-b border-dashed border-gray-200 dark:border-slate-800">
              <div className="flex-1">
                <div className="font-black text-gray-800 dark:text-white">{selected.title}</div>
                <div className="text-xs text-gray-400 mt-1">کاربر: {selected.user.name} ({toEnglishDigits(selected.user.studentId)})</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                {ticketBadge(selected.status)}
                <button
                  type="button"
                  onClick={() => handleDownload(supportTicketTxtUrl(selected.id), `ticket-${selected.id}.txt`)}
                  className="text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300 px-3 py-2 rounded-xl"
                >
                  دانلود TXT
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {selected.messages.map((m) => (
                <div key={m.id} className={`flex ${m.senderRole === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[92%] rounded-2xl p-4 text-sm leading-7 border shadow-sm ${
                    m.senderRole === 'user'
                      ? 'bg-vira-primary text-white border-vira-primary/20 rounded-br-none'
                      : 'bg-gray-50 dark:bg-slate-800 text-gray-800 dark:text-gray-100 border-gray-200 dark:border-slate-700 rounded-bl-none'
                  }`}>
                    <div className="text-[10px] opacity-80 font-bold mb-2 flex items-center justify-between gap-3">
                      <span>{m.senderRole === 'user' ? 'شما' : 'پشتیبانی'}</span>
                      <span>{new Date(m.createdAt).toLocaleString('fa-IR')}</span>
                    </div>
                    <div className="whitespace-pre-line">{m.message}</div>
                    {m.attachments?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-dashed border-white/30">
                        <div className="text-[10px] font-black mb-2 opacity-90">ضمیمه‌ها</div>
                        <div className="space-y-2">
                          {m.attachments.map((a) => (
                            <button
                              type="button"
                              key={a.id}
                              onClick={() => handleDownload(supportAttachmentDownloadUrl(a.id), a.originalName || `attachment-${a.id}`)}
                              className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border ${
                                m.senderRole === 'user'
                                  ? 'bg-white/10 border-white/20'
                                  : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Icons.Download size={16} className={m.senderRole === 'user' ? 'text-white' : 'text-gray-500'} />
                                <span className={`text-xs font-bold truncate ${m.senderRole === 'user' ? 'text-white' : 'text-gray-700 dark:text-gray-200'}`}>
                                  {a.originalName}
                                </span>
                              </div>
                              <span className={`text-[10px] opacity-80 shrink-0 ${m.senderRole === 'user' ? 'text-white' : 'text-gray-400'}`}>
                                {Math.round((a.sizeBytes || 0) / 1024)} KB
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>

          {canReply && (
            <div className="fixed bottom-0 left-0 right-0 z-20 bg-white dark:bg-slate-900 border-t dark:border-slate-800 p-4">
              <div className="max-w-2xl mx-auto space-y-2">
                <div className="flex gap-2 items-end">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={2}
                    className="flex-1 bg-gray-100 dark:bg-slate-800 rounded-2xl px-4 py-3 text-sm outline-none text-gray-800 dark:text-white leading-7"
                    placeholder="پاسخ خود را بنویسید..."
                  />
                  <button
                    disabled={loading}
                    onClick={submitReply}
                    className="bg-vira-primary text-white px-4 py-3 rounded-2xl font-black shadow-sm active:scale-95 transition-transform disabled:opacity-60"
                  >
                    ارسال
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <label className="text-[11px] text-gray-500 font-bold flex items-center gap-2 cursor-pointer">
                    <Icons.UploadCloud size={16} />
                    افزودن ضمیمه
                    <input
                      type="file"
                      multiple
                      accept=".png,.jpg,.jpeg,.webp,.pdf,.txt"
                      className="hidden"
                      onChange={(e) => e.target.files && readFiles(e.target.files, setReplyFiles)}
                    />
                  </label>
                  {replyFiles.length > 0 && (
                    <span className="text-[11px] text-gray-400">{replyFiles.length} فایل انتخاب شد</span>
                  )}
                </div>

                {replyFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {replyFiles.map((f, idx) => (
                      <button
                        key={idx}
                        onClick={() => removeFile(idx, setReplyFiles)}
                        className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-xs font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2"
                      >
                        <Icons.X size={14} />
                        <span className="max-w-[160px] truncate">{f.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!canReply && (
            <div className="fixed bottom-0 left-0 right-0 z-20 bg-white dark:bg-slate-900 border-t dark:border-slate-800 p-4">
              <div className="max-w-2xl mx-auto text-center text-sm font-bold text-gray-500">
                این تیکت بسته شده است.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SupportView;
