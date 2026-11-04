import React from "react";
import { Icons, getIcon } from "../components/Icons";
import { UNIVERSITY_SERVICES } from "../constants";
import { UserProfile, AppNotification } from "../types";
import { translations } from "../data/translations";
import {
  Button,
  IconButton,
  StudentPage,
} from "../components/student/StudentUI";

interface HomeViewProps {
  userProfile: UserProfile;
  onServiceClick: (id: string) => void;
  onOpenChat: () => void;
  onProfileClick: () => void;
  notification?: AppNotification | null;
}

const HomeView: React.FC<HomeViewProps> = ({
  userProfile,
  onServiceClick,
  onOpenChat,
  onProfileClick,
  notification,
}) => {
  const lang = userProfile.language || "fa";
  const t = translations[lang];
  const serviceTitle = (id: string, original: string) => {
    if (id === "bus") return t.service_bus;
    if (id === "tickets") return lang === "fa" ? "بلیت‌ها" : t.service_tickets;
    if (id === "wallet") return t.service_wallet;
    if (id === "support") return t.service_support;
    return original;
  };
  return (
    <StudentPage
      className="student-home"
      header={
        <header className="student-header student-home-header">
          <button
            type="button"
            className="student-home-account"
            aria-label="حساب کاربری"
            onClick={onProfileClick}
          >
            <span className="student-avatar">
              {userProfile.avatar ? (
                <img src={userProfile.avatar} alt="" />
              ) : (
                <Icons.User size={27} aria-hidden="true" />
              )}
            </span>
            <span>
              <strong>{userProfile.name}</strong>
              <small dir="ltr">{userProfile.studentId}</small>
            </span>
          </button>
          <IconButton
            className="student-header-action"
            aria-label="باز کردن راهنمای خودکار"
            onClick={onOpenChat}
          >
            <Icons.MessageSquare size={25} />
          </IconButton>
        </header>
      }
    >
      <section
        className="student-hero"
        aria-labelledby="student-booking-banner"
      >
        <svg
          className="student-hero-route"
          viewBox="0 0 250 200"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M155 12C220 60-45 25 25 108S280 150 150 220"
            stroke="#1acbb4"
            strokeWidth="7"
          />
          <circle
            cx="155"
            cy="12"
            r="7"
            fill="white"
            stroke="#1acbb4"
            strokeWidth="4"
          />
        </svg>
        <img
          src="/illustrations/bus.png"
          className="student-hero-bus"
          width="348"
          height="225"
          alt=""
          decoding="async"
        />
        <div className="student-hero-text">
          <h2 id="student-booking-banner">رزرو بلیت اتوبوس</h2>
          <p>سریع، آسان و مطمئن به دانشگاه برسید</p>
          <Button variant="secondary" onClick={() => onServiceClick("bus")}>
            رزرو بلیت
            <Icons.ArrowRight size={22} aria-hidden="true" />
          </Button>
        </div>
      </section>
      <div className="student-section-heading">
        <h2>{t.services_title}</h2>
      </div>
      <div className="student-service-grid">
        {UNIVERSITY_SERVICES.map((service) => (
          <button
            type="button"
            key={service.id}
            className="student-service"
            aria-label={serviceTitle(service.id, service.title)}
            onClick={() => onServiceClick(service.id)}
          >
            <span className="student-icon-tile" aria-hidden="true">
              {getIcon(service.icon, { size: 27, strokeWidth: 1.9 })}
            </span>
            <strong>{serviceTitle(service.id, service.title)}</strong>
            {service.isNew && (
              <span className="student-new-badge">{t.new}</span>
            )}
          </button>
        ))}
      </div>
      {notification && (
        <aside
          className="student-card student-notification"
          aria-label="اطلاعیه"
        >
          <span className="student-icon-tile">
            <Icons.Bell size={24} aria-hidden="true" />
          </span>
          <div>
            <strong>{notification.title}</strong>
            <p>{notification.message}</p>
            <small>{notification.date}</small>
          </div>
        </aside>
      )}
    </StudentPage>
  );
};

export default HomeView;
