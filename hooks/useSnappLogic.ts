import { useState, useRef, useEffect } from "react";
import {
  ViewState,
  BookingStage,
  BusOption,
  ChatMessage,
  UserProfile,
  Ticket,
  Transaction,
  AuthStage,
  Language,
  ToastState,
  Station,
  AppNotification,
  ResourceState,
} from "../types";
import {
  adminLoginAPI,
  clearAuthTokens,
  getBusSchedule,
  getStations,
  getUserTickets,
  getWalletTransactions,
  getCurrentUserAPI,
  chatWithSupport,
  loginAPI,
  registerAPI,
  reserveTicket,
  submitTicketFeedback,
  updateProfileAPI,
  getActiveNotification,
} from "../services/apiService";
import {
  INITIAL_CHAT_MESSAGE,
  DEFAULT_USER_PROFILE,
  MOCK_TICKETS,
  MOCK_TRANSACTIONS,
} from "../constants";
import { MapRef } from "../components/MapVisual";
import { formatAmountFa } from "../utils/numberUtils";
import { initializeFrontendConfig as primeFrontendConfig } from "../config/frontend-config";
import { readStudentView, studentViewKey } from "../utils/studentNavigation";
const formatBalance = (amountRial: number): string => {
  const amountToman = Math.round(amountRial / 10);
  return `${formatAmountFa(amountToman)} تومان`;
};

const STORAGE_KEY = "vira_user_profile";
const ADMIN_STORAGE_KEY = "vira_admin_session";
const ADMIN_AUTH_KEY = "vira_admin_auth_meta";

export const useSnappLogic = () => {
  const readJson = (storage: Storage, key: string) => {
    try {
      const value = JSON.parse(storage.getItem(key) || "null");
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
    } catch {
      storage.removeItem(key);
      return null;
    }
  };
  const [storedProfile] = useState(() => {
    const profile = readJson(localStorage, STORAGE_KEY);
    return profile?.studentId && localStorage.getItem("vira_user_auth_token")
      ? profile
      : null;
  });
  const [storedAdminSession] = useState(() =>
    sessionStorage.getItem(ADMIN_STORAGE_KEY),
  );
  const [storedAdminMeta] = useState(() =>
    readJson(sessionStorage, ADMIN_AUTH_KEY),
  );
  const isDriverRoute = /^\/(driver|deriver)(?:\/|$)/.test(
    window.location.pathname,
  );
  const persistProfile = (profile: UserProfile) => {
    // Credentials are fetched with the session token and never persisted in profile cache.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...profile, nationalCode: "" }),
    );
  };

  const isSuperAdminRoute =
    typeof window !== "undefined" &&
    (window.location.pathname.includes("/mohd/super/admin") ||
      window.location.pathname.startsWith("/dataanalysis"));

  const [bootstrapping, setBootstrapping] = useState(
    !isSuperAdminRoute && !isDriverRoute,
  );
  const [authError, setAuthError] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [resources, setResources] = useState<
    Record<
      "profile" | "tickets" | "transactions" | "stations" | "schedule",
      ResourceState
    >
  >({
    profile: { status: "idle", error: "" },
    tickets: { status: "idle", error: "" },
    transactions: { status: "idle", error: "" },
    stations: { status: "idle", error: "" },
    schedule: { status: "idle", error: "" },
  });

  const [authStage, setAuthStage] = useState<AuthStage>(
    // If on Admin Route, skip splash/auth form immediately.
    isSuperAdminRoute
      ? AuthStage.LOGGED_IN
      : storedProfile
        ? AuthStage.LOGGED_IN
        : AuthStage.SPLASH_START,
  );

  const [view, setViewState] = useState<ViewState>(() => {
    // Security Fix: Only show Admin Dashboard if we are EXPLICITLY on the admin route.
    // If user goes to root '/', they should see Home, even if admin session exists in background.
    if (isSuperAdminRoute) {
      return storedAdminSession === "true"
        ? ViewState.ADMIN_DASHBOARD
        : ViewState.ADMIN_LOGIN;
    }
    return readStudentView(window.location.search);
  });
  const setView = (next: ViewState) => {
    setViewState(next);
    if (isSuperAdminRoute || isDriverRoute) return;
    const key = studentViewKey(next);
    if (!key) return;
    const url = new URL(window.location.href);
    const previous = url.searchParams.get("view") || "home";
    if (previous === key) return;
    if (key === "home") url.searchParams.delete("view");
    else url.searchParams.set("view", key);
    window.history.pushState({}, "", url.pathname + url.search + url.hash);
  };
  useEffect(() => {
    if (isSuperAdminRoute || isDriverRoute) return;
    const pop = () => setViewState(readStudentView(window.location.search));
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [isSuperAdminRoute, isDriverRoute]);

  const [bookingStage, setBookingStage] = useState<BookingStage>(
    BookingStage.IDLE,
  );
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [userProfile, setUserProfile] = useState<UserProfile>(
    storedProfile || DEFAULT_USER_PROFILE,
  );
  const [tickets, setTickets] = useState<Ticket[]>(MOCK_TICKETS);
  const [transactions, setTransactions] =
    useState<Transaction[]>(MOCK_TRANSACTIONS);

  const [stations, setStations] = useState<Station[]>([]);
  const [origin, setOrigin] = useState<string>("");
  const [destination, setDestination] = useState<string>("");
  const [busOptions, setBusOptions] = useState<BusOption[]>([]);
  const [bookingPending, setBookingPending] = useState(false);
  const [issuedTicket, setIssuedTicket] = useState<Ticket | null>(null);
  const purchaseBusy = useRef(false);
  const purchaseRequest = useRef<{ signature: string; key: string } | null>(
    null,
  );
  const scheduleRequest = useRef(0);
  const sessionGeneration = useRef(0);
  const requests = useRef<
    Partial<
      Record<
        "profile" | "tickets" | "transactions",
        { generation: number; promise: Promise<void> }
      >
    >
  >({});
  const stationRequest = useRef<Promise<void> | null>(null);
  const [selectedBus, setSelectedBus] = useState<BusOption | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  const [ratingTicketId, setRatingTicketId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "model", text: INITIAL_CHAT_MESSAGE },
  ]);
  const [inputMsg, setInputMsg] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const [toast, setToast] = useState<ToastState>({
    message: "",
    type: "success",
    visible: false,
  });
  const [activeNotification, setActiveNotification] =
    useState<AppNotification | null>(null);
  const [adminRole, setAdminRole] = useState<"admin" | "analyst">(() =>
    storedAdminMeta?.role === "analyst" ? "analyst" : "admin",
  );

  const mapRef = useRef<MapRef>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (storedProfile || isSuperAdminRoute || isDriverRoute) return;
    let active = true;
    // Preparation follows actual configuration readiness; no artificial splash timer.
    void primeFrontendConfig().finally(() => {
      if (active) {
        setAuthStage(AuthStage.AUTH_FORM);
        setBootstrapping(false);
      }
    });
    return () => {
      active = false;
    };
  }, [isSuperAdminRoute, isDriverRoute, storedProfile]);

  useEffect(() => {
    // Keep saved language preferences, but only advertise the complete UI locale.
    const lang = "fa";
    document.documentElement.lang = lang;
    document.documentElement.dir = "rtl";
    document.body.className = `lang-${lang}`;
  }, [userProfile.language]);

  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatOpen]);

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "success",
  ) => {
    setToast({ message, type, visible: true });
  };

  const closeToast = () => setToast((prev) => ({ ...prev, visible: false }));

  const setResource = (
    key: keyof typeof resources,
    status: ResourceState["status"],
    error = "",
  ) => setResources((previous) => ({ ...previous, [key]: { status, error } }));
  const refreshStations = (): Promise<void> => {
    if (stationRequest.current) return stationRequest.current;
    const operation = (async () => {
      setResource("stations", "loading");
      try {
        const data = await getStations();
        if (!Array.isArray(data))
          throw new Error("پاسخ ایستگاه‌ها معتبر نیست.");
        setStations(data);
        setResource("stations", "ready");
      } catch (error) {
        setResource(
          "stations",
          "error",
          (error as Error).message || "دریافت ایستگاه‌ها ناموفق بود.",
        );
      }
    })();
    stationRequest.current = operation;
    void operation.finally(() => {
      if (stationRequest.current === operation) stationRequest.current = null;
    });
    return operation;
  };

  const fetchActiveNotification = async () => {
    try {
      const notif = await getActiveNotification();
      setActiveNotification(notif);
    } catch (e) {
      console.warn("Notification fetch failed", e);
    }
  };

  const loadResource = <T>(
    key: "profile" | "tickets" | "transactions",
    load: () => Promise<T>,
    apply: (data: T) => void,
  ): Promise<void> => {
    const generation = sessionGeneration.current;
    if (requests.current[key]?.generation === generation)
      return requests.current[key]!.promise;
    const operation = (async () => {
      setResource(key, "loading");
      try {
        const data = await load();
        if (generation !== sessionGeneration.current) return;
        apply(data);
        setResource(key, "ready");
      } catch (error) {
        if (generation !== sessionGeneration.current) return;
        setResource(
          key,
          "error",
          (error as Error).message || "دریافت اطلاعات ناموفق بود.",
        );
        if (key === "profile" && [401, 403].includes((error as any)?.status))
          handleLogout();
      }
    })();
    requests.current[key] = { generation, promise: operation };
    void operation.finally(() => {
      if (requests.current[key]?.promise === operation)
        delete requests.current[key];
    });
    return operation;
  };

  const refreshProfileFromServer = async () => {
    if (!userProfile?.studentId) return;
    await loadResource("profile", getCurrentUserAPI, (profile) => {
      setUserProfile(profile);
      persistProfile(profile);
    });
  };

  const refreshWalletTransactions = async () => {
    if (!userProfile?.studentId) return;
    await loadResource(
      "transactions",
      () => getWalletTransactions(userProfile.studentId),
      (data) => {
        if (!Array.isArray(data)) throw new Error("پاسخ تراکنش‌ها معتبر نیست.");
        setTransactions(data);
      },
    );
  };

  const refreshTicketsFromServer = async () => {
    if (!userProfile?.studentId) return;
    await loadResource(
      "tickets",
      () => getUserTickets(userProfile.studentId),
      (data) => {
        if (!Array.isArray(data)) throw new Error("پاسخ بلیت‌ها معتبر نیست.");
        setTickets(data);
        setIssuedTicket((previous) =>
          previous
            ? data.find((ticket) => ticket.id === previous.id) || previous
            : null,
        );
      },
    );
  };

  const refreshWallet = () =>
    Promise.all([refreshProfileFromServer(), refreshWalletTransactions()]);

  useEffect(() => {
    // Only fetch stations if we are not on the pure login route (to save requests)
    // or if we are already logged in
    if (isDriverRoute || isSuperAdminRoute) return;
    refreshStations();
    // Fetch active notification on load
    fetchActiveNotification();
  }, []);

  useEffect(() => {
    if (
      isDriverRoute ||
      isSuperAdminRoute ||
      authStage !== AuthStage.LOGGED_IN ||
      !userProfile?.studentId
    )
      return;
    const refreshUserData = async () => {
      const generation = sessionGeneration.current;
      await refreshProfileFromServer();
      if (generation !== sessionGeneration.current) return;
      setBootstrapping(false);
      await Promise.all([
        refreshTicketsFromServer(),
        refreshWalletTransactions(),
      ]);
    };
    refreshUserData();
  }, [authStage, userProfile?.studentId]);

  useEffect(() => {
    if (
      view !== ViewState.TICKETS &&
      !(view === ViewState.BUS && bookingStage === BookingStage.TICKET_VIEW)
    )
      return;
    let pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        await refreshTicketsFromServer();
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [view, bookingStage]);

  const handleRegister = async (
    name: string,
    studentId: string,
    nationalCode: string,
  ) => {
    setAuthError("");
    try {
      const profile = await registerAPI(name, studentId, nationalCode);
      sessionGeneration.current += 1;
      setUserProfile(profile);
      persistProfile(profile);
      setResource("profile", "ready");
      setAuthStage(AuthStage.LOGGED_IN);
      showToast("ثبت نام با موفقیت انجام شد", "success");
    } catch (error: any) {
      setAuthError(error?.message || "ثبت‌نام ناموفق بود.");
      showToast(error?.message || "ثبت نام ناموفق بود", "error");
    }
  };

  const handleLogin = async (studentId: string, nationalCode: string) => {
    setAuthError("");
    try {
      const profile = await loginAPI(studentId, nationalCode);
      sessionGeneration.current += 1;
      setUserProfile(profile);
      persistProfile(profile);
      setResource("profile", "ready");
      setAuthStage(AuthStage.LOGGED_IN);
      showToast("خوش آمدید", "success");
    } catch (error: any) {
      setAuthError(error?.message || "اطلاعات ورود صحیح نیست.");
      showToast(error?.message || "اطلاعات ورود صحیح نیست", "error");
    }
  };

  const handleAdminLogin = async (u: string, p: string) => {
    try {
      const payload = (await adminLoginAPI(u, p)) as any;
      sessionStorage.setItem(ADMIN_STORAGE_KEY, "true"); // Security: Use sessionStorage
      sessionStorage.setItem(
        ADMIN_AUTH_KEY,
        JSON.stringify({
          role: payload?.role === "analyst" ? "analyst" : "admin",
          username: payload?.username || "",
        }),
      );
      setAdminRole(payload?.role === "analyst" ? "analyst" : "admin");
      setView(ViewState.ADMIN_DASHBOARD);
      showToast(
        payload?.role === "analyst"
          ? "ورود تحلیل‌گر موفق بود"
          : "ورود ادمین موفق بود",
        "success",
      );
      return;
    } catch {
      showToast("نام کاربری یا رمز عبور اشتباه است", "error");
    }
  };

  const handleLogout = () => {
    sessionGeneration.current += 1;
    scheduleRequest.current += 1;
    purchaseRequest.current = null;
    purchaseBusy.current = false;
    requests.current = {};
    setBootstrapping(false);
    setAuthError("");
    setBookingError("");
    setResources({
      profile: { status: "idle", error: "" },
      tickets: { status: "idle", error: "" },
      transactions: { status: "idle", error: "" },
      stations: resources.stations,
      schedule: { status: "idle", error: "" },
    });
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(ADMIN_STORAGE_KEY);
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    const logoutGeneration = sessionGeneration.current;
    void clearAuthTokens().then(revoked => {
      if (!revoked && sessionGeneration.current === logoutGeneration) showToast("خروج محلی انجام شد؛ ابطال نشست سرور تأیید نشد.", "error");
    });

    setUserProfile(DEFAULT_USER_PROFILE);
    setTickets([]);
    setTransactions([]);
    setIssuedTicket(null);
    setSelectedBus(null);
    setBookingPending(false);
    setBookingStage(BookingStage.IDLE);
    setRatingTicketId(null);
    setChatOpen(false);
    setIsTyping(false);
    setMessages([{ role: "model", text: INITIAL_CHAT_MESSAGE }]);

    if (isSuperAdminRoute) {
      setView(ViewState.ADMIN_LOGIN);
    } else {
      setAuthStage(AuthStage.AUTH_FORM);
      setView(ViewState.HOME);
    }
    showToast("خارج شدید", "info");
  };

  const updateProfile = async (
    province: string,
    city: string,
    avatar: string,
    language: Language,
  ) => {
    const generation = sessionGeneration.current;
    try {
      const updatedProfile = {
        ...userProfile,
        province,
        city,
        avatar,
        language,
      };
      await updateProfileAPI(userProfile.studentId, {
        province,
        city,
        avatar,
        language,
      });
      if (generation !== sessionGeneration.current) return;
      setUserProfile(updatedProfile);
      persistProfile(updatedProfile);
      showToast("پروفایل ذخیره شد", "success");
    } catch (error) {
      if (generation !== sessionGeneration.current) return;
      console.error("Profile update error", error);
      showToast(
        (error as Error)?.message || "ذخیره پروفایل ناموفق بود",
        "error",
      );
    }
  };

  const toggleTheme = () => setIsDarkMode((prev) => !prev);

  const goToService = (serviceId: string) => {
    if (serviceId === "home") {
      goHome();
      return;
    }
    if (serviceId === "bus") {
      scheduleRequest.current += 1;
      setResource("schedule", "idle");
      setBookingError("");
      setSelectedBus(null);
      setView(ViewState.BUS);
      setBookingStage(BookingStage.IDLE);
      setOrigin("");
      setDestination("");
      setBusOptions([]);
    } else if (serviceId === "tickets") setView(ViewState.TICKETS);
    else if (serviceId === "wallet") {
      setView(ViewState.WALLET);
      void refreshWallet();
    } else if (serviceId === "support") setView(ViewState.SUPPORT);
    else if (serviceId === "feedback") setView(ViewState.FEEDBACK);
    else showToast("این بخش به زودی فعال می شود", "info");
  };

  const goToProfile = () => setView(ViewState.PROFILE);
  const goHome = () => {
    setView(ViewState.HOME);
    setBookingStage(BookingStage.IDLE);
  };

  const updateStation = (stationId: string, type: "origin" | "destination") => {
    scheduleRequest.current += 1;
    setBusOptions([]);
    setSelectedBus(null);
    setBookingError("");
    setResource("schedule", "idle");
    if (type === "origin") {
      setOrigin(stationId);
      if (destination) fetchBuses(stationId, destination);
      return;
    }

    setDestination(stationId);
    if (origin) fetchBuses(origin, stationId);
  };

  const fetchBuses = async (fromId: string, toId: string) => {
    const request = ++scheduleRequest.current;
    if (fromId === toId) {
      setBusOptions([]);
      setLoadingSchedule(false);
      setResource("schedule", "error", "مبدأ و مقصد باید متفاوت باشند.");
      return;
    }
    setBookingStage(BookingStage.SELECT_BUS);
    setLoadingSchedule(true);
    setBusOptions([]);
    setResource("schedule", "loading");

    try {
      const options = await getBusSchedule(fromId, toId);
      if (!Array.isArray(options)) throw new Error("پاسخ سرویس‌ها معتبر نیست.");
      if (request === scheduleRequest.current) {
        setBusOptions(Array.isArray(options) ? options : []);
        setResource("schedule", "ready");
      }
    } catch (error: any) {
      if (request === scheduleRequest.current) {
        setResource(
          "schedule",
          "error",
          error?.message || "دریافت برنامه سرویس ناموفق بود",
        );
        setBusOptions([]);
      }
    } finally {
      if (request === scheduleRequest.current) setLoadingSchedule(false);
    }
  };

  const refreshSchedule = () => {
    if (origin && destination) {
      fetchBuses(origin, destination);
    } else {
      refreshStations();
    }
  };

  const selectBus = (bus: BusOption) => {
    if (bus.remainingSeats <= 0 || loadingSchedule) return;
    setBookingError("");
    setSelectedBus(bus);
    setBookingStage(BookingStage.CONFIRMATION);
  };

  const confirmBooking = async (count: number = 1) => {
    if (!selectedBus || purchaseBusy.current) return;

    if (!userProfile?.studentId) {
      showToast("خطا در احراز هویت. لطفا مجدد وارد شوید.", "error");
      return;
    }

    purchaseBusy.current = true;
    setBookingPending(true);
    setBookingError("");
    const generation = sessionGeneration.current;
    const signature = JSON.stringify([
      selectedBus.id,
      origin,
      destination,
      count,
    ]);
    if (purchaseRequest.current?.signature !== signature)
      purchaseRequest.current = { signature, key: crypto.randomUUID() };
    try {
      const result = await reserveTicket(
        {
          student_id: userProfile.studentId,
          schedule_id: selectedBus.id,
          origin_station_id: origin,
          destination_station_id: destination,
          departure_time: selectedBus.departureTime,
          seatCount: count,
        },
        purchaseRequest.current.key,
      );
      if (generation !== sessionGeneration.current) return;

      const updatedProfile = {
        ...userProfile,
        balance: formatBalance(result.balance),
      };
      setUserProfile(updatedProfile);
      persistProfile(updatedProfile);
      setResource("profile", "ready");

      if (result?.transaction)
        setTransactions((prev) => [result.transaction, ...prev]);

      // If multiple tickets returned
      if (result?.tickets && Array.isArray(result.tickets)) {
        setTickets((prev) => [...result.tickets, ...prev]);
      } else if (result?.ticket) {
        setTickets((prev) => [result.ticket, ...prev]);
      }

      setIssuedTicket(result.ticket || result.tickets?.[0] || null);
      purchaseRequest.current = null;
      setBookingStage(BookingStage.TICKET_VIEW);
      showToast(`${formatAmountFa(count)} بلیت با موفقیت رزرو شد`, "success");
    } catch (error: any) {
      if (generation !== sessionGeneration.current) return;
      setBookingError(error?.message || "رزرو بلیت انجام نشد");
      showToast(error?.message || "رزرو بلیت انجام نشد", "error");
    } finally {
      if (generation === sessionGeneration.current) {
        purchaseBusy.current = false;
        setBookingPending(false);
      }
    }
  };

  const resetBooking = () => {
    if (purchaseBusy.current) return;
    setBookingError("");
    setBookingStage(BookingStage.SELECT_BUS);
    setSelectedBus(null);
  };

  const initiateRating = (ticketId: string) => setRatingTicketId(ticketId);

  const submitRating = async (rating: number, comment: string) => {
    if (!ratingTicketId) return;
    const generation = sessionGeneration.current;
    try {
      const updated = await submitTicketFeedback(ratingTicketId, {
        rating,
        comment,
      });
      if (generation !== sessionGeneration.current) return;
      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.id === ratingTicketId
            ? { ...ticket, ...updated.ticket }
            : ticket,
        ),
      );
      setRatingTicketId(null);
      showToast("نظر شما ثبت شد", "success");
      if (bookingStage === BookingStage.TICKET_VIEW) resetBooking();
    } catch (error: any) {
      if (generation !== sessionGeneration.current) return;
      showToast(error?.message || "ثبت نظر ناموفق بود", "error");
    }
  };

  const cancelRating = () => setRatingTicketId(null);

  const sendMessage = async () => {
    if (!inputMsg.trim() || isTyping) return;
    const generation = sessionGeneration.current;
    const outgoing: ChatMessage = { role: "user", text: inputMsg };
    setMessages((prev) => [...prev, outgoing]);
    setInputMsg("");
    setIsTyping(true);

    try {
      const reply = await chatWithSupport(
        messages.map((item) => item.text),
        outgoing.text,
      );
      if (generation !== sessionGeneration.current) return;
      setMessages((prev) => [...prev, { role: "model", text: reply }]);
    } catch {
      if (generation !== sessionGeneration.current) return;
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          text: "ارتباط برقرار نشد. برای پیگیری، از بخش پشتیبانی تیکت ثبت کنید.",
        },
      ]);
    } finally {
      if (generation === sessionGeneration.current) setIsTyping(false);
    }
  };

  const locateUser = () => mapRef.current?.locateUser();

  return {
    state: {
      bootstrapping,
      resources,
      authError,
      bookingError,
      authStage,
      view,
      bookingStage,
      bookingPending,
      issuedTicket,
      origin,
      destination,
      busOptions,
      selectedBus,
      loadingSchedule,
      chatOpen,
      messages,
      inputMsg,
      isTyping,
      userProfile,
      tickets,
      transactions,
      isDarkMode,
      ratingTicketId,
      toast,
      stations,
      activeNotification,
      adminRole,
    },
    refs: { mapRef, chatEndRef },
    actions: {
      refreshStations,
      refreshWallet,
      refreshTicketsFromServer,
      handleRegister,
      handleLogin,
      handleAdminLogin,
      handleLogout,
      goToService,
      goHome,
      updateStation,
      refreshSchedule,
      selectBus,
      resetBooking,
      confirmBooking,
      sendMessage,
      setInputMsg,
      setChatOpen,
      locateUser,
      goToProfile,
      updateProfile,
      toggleTheme,
      initiateRating,
      submitRating,
      cancelRating,
      showToast,
      closeToast,
    },
  };
};
