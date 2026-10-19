
import React, { useState, useRef } from 'react';
import { Icons } from '../components/Icons';
import { UserProfile, Language } from '../types';
import { provinces } from '../data/provinces';
import { cities } from '../data/cities';
import { translations } from '../data/translations';

interface ProfileViewProps {
  userProfile: UserProfile;
  onBack: () => void;
  onSave: (province: string, city: string, avatar: string, language: Language) => Promise<void>;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const ProfileView: React.FC<ProfileViewProps> = ({ userProfile, onBack, onSave, onLogout, isDarkMode, onToggleTheme, showToast }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Initialize State from User Profile
  const [selectedProvinceId, setSelectedProvinceId] = useState<number | string>(() => {
    const found = provinces.find(p => p.name === userProfile.province);
    return found ? found.id : '';
  });
  
  const [provinceName, setProvinceName] = useState(userProfile.province);
  const [cityName, setCityName] = useState(userProfile.city);
  const [avatar, setAvatar] = useState(userProfile.avatar || '');
  const [language, setLanguage] = useState<Language>(userProfile.language || 'fa');

  // Helper to get text based on selected language
  // NOTE: In ProfileView we use the *local state* language for the UI immediately
  // to show the user what they are selecting.
  const t = translations[language];

  // Limit to first few provinces for smoother rendering if list is huge, or show all
  const displayedProvinces = provinces;

  // Filter cities based on selected province
  const displayedCities = selectedProvinceId 
    ? cities.filter(c => c.province_id === Number(selectedProvinceId)) 
    : [];

  const handleProvinceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedProvinceId(id);

    const found = provinces.find(p => p.id.toString() === id);
    if (found) {
      setProvinceName(found.name);
      setCityName(''); // Reset city when province changes
    } else {
      setProvinceName('');
      setCityName('');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Basic size validation
      if (file.size > 5 * 1024 * 1024) {
        showToast("حجم فایل نباید بیشتر از ۵ مگابایت باشد.", "error");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // Resize image to max 300x300 to save localStorage space
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 300;
          const MAX_HEIGHT = 300;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // Compress to JPEG with 0.7 quality
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            setAvatar(dataUrl);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try { await onSave(provinceName, cityName, avatar, language); } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-slate-950 font-sans transition-colors duration-200">
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImageUpload} 
        accept="image/*" 
        className="hidden" 
      />

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 p-4 flex items-center gap-3 shadow-sm sticky top-0 z-10 border-b dark:border-slate-800">
        <button aria-label="بازگشت به خانه" onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
           {language === 'en' ? <Icons.ArrowRight className="rotate-180 text-gray-700 dark:text-gray-200" size={24} /> : <Icons.ArrowRight size={24} className="text-gray-700 dark:text-gray-200" />}
        </button>
        <h2 className="text-lg font-bold text-gray-800 dark:text-white">{t.profile_header}</h2>
      </div>

      <div className="flex-1 p-5 overflow-y-auto pb-24">
        
        {/* Avatar Section */}
        <div className="flex flex-col items-center mb-8 mt-4">
           <div 
             role="button" tabIndex={0} aria-label="تغییر تصویر پروفایل" onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); triggerFileInput(); } }} onClick={triggerFileInput}
             className="w-28 h-28 bg-gray-200 dark:bg-slate-800 rounded-full border-4 border-white dark:border-slate-800 shadow-lg flex items-center justify-center relative transition-colors cursor-pointer group overflow-hidden"
           >
               {avatar ? (
                 <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
               ) : (
                 <Icons.User size={48} className="text-gray-500 dark:text-gray-400" />
               )}
               
               {/* Camera Overlay */}
               <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Icons.QrCode size={24} className="text-white" />
               </div>

               <div className="absolute bottom-0 right-0 bg-vira-primary p-2 rounded-full border-2 border-white dark:border-slate-800 z-10">
                  <div className="w-2 h-2 bg-white rounded-full opacity-0"></div>
                  <Icons.Plus size={16} className="text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
               </div>
           </div>
           <h3 className="mt-3 font-bold text-xl text-gray-800 dark:text-white">{userProfile.name}</h3>
           <span className="text-sm text-gray-500 dark:text-gray-400" dir="ltr">{userProfile.balance} {t.balance}</span>
        </div>

        {/* Settings / Theme Toggle */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-gray-200 dark:border-slate-800 flex items-center justify-between mb-6 shadow-sm transition-colors">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-indigo-900 text-indigo-300' : 'bg-orange-100 text-orange-500'}`}>
                    {isDarkMode ? <Icons.Moon size={20} /> : <Icons.Sun size={20} />}
                </div>
                <div>
                    <span className="block text-sm font-bold text-gray-800 dark:text-gray-100">{t.darkMode}</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">{t.themeDesc}</span>
                </div>
            </div>
            <button 
                aria-label="حالت تاریک" role="switch" aria-checked={isDarkMode} onClick={onToggleTheme}
                className={`w-12 h-7 rounded-full p-1 flex items-center transition-colors duration-300 relative ${isDarkMode ? 'bg-indigo-500' : 'bg-gray-300'}`}
            >
                <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-300 ${isDarkMode ? (language === 'en' ? 'translate-x-5' : '-translate-x-5') : 'translate-x-0'}`}></div>
            </button>
        </div>

        {/* Read-Only Fields */}
        <div className="space-y-4 mb-6">
           <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mx-1">{t.name}</label>
              <div className="bg-gray-200/60 dark:bg-slate-800/60 p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 flex items-center gap-3">
                 <Icons.User size={18} className="text-gray-600 dark:text-gray-400" />
                 <span className="text-sm font-bold text-gray-600 dark:text-gray-300">{userProfile.name}</span>
              </div>
           </div>

           <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mx-1">{t.studentId}</label>
              <div className="bg-gray-200/60 dark:bg-slate-800/60 p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 flex items-center gap-3">
                 <Icons.Book size={18} className="text-gray-600 dark:text-gray-400" />
                 <span className="text-sm font-bold text-gray-600 dark:text-gray-300 tracking-wider font-mono pt-1">{userProfile.studentId}</span>
              </div>
           </div>

           <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mx-1">{t.nationalCode}</label>
              <div className="bg-gray-200/60 dark:bg-slate-800/60 p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 flex items-center gap-3">
                 <Icons.QrCode size={18} className="text-gray-600 dark:text-gray-400" />
                 <span className="text-sm font-bold text-gray-600 dark:text-gray-300 tracking-wider font-mono pt-1">{userProfile.nationalCode}</span>
              </div>
           </div>
        </div>

        <div className="h-px bg-gray-200 dark:bg-slate-800 my-6"></div>

        {/* Editable Fields */}
        <h3 className="font-bold text-gray-800 dark:text-white mb-4">{t.residence}</h3>
        
        <div className="space-y-4 mb-6">
            {/* Province Select */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mx-1">{t.province}</label>
              <div className="relative">
                <select
                  aria-label={t.province} value={selectedProvinceId}
                  onChange={handleProvinceChange}
                  className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-3.5 rounded-xl text-sm font-bold text-gray-700 dark:text-white outline-none focus:border-vira-primary appearance-none transition-colors"
                >
                  <option value="">{t.selectProvince}</option>
                  {displayedProvinces.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <Icons.ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400 pointer-events-none" size={16} />
              </div>
            </div>

            {/* City Select */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mx-1">{t.city}</label>
              <div className="relative">
                <select
                  aria-label={t.city} value={cityName}
                  onChange={(e) => setCityName(e.target.value)}
                  disabled={!selectedProvinceId}
                  className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-3.5 rounded-xl text-sm font-bold text-gray-700 dark:text-white outline-none focus:border-vira-primary appearance-none disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-400 transition-colors"
                >
                  <option value="">{t.selectCity}</option>
                  {displayedCities.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <Icons.ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400 pointer-events-none" size={16} />
              </div>
            </div>
        </div>

        {/* Language Selection */}
        <h3 className="font-bold text-gray-800 dark:text-white mb-4 mt-6">{t.language}</h3>
        <div className="relative mb-6">
            <select
                aria-label={t.language} value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-3.5 rounded-xl text-sm font-bold text-gray-700 dark:text-white outline-none focus:border-vira-primary appearance-none transition-colors"
            >
                <option value="fa">فارسی</option>
                <option value="en">English</option>
                <option value="ar">العربية</option>
            </select>
            <Icons.ChevronDown className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400 pointer-events-none" size={16} />
        </div>

        {/* LOGOUT BUTTON - Added here as requested */}
        <button 
           onClick={onLogout}
           className="w-full bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300 border border-red-100 dark:border-red-900/30 py-4 rounded-xl font-bold active:scale-95 transition-all mb-8 flex items-center justify-center gap-2"
        >
           <Icons.ArrowRight className="rotate-0" size={18} />
           {t.logout}
        </button>

        {/* Save Button */}
        <button 
           disabled={saving} aria-busy={saving} onClick={handleSave}
           className="w-full bg-vira-primary text-white py-4 rounded-xl font-bold shadow-lg shadow-vira-accent/50 dark:shadow-none active:scale-95 transition-all mb-4 sticky bottom-4 z-10"
        >
           {t.save}
        </button>

      </div>
    </div>
  );
};

export default ProfileView;
