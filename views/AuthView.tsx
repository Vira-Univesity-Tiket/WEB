
import React, { useState } from 'react';
import { AuthStage } from '../types';
import { Icons } from '../components/Icons';
import { toEnglishDigits } from '../utils/numberUtils';
import { normalizePersianName, validateFullNameFa, validateNationalCodeFa, validateStudentIdFa } from '../utils/validationUtils';
import { getLegalContent } from '../services/apiService';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface AuthViewProps {
  authStage: AuthStage;
  onRegister: (name: string, studentId: string, nationalCode: string) => void | Promise<void>;
  onLogin: (studentId: string, nationalCode: string) => void | Promise<void>;
}

const AuthView: React.FC<AuthViewProps> = ({ authStage, onRegister, onLogin }) => {
  const [isLoginMode, setIsLoginMode] = useState(true); // Default to Login
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [nationalCode, setNationalCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLegal, setShowLegal] = useState(false);
  const legalDialog = useDialogFocus(showLegal, () => setShowLegal(false));
  const [legalContent, setLegalContent] = useState('در حال دریافت قوانین...');
  const [legalLoading, setLegalLoading] = useState(false);
  const [touched, setTouched] = useState<{ name: boolean; studentId: boolean; nationalCode: boolean }>({
    name: false,
    studentId: false,
    nationalCode: false
  });

  const nameCheck = validateFullNameFa(name);
  const studentCheck = validateStudentIdFa(studentId);
  const nationalCheck = validateNationalCodeFa(nationalCode);

  const canSubmit = isLoginMode
    ? studentCheck.ok && nationalCheck.ok
    : nameCheck.ok && studentCheck.ok && nationalCheck.ok;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedName = normalizePersianName(name);
    if (!isLoginMode) setName(normalizedName);
    setTouched({ name: true, studentId: true, nationalCode: true });
    if (isSubmitting || !canSubmit) return;
    setIsSubmitting(true);
    try {
      if (isLoginMode) {
        await Promise.resolve(onLogin(studentId, nationalCode));
      } else {
        await Promise.resolve(onRegister(normalizedName, studentId, nationalCode));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const openLegal = async () => {
    setShowLegal(true);
    setLegalLoading(true);
    try {
      const data = await getLegalContent('user');
      setLegalContent(data?.content || 'متنی برای قوانین ثبت نشده است.');
    } catch (error: any) {
      setLegalContent(error?.message || 'دریافت قوانین ناموفق بود.');
    } finally {
      setLegalLoading(false);
    }
  };

  // Determine Splash Logic
  const isSplash = authStage === AuthStage.SPLASH_START || authStage === AuthStage.SPLASH_CENTER;

  return (
    <div className="flex justify-center bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.14),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.12),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef6ff_100%)] dark:bg-gray-950 h-[100dvh] w-full font-sans transition-colors duration-300" dir="rtl">
      
      {/* Container simulating mobile app */}
      <div className="w-full max-w-md h-full relative overflow-hidden flex flex-col">
        
        {/* === SPLASH SCREEN LAYER === */}
        <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-700 ${isSplash ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'} bg-[linear-gradient(135deg,_#0f766e_0%,_#0369a1_55%,_#2563eb_100%)]`}>
           <div className={`bg-white/95 p-6 rounded-[28px] shadow-2xl transition-transform duration-1000 ${authStage === AuthStage.SPLASH_CENTER ? 'scale-100' : 'scale-50 translate-y-20 opacity-0'}`}>
              <img src="/logo/welcome.png" alt="Vira" className="w-24 h-24 object-contain" loading="eager" decoding="async" />
           </div>
           <h1 className="mt-3 max-w-[20rem] px-4 text-center text-[15px] font-black leading-7 tracking-tight text-white sm:text-[22px] sm:leading-tight">
             <span className="block">سامانه هوشمند حمل و نقل دانشگاهی</span>
             <span className="block">ویرا</span>
           </h1>
        </div>

        {/* === MAIN CONTENT LAYER === */}
        <div className={`flex-1 min-h-0 overflow-y-auto flex flex-col bg-white/80 dark:bg-slate-950 transition-all duration-700 ${isSplash ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}>
           
           {/* Top Header / Branding */}
           <div className="bg-[linear-gradient(180deg,_rgba(15,118,110,0.10)_0%,_rgba(14,165,233,0.06)_100%)] dark:bg-vira-primary/5 min-h-[200px] h-[30dvh] shrink-0 relative flex flex-col items-center justify-center rounded-b-[42px] px-6 border-b border-white/60">
              <div className="w-20 h-20 bg-white dark:bg-slate-900 rounded-[22px] flex items-center justify-center shadow-[0_18px_45px_rgba(14,165,233,0.18)] dark:shadow-none mb-2 border border-white/60">
                 <Icons.Bus className="text-vira-primary w-10 h-10" />
              </div>
              <h2 className="max-w-[20rem] text-center text-[20px] font-black leading-tight text-gray-800 dark:text-white sm:text-2xl">
                <span className="block">سامانه هوشمند حمل و نقل دانشگاهی</span>
                <span className="block">ویرا</span>
              </h2>
              <p className="mt-2 max-w-xs text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                 سامانه هوشمند حمل و نقل دانشگاهی
                 <br/>
                 سریع، هوشمند و مطمئن
              </p>
           </div>

           {/* Form Section */}
           <div className="flex-1 px-5 sm:px-8 -mt-4 pb-8">
              <div className="bg-white/90 dark:bg-slate-900 rounded-[30px] shadow-[0_18px_50px_rgba(15,23,42,0.08)] dark:shadow-none border border-white/70 dark:border-slate-800 p-6 backdrop-blur">
                 
                 {/* Tabs */}
                 <div className="flex bg-gray-100/90 dark:bg-slate-800 p-1.5 rounded-2xl mb-6">
                    <button 
                      onClick={() => setIsLoginMode(true)}
                      className={`flex-1 py-2.5 text-sm font-black rounded-xl transition-all ${isLoginMode ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-300'}`}
                    >
                      ورود
                    </button>
                    <button 
                      onClick={() => setIsLoginMode(false)}
                      className={`flex-1 py-2.5 text-sm font-black rounded-xl transition-all ${!isLoginMode ? 'bg-white dark:bg-slate-700 text-gray-800 dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-300'}`}
                    >
                      ثبت نام
                    </button>
                 </div>

                 <form onSubmit={handleSubmit} className="space-y-4">
                    {!isLoginMode && (
                        <div>
                          <div className={`bg-gray-50/90 dark:bg-slate-800 border rounded-2xl px-4 py-3 flex items-center gap-3 focus-within:border-vira-primary focus-within:bg-white dark:focus-within:bg-slate-900 transition-all ${
                            touched.name && !nameCheck.ok ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-slate-700'
                          }`}>
                              <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-700 border border-gray-100 dark:border-slate-600 flex items-center justify-center text-gray-600 dark:text-gray-400 shrink-0">
                                <Icons.User size={18} />
                              </div>
                              <input 
                                type="text"
                                aria-label="نام و نام خانوادگی" autoComplete="name" placeholder="نام و نام خانوادگی"
                                className="bg-transparent w-full text-sm font-bold text-gray-800 dark:text-white outline-none placeholder:font-normal placeholder:text-gray-400"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                onBlur={() => {
                                  setName((prev) => normalizePersianName(prev));
                                  setTouched((p) => ({ ...p, name: true }));
                                }}
                                required={!isLoginMode}
                                maxLength={100}
                              />
                          </div>
                          {touched.name && !nameCheck.ok && (
                            <div className="mt-1 text-xs font-bold text-red-600 dark:text-red-400">{nameCheck.error}</div>
                          )}
                        </div>
                    )}

                    <div>
                      <label htmlFor="auth-student" className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">شماره دانشجویی</label>
                      <div className={`bg-gray-50/90 dark:bg-slate-800 border rounded-2xl px-4 py-3 flex items-center gap-3 focus-within:border-vira-primary focus-within:bg-white dark:focus-within:bg-slate-900 transition-all ${
                        touched.studentId && !studentCheck.ok ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-slate-700'
                      }`}>
                          <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-700 border border-gray-100 dark:border-slate-600 flex items-center justify-center text-gray-600 dark:text-gray-400 shrink-0">
                            <Icons.Book size={18} />
                          </div>
                          <input 
                            type="text"
                            inputMode="numeric"
                            id="auth-student" aria-label="شماره دانشجویی" autoComplete="username" placeholder="۹ رقم"
                            className="bg-transparent w-full text-sm font-bold text-gray-800 dark:text-white outline-none placeholder:font-normal placeholder:text-gray-400 font-mono dir-ltr text-right"
                            value={studentId}
                            onChange={(e) => setStudentId(toEnglishDigits(e.target.value).replace(/\D/g, '').slice(0, 9))}
                            onBlur={() => setTouched((p) => ({ ...p, studentId: true }))}
                            required
                            maxLength={9}
                          />
                      </div>
                      {touched.studentId && !studentCheck.ok && (
                        <div className="mt-1 text-xs font-bold text-red-600 dark:text-red-400">{studentCheck.error}</div>
                      )}
                    </div>

                    <div>
                      <label htmlFor="auth-national" className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">کد ملی</label>
                      <div className={`bg-gray-50/90 dark:bg-slate-800 border rounded-2xl px-4 py-3 flex items-center gap-3 focus-within:border-vira-primary focus-within:bg-white dark:focus-within:bg-slate-900 transition-all ${
                        touched.nationalCode && !nationalCheck.ok ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-slate-700'
                      }`}>
                          <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-700 border border-gray-100 dark:border-slate-600 flex items-center justify-center text-gray-600 dark:text-gray-400 shrink-0">
                            <Icons.QrCode size={18} />
                          </div>
                          <input 
                            type="text"
                            inputMode="numeric"
                            id="auth-national" aria-label="کد ملی" autoComplete="off" placeholder="۱۰ رقم"
                            className="bg-transparent w-full text-sm font-bold text-gray-800 dark:text-white outline-none placeholder:font-normal placeholder:text-gray-400 font-mono dir-ltr text-right"
                            value={nationalCode}
                            onChange={(e) => setNationalCode(toEnglishDigits(e.target.value).replace(/\D/g, '').slice(0, 10))}
                            onBlur={() => setTouched((p) => ({ ...p, nationalCode: true }))}
                            required
                            maxLength={10}
                          />
                      </div>
                      {touched.nationalCode && !nationalCheck.ok && (
                        <div className="mt-1 text-xs font-bold text-red-600 dark:text-red-400">{nationalCheck.error}</div>
                      )}
                    </div>

                    <button 
                      type="submit"
                      disabled={isSubmitting || !canSubmit}
                      className={`w-full text-white font-black text-lg py-4 rounded-2xl shadow-lg shadow-vira-accent/40 dark:shadow-none active:scale-95 transition-all mt-6 ${
                        isSubmitting || !canSubmit ? 'bg-gray-300 dark:bg-slate-700 cursor-not-allowed' : 'bg-[linear-gradient(135deg,_#0f766e_0%,_#2563eb_100%)] hover:brightness-105'
                      }`}
                    >
                       {isSubmitting ? 'در حال ارسال...' : (isLoginMode ? 'ورود به حساب' : 'شروع کنید')}
                    </button>
                 </form>

                 {/* New Driver Link */}
                 <div className="mt-6 pt-4 border-t border-gray-100 dark:border-slate-800">
                    <button
                        onClick={() => window.location.href = '/driver'}
                        className="w-full flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 font-black text-sm py-2.5 hover:text-vira-primary transition-colors rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800"
                    >
                        <Icons.Car size={18} />
                        ورود به بخش رانندگان
                    </button>
                 </div>

              </div>
              
              <p className="text-center text-xs text-gray-600 dark:text-gray-400 mt-6">
                 با ورود به اپلیکیشن، 
                 <button type="button" onClick={openLegal} className="text-vira-primary mx-1 underline underline-offset-2">قوانین و مقررات</button>
                 را می‌پذیرید.
              </p>
           </div>
        </div>
      </div>
      {showLegal && (
        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="absolute inset-0" onClick={() => setShowLegal(false)} />
          <div ref={legalDialog} role="dialog" aria-modal="true" aria-label="قوانین و مقررات کاربر" tabIndex={-1} className="relative z-10 bg-white dark:bg-slate-900 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[75vh] overflow-hidden border border-gray-200 dark:border-slate-700">
            <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
              <div className="font-black text-gray-800 dark:text-white">قوانین و مقررات کاربر</div>
              <button type="button" aria-label="بستن قوانین" onClick={() => setShowLegal(false)} className="p-2 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-600"><Icons.X size={16} /></button>
            </div>
            <div className="p-4 overflow-y-auto text-sm leading-7 whitespace-pre-wrap text-gray-700 dark:text-gray-200">
              {legalLoading ? 'در حال دریافت...' : legalContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthView;
