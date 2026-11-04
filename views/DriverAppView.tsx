import React, { useEffect, useRef } from "react";
import { Icons } from "../components/Icons";
import { ContactRound, Phone } from "lucide-react";
import { useDriverLogic } from "../hooks/useDriverLogic";
import DriverAuth, { DriverReview } from "../components/driver/DriverAuth";
import DriverRegistration from "../components/driver/DriverRegistration";
import DriverDashboard from "../components/driver/DriverDashboard";
import DriverRouteRequests from "../components/driver/DriverRouteRequests";
import {
  Button,
  DriverBanner,
  DriverNavigation,
  DriverScanLauncher,
  DriverManualCode,
  DriverScannerOverlay,
  DriverTrail,
} from "../components/driver/DriverUI";

export default function DriverAppView() {
  const logic = useDriverLogic();
  const { session, restoring, page, pendingMessage, registering } = logic.state;
  const content = useRef<HTMLElement>(null);
  useEffect(() => {
    if (content.current) content.current.scrollTop = 0;
  }, [page]);
  return (
    <div className="vira-student vira-driver driver-shell" dir="rtl">
      {pendingMessage ? (
        <DriverReview logic={logic} />
      ) : registering ? (
        <DriverRegistration logic={logic} />
      ) : !session ? (
        <DriverAuth logic={logic} />
      ) : restoring ? (
        <div
          className="driver-restoring"
          role="status"
          aria-label="بررسی نشست راننده"
        >
          <img src="/logo/welcome.png" width="72" height="72" alt="" />
          <p>در حال بررسی نشست و دریافت اطلاعات راننده…</p>
        </div>
      ) : (
        <>
          <div className="student-view driver-background">
            <main className="driver-content" ref={content}>
              <DriverBanner shuttle={page === "profile"} />
              <div className={"driver-page-content driver-page-" + page}>
                {page === "dashboard" && <DriverDashboard logic={logic} />}
                {page === "scan" && (
                  <>
                    <h1 className="driver-visually-hidden">اسکن بلیت</h1>
                    <DriverScanLauncher logic={logic} />
                    <DriverManualCode logic={logic} />
                    <DriverTrail city />
                  </>
                )}
                {page === "request" && (
                  <>
                    <h1 className="driver-visually-hidden">
                      درخواست مسیر راننده
                    </h1>
                    <DriverRouteRequests logic={logic} />
                  </>
                )}
                {page === "profile" && (
                  <section
                    className="driver-card driver-profile"
                    aria-labelledby="driver-profile-title"
                  >
                    <span
                      className="driver-icon-tile driver-profile-icon"
                      aria-hidden="true"
                    >
                      <Icons.User size={50} />
                    </span>
                    <h1 id="driver-profile-title">پروفایل</h1>
                    <dl>
                      {[
                        {
                          key: "name",
                          label: "نام",
                          value: session.name,
                          Icon: Icons.User,
                        },
                        {
                          key: "username",
                          label: "نام کاربری",
                          value: session.username,
                          Icon: ContactRound,
                        },
                        {
                          key: "plate",
                          label: "پلاک",
                          value: session.licensePlate,
                          Icon: Icons.Car,
                        },
                        {
                          key: "phone",
                          label: "تلفن",
                          value: session.phone || "ثبت نشده",
                          Icon: Phone,
                        },
                      ].map(({ key, label, value, Icon }) => (
                        <div key={key}>
                          <dt>
                            <span className="driver-icon-tile">
                              <Icon size={26} aria-hidden="true" />
                            </span>
                            {label}
                          </dt>
                          <dd>
                            <bdi dir={key === "name" ? "rtl" : "ltr"}>
                              {value}
                            </bdi>
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <Button
                      className="driver-logout"
                      onClick={() => logic.actions.logout()}
                    >
                      <Icons.LogOut size={24} />
                      خروج از حساب
                    </Button>
                  </section>
                )}
              </div>
            </main>
          </div>
          <DriverNavigation page={page} onNavigate={logic.actions.navigate} />
          <DriverScannerOverlay logic={logic} />
        </>
      )}
    </div>
  );
}
