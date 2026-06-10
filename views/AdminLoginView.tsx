
import React, { useState } from 'react';
import { Icons } from '../components/Icons';
import { toEnglishDigits } from '../utils/numberUtils';

interface AdminLoginViewProps {
  onLogin: (u: string, p: string) => void;
}

const AdminLoginView: React.FC<AdminLoginViewProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(username, password);
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden font-sans bg-[radial-gradient(circle_at_top_right,_rgba(20,184,166,0.18),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(14,165,233,0.18),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef6ff_100%)]" dir="rtl">
      <div className="absolute inset-0 pointer-events-none opacity-70">
        <div className="absolute top-[-12%] right-[-8%] w-[34rem] h-[34rem] rounded-full bg-gradient-to-br from-vira-secondary/30 to-transparent blur-3xl"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[30rem] h-[30rem] rounded-full bg-gradient-to-tr from-vira-primary/30 to-transparent blur-3xl"></div>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-5xl grid lg:grid-cols-[1.1fr_0.9fr] overflow-hidden rounded-[32px] border border-white/70 bg-white/75 shadow-[0_30px_100px_rgba(15,23,42,0.12)] backdrop-blur-xl">
          <div className="hidden lg:flex flex-col justify-between p-10 text-white bg-[linear-gradient(160deg,_#0f766e_0%,_#0ea5e9_55%,_#2563eb_100%)]">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur">
                <Icons.Shield size={16} />
                پنل مدیریت و دسترسی
              </div>
              <h1 className="text-4xl xl:text-5xl font-black leading-tight">ویرا، مرکز کنترل عملیات سامانه حمل‌ونقل</h1>
              <p className="max-w-lg text-white/85 text-lg leading-8">
                ورود امن برای سوپرادمین و تحلیل‌گرها با تجربه‌ای تمیز، سریع و قابل اعتماد.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              {[
                ['دسترسی امن', 'ورود مبتنی بر نقش'],
                ['ردیابی کامل', 'گزارش‌گیری لحظه‌ای'],
                ['طراحی حرفه‌ای', 'خوانا و سریع']
              ].map(([title, desc]) => (
                <div key={title} className="rounded-2xl bg-white/12 border border-white/15 p-4 backdrop-blur">
                  <div className="font-black">{title}</div>
                  <div className="mt-1 text-white/75 text-xs leading-6">{desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 sm:p-8 lg:p-10">
            <div className="flex flex-col items-center mb-8">
               <div className="w-20 h-20 bg-[linear-gradient(135deg,_#0f766e_0%,_#0ea5e9_100%)] rounded-[22px] flex items-center justify-center text-white mb-5 shadow-[0_18px_40px_rgba(14,165,233,0.3)] rotate-[-4deg] hover:rotate-0 transition-transform duration-300">
                   <Icons.Shield size={40} />
               </div>
               <h1 className="text-3xl font-black text-gray-900 tracking-tight">ویرا</h1>
               <div className="flex items-center gap-2 mt-3 bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-100">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                 <span className="text-xs font-black text-emerald-700 tracking-wide">پنل مدیریت</span>
               </div>
            </div>

            <div className="rounded-[28px] border border-gray-200 bg-white/90 p-6 shadow-[0_16px_45px_rgba(15,23,42,0.08)]">
              <form onSubmit={handleSubmit} className="space-y-5">
                 <div className="space-y-1.5">
                     <label className="text-xs font-black text-gray-500 mr-1">نام کاربری مدیر</label>
                     <div className="relative group">
                       <div className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 group-focus-within:bg-vira-light group-focus-within:text-vira-primary transition-colors">
                         <Icons.User size={18} />
                       </div>
                       <input 
                         type="text" 
                         value={username}
                         onChange={(e) => setUsername(toEnglishDigits(e.target.value))}
                         className="w-full h-14 pr-4 pl-16 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:border-vira-primary focus:ring-4 focus:ring-vira-primary/10 transition-all text-left dir-ltr text-gray-800 font-bold placeholder:text-gray-400"
                         placeholder="شناسه مدیر"
                         dir="ltr"
                       />
                     </div>
                 </div>

                 <div className="space-y-1.5">
                     <label className="text-xs font-black text-gray-500 mr-1">رمز عبور</label>
                     <div className="relative group">
                       <div className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 group-focus-within:bg-vira-light group-focus-within:text-vira-primary transition-colors">
                         <Icons.Lock size={18} />
                       </div>
                       <input 
                         type="password" 
                         value={password}
                         onChange={(e) => setPassword(toEnglishDigits(e.target.value))}
                         className="w-full h-14 pr-4 pl-16 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:border-vira-primary focus:ring-4 focus:ring-vira-primary/10 transition-all text-left dir-ltr text-gray-800 font-bold placeholder:text-gray-400"
                         placeholder="••••••••"
                         dir="ltr"
                       />
                     </div>
                 </div>
                 
                 <button 
                   type="submit"
                   className="w-full bg-[linear-gradient(135deg,_#0f766e_0%,_#0ea5e9_100%)] text-white font-black py-4 rounded-2xl shadow-[0_18px_45px_rgba(14,165,233,0.35)] transition-all active:scale-[0.98] mt-4 hover:brightness-105"
                 >
                   ورود به داشبورد
                 </button>
              </form>

              <div className="mt-8 pt-5 border-t border-gray-100 text-center">
                  <span className="text-xs text-gray-400 font-mono" dir="ltr">System v4.2.0 • Secured by Vira Enterprise</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginView;
