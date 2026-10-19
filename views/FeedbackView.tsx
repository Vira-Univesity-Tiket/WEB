import React, { useEffect, useMemo, useState } from 'react';
import { Icons } from '../components/Icons';
import { UserIdea } from '../types';
import { createIdea, deleteMyIdea, listMyIdeas, updateMyIdea } from '../services/apiService';

const statusLabelFa = (status: UserIdea['status']) => {
  switch (status) {
    case 'submitted': return 'ثبت شده';
    case 'reviewing': return 'درحال بررسی';
    case 'approved': return 'تایید شده';
    case 'rejected': return 'رد شده';
    case 'done': return 'انجام شد';
    default: return status;
  }
};

const statusBadgeClass = (status: UserIdea['status']) => {
  switch (status) {
    case 'submitted': return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-900';
    case 'reviewing': return 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900';
    case 'approved': return 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300 border-green-200 dark:border-green-900';
    case 'rejected': return 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-200 dark:border-red-900';
    case 'done': return 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-900';
    default: return 'bg-gray-50 text-gray-700 dark:bg-slate-900 dark:text-gray-300 border-gray-200 dark:border-slate-700';
  }
};

interface FeedbackViewProps {
  onBack: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const FeedbackView: React.FC<FeedbackViewProps> = ({ onBack, showToast }) => {
  const [tab, setTab] = useState<'list' | 'new'>('list');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ideas, setIdeas] = useState<UserIdea[]>([]);
  const [error, setError] = useState<string>('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  const [editing, setEditing] = useState<UserIdea | null>(null);

  const canEdit = useMemo(() => (idea: UserIdea) => idea.status === 'submitted', []);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setCategory('');
    setEditing(null);
  };

  const loadIdeas = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listMyIdeas({ page: 1, pageSize: 50 });
      setIdeas(Array.isArray(result.items) ? result.items : []);
    } catch (e: any) {
      setError(e?.message || 'دریافت اطلاعات ناموفق بود');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIdeas();
  }, []);

  const validateForm = () => {
    if (!title.trim()) return 'عنوان ایده الزامی است.';
    if (title.trim().length < 5) return 'عنوان ایده باید حداقل ۵ کاراکتر باشد.';
    if (!description.trim()) return 'توضیحات ایده الزامی است.';
    if (description.trim().length < 15) return 'توضیحات ایده باید حداقل ۱۵ کاراکتر باشد.';
    return '';
  };

  const submit = async () => {
    const validationError = validateForm();
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = { title: title.trim(), description: description.trim(), category: category.trim() || undefined };
      if (editing) {
        await updateMyIdea(editing.id, payload);
        showToast('ایده ویرایش شد', 'success');
      } else {
        await createIdea(payload);
        showToast('ایده ثبت شد', 'success');
      }
      resetForm();
      setTab('list');
      await loadIdeas();
    } catch (e: any) {
      showToast(e?.message || 'عملیات ناموفق بود', 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (idea: UserIdea) => {
    setEditing(idea);
    setTitle(idea.title || '');
    setDescription(idea.description || '');
    setCategory(idea.category || '');
    setTab('new');
  };

  const remove = async (idea: UserIdea) => {
    if (!canEdit(idea)) {
      showToast('این ایده قابل حذف نیست.', 'error');
      return;
    }
    if (!confirm('آیا از حذف این ایده مطمئن هستید؟')) return;
    try {
      await deleteMyIdea(idea.id);
      showToast('ایده حذف شد', 'success');
      await loadIdeas();
    } catch (e: any) {
      showToast(e?.message || 'حذف ناموفق بود', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-slate-950 font-sans transition-colors duration-200" dir="rtl">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 p-4 flex items-center justify-between shadow-sm sticky top-0 z-10 border-b dark:border-slate-800 flex-none">
        <div className="flex items-center gap-3">
          <button aria-label="بازگشت به خانه" onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <Icons.ArrowRight size={24} className="text-gray-700 dark:text-gray-200" />
          </button>
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">ثبت ایده و نظرات</h2>
        </div>
        <button
          onClick={loadIdeas}
          className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors ${loading ? 'animate-spin' : ''}`}
          title="بروزرسانی"
        >
          <Icons.RefreshCw size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
      </div>

      <div className="flex-none px-4 pt-4">
        <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setTab('list')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${tab === 'list' ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400'}`}
          >
            ایده‌های من
          </button>
          <button
            onClick={() => { resetForm(); setTab('new'); }}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${tab === 'new' ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400'}`}
          >
            {editing ? 'ویرایش' : 'ثبت جدید'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {tab === 'new' ? (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="font-black text-gray-800 dark:text-white">{editing ? 'ویرایش ایده' : 'ثبت ایده جدید'}</div>
              {editing && (
                <button onClick={() => { resetForm(); }} className="text-xs font-bold text-gray-500 hover:text-gray-700 dark:text-gray-400">
                  انصراف
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">عنوان</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 120))}
                  className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 dark:text-white outline-none focus:border-vira-primary"
                  placeholder="مثلاً: پیشنهاد برای بهبود سرویس‌ها"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">دسته‌بندی (اختیاری)</label>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value.slice(0, 60))}
                  className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 dark:text-white outline-none focus:border-vira-primary"
                  placeholder="مثلاً: سرویس، کیف پول، اپلیکیشن"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">توضیحات</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 3000))}
                  className="w-full min-h-[140px] bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-gray-800 dark:text-white outline-none focus:border-vira-primary"
                  placeholder="مشکل یا پیشنهاد خود را کامل بنویسید..."
                />
                <div className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">{description.length.toLocaleString('fa-IR')} / ۳۰۰۰</div>
              </div>

              <button
                onClick={submit}
                disabled={saving}
                className={`w-full py-3 rounded-xl font-black text-sm text-white active:scale-95 transition-all ${
                  saving ? 'bg-gray-300 dark:bg-slate-700 cursor-not-allowed' : 'bg-vira-primary hover:bg-vira-secondary'
                }`}
              >
                {saving ? 'در حال ارسال...' : (editing ? 'ذخیره تغییرات' : 'ثبت ایده')}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {loading ? (
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 p-6 flex items-center gap-3 text-gray-600 dark:text-gray-300">
                <div className="w-5 h-5 border-2 border-vira-primary border-t-transparent rounded-full animate-spin"></div>
                در حال دریافت...
              </div>
            ) : error ? (
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-red-200 dark:border-red-900 p-6 text-red-600 dark:text-red-300">
                {error}
              </div>
            ) : ideas.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 mx-auto flex items-center justify-center text-gray-500 dark:text-gray-300">
                  <Icons.MessageSquare size={26} />
                </div>
                <div className="mt-4 font-black text-gray-800 dark:text-white">هنوز ایده‌ای ثبت نکرده‌اید</div>
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-5">
                  پیشنهادها و مشکلاتتان را ثبت کنید تا بررسی شود.
                </div>
                <button
                  onClick={() => { resetForm(); setTab('new'); }}
                  className="mt-5 inline-flex items-center gap-2 bg-vira-primary text-white px-4 py-2 rounded-xl font-bold text-sm active:scale-95 transition-all"
                >
                  <Icons.PlusSquare size={18} />
                  ثبت ایده
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {ideas.map((idea) => (
                  <div key={idea.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-sm p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-black text-gray-900 dark:text-white text-sm truncate">{idea.title}</div>
                        <div className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
                          {new Date(idea.createdAt).toLocaleDateString('fa-IR')} · {new Date(idea.updatedAt).toLocaleDateString('fa-IR')}
                        </div>
                      </div>
                      <span className={`shrink-0 text-[10px] font-black px-2 py-1 rounded-full border ${statusBadgeClass(idea.status)}`}>
                        {statusLabelFa(idea.status)}
                      </span>
                    </div>

                    <div className="mt-3 text-xs text-gray-600 dark:text-gray-300 leading-6 whitespace-pre-wrap">
                      {idea.description}
                    </div>

                    {!!idea.adminResponse && (
                      <div className="mt-4 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-4">
                        <div className="text-xs font-black text-gray-800 dark:text-white mb-1">پاسخ ادمین</div>
                        <div className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-6">{idea.adminResponse}</div>
                      </div>
                    )}

                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-[11px] text-gray-600 dark:text-gray-400">
                        {idea.category ? `دسته‌بندی: ${idea.category}` : 'بدون دسته‌بندی'}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEdit(idea)}
                          disabled={!canEdit(idea)}
                          className={`px-3 py-2 rounded-xl text-xs font-black border transition-colors ${
                            canEdit(idea)
                              ? 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800'
                              : 'bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          ویرایش
                        </button>
                        <button
                          onClick={() => remove(idea)}
                          disabled={!canEdit(idea)}
                          className={`px-3 py-2 rounded-xl text-xs font-black border transition-colors ${
                            canEdit(idea)
                              ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 hover:bg-red-100'
                              : 'bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                    {!canEdit(idea) && (
                      <div className="mt-3 text-[11px] text-gray-600 dark:text-gray-400">
                        پس از شروع بررسی، امکان ویرایش/حذف وجود ندارد.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedbackView;

