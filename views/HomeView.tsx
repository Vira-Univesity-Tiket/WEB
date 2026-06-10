
import React from 'react';
import { Icons, getIcon } from '../components/Icons';
import { UNIVERSITY_SERVICES } from '../constants';
import { UserProfile, Language, AppNotification } from '../types';
import { translations } from '../data/translations';

interface HomeViewProps {
  userProfile: UserProfile;
  onServiceClick: (id: string) => void;
  onOpenChat: () => void;
  onProfileClick: () => void;
  notification?: AppNotification | null;
}

const HomeView: React.FC<HomeViewProps> = ({ userProfile, onServiceClick, onOpenChat, onProfileClick, notification }) => {
  const lang = userProfile.language || 'fa';
  const t = translations[lang];

  // Helper to get translated service title
  const getServiceTitle = (id: string, originalTitle: string) => {
    switch (id) {
      case 'bus': return t.service_bus;
      case 'tickets': return t.service_tickets;
      case 'wallet': return t.service_wallet;
      case 'support': return t.service_support;
      default: return originalTitle;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#f9fafb] dark:bg-slate-950 pb-24 font-sans transition-colors duration-200">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 px-4 py-3 flex justify-between items-center sticky top-0 z-20 shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:border-b dark:border-slate-800 transition-colors">
        <div className="flex items-center gap-3 cursor-pointer" onClick={onProfileClick}>
          <div className="relative">
             <div className="w-11 h-11 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-300 border border-gray-200 dark:border-slate-700">
               <Icons.User size={22} />
             </div>
             <div className="absolute bottom-0 right-0 w-3 h-3 bg-vira-primary border-2 border-white dark:border-slate-900 rounded-full"></div>
          </div>
          <div className="flex flex-col">
             <h1 className="text-sm font-black text-gray-800 dark:text-white">{userProfile.name}</h1>
             <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium mt-0.5">{userProfile.studentId}</span>
          </div>
        </div>
        <button 
          onClick={onOpenChat}
          className="w-10 h-10 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 shadow-sm active:scale-95 transition-transform"
        >
           <Icons.MessageSquare size={20} />
        </button>
      </header>

      {/* Banner - Updated Content and Action */}
      <div className="px-4 mb-4 mt-4">
        <div className="w-full h-32 rounded-2xl bg-gradient-to-l from-vira-primary to-vira-secondary flex items-center justify-between px-6 shadow-lg shadow-vira-accent/50 dark:shadow-none relative overflow-hidden">
           <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
           <div className="absolute bottom-0 left-0 w-24 h-24 bg-black opacity-10 rounded-full translate-y-1/2 -translate-x-1/2"></div>
           
           <div className="text-white z-10 flex flex-col gap-1">
             <span className="font-black text-lg">{t.bus_title}</span>
             <span className="text-xs opacity-90 font-medium">{t.bus_desc}</span>
             <button 
                onClick={() => onServiceClick('bus')}
                className="mt-3 bg-white text-vira-primary text-[11px] font-bold py-2 px-5 rounded-full w-fit shadow-md active:scale-95 transition-transform hover:bg-gray-50"
             >
                {t.reserve_btn}
             </button>
           </div>
           <div className="z-10 bg-white/20 p-2 rounded-full backdrop-blur-sm">
              <Icons.Bus className="text-white" size={32} />
           </div>
        </div>
      </div>

      {/* All Services - Unified Grid below Banner */}
      <div className="px-4">
         <h2 className="text-gray-800 dark:text-gray-200 font-bold text-sm mb-3 px-1">{t.services_title}</h2>
         <div className="grid grid-cols-4 gap-x-4 gap-y-6">
            {UNIVERSITY_SERVICES.map((service) => {
               const isActive = ['bus', 'tickets', 'wallet', 'support', 'feedback'].includes(service.id);
               return (
                  <div 
                    key={service.id} 
                    onClick={() => onServiceClick(service.id)}
                    className="flex flex-col items-center gap-2 cursor-pointer active:scale-95 transition-transform"
                  >
                     <div className={`w-14 h-14 rounded-2xl shadow-sm border flex items-center justify-center relative transition-colors ${
                        isActive
                          ? 'bg-white dark:bg-slate-800 text-vira-primary dark:text-vira-accent border-vira-light dark:border-slate-700' 
                          : 'bg-gray-50 dark:bg-slate-900 text-gray-400 dark:text-slate-600 border-gray-100 dark:border-slate-800'
                     }`}>
                        {getIcon(service.icon, { size: 24 })}
                        
                        {/* Badge Logic */}
                        {!isActive ? (
                           <div className="absolute -bottom-2.5 bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-gray-300 text-[9px] px-1.5 py-0.5 rounded-md font-bold border border-white dark:border-slate-900 shadow-sm whitespace-nowrap z-10">
                              {t.soon}
                           </div>
                        ) : service.isNew && (
                           <span className="absolute -top-1 -left-1 bg-red-500 text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold shadow-sm z-10">{t.new}</span>
                        )}
                     </div>
                     <span className={`text-[11px] font-medium text-center ${isActive ? 'text-gray-800 dark:text-gray-200 font-bold' : 'text-gray-400 dark:text-gray-600'}`}>
                        {getServiceTitle(service.id, service.title)}
                     </span>
                  </div>
               );
            })}
         </div>
      </div>

      {/* Notification Section (Dynamic) */}
      {notification && (
        <div className="px-4 mt-8">
           <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-gray-800 dark:text-gray-200 font-bold text-sm">{t.notifications_title}</h2>
              {/* Optional: Add View All link if there is a notifications page */}
           </div>
           
           <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm p-4 relative overflow-hidden transition-colors`}>
               <div className={`absolute top-0 w-1 h-full ${lang === 'en' ? 'left-0' : 'right-0'} ${
                   notification.type === 'warning' ? 'bg-orange-400' :
                   notification.type === 'error' ? 'bg-red-500' :
                   notification.type === 'success' ? 'bg-green-500' : 'bg-blue-500'
               }`}></div>
               <div className="flex gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      notification.type === 'warning' ? 'bg-orange-50 text-orange-500' :
                      notification.type === 'error' ? 'bg-red-50 text-red-500' :
                      notification.type === 'success' ? 'bg-green-50 text-green-500' : 'bg-blue-50 text-blue-500'
                  } dark:bg-slate-800`}>
                     <Icons.Bell size={20} />
                  </div>
                  <div className="flex-1">
                     <div className="flex justify-between items-start">
                        <h3 className="text-xs font-bold text-gray-800 dark:text-white">{notification.title}</h3>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-slate-800 px-2 py-0.5 rounded-full">{notification.date}</span>
                     </div>
                     <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 leading-5 text-justify">
                        {notification.message}
                     </p>
                  </div>
               </div>
           </div>
        </div>
      )}

    </div>
  );
};

export default HomeView;
