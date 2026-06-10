
import { useState, useRef, useEffect } from 'react';
import { ViewState, BookingStage, BusOption, ChatMessage, UserProfile, Ticket, Transaction, AuthStage, Language, ToastState, Station, AppNotification } from '../types';
import { adminLoginAPI, clearAuthTokens, getBusSchedule, getStations, getUserTickets, getWalletTransactions, loginAPI, registerAPI, reserveTicket, submitTicketFeedback, updateProfileAPI, getActiveNotification } from '../services/apiService';
import { INITIAL_CHAT_MESSAGE, DEFAULT_USER_PROFILE, MOCK_TICKETS, MOCK_TRANSACTIONS } from '../constants';
import { MapRef } from '../components/MapVisual';
import { formatAmountFa } from '../utils/numberUtils';
// Import removed to break dependency on AI service, we handle logic locally or via simple placeholder
// import { getSmartSupportResponse } from '../services/geminiService';

// Backend logic generally handles conversions now, but if we receive raw numbers that need formatting:
// This function assumes the input might be Rial if it's a raw number from a balance update,
// but for consistent UI, we usually receive formatted strings from backend auth.
// However, reserveTicket returns a numeric balance (Rial).
const formatBalance = (amountRial: number): string => {
  const amountToman = Math.round(amountRial / 10);
  return `${formatAmountFa(amountToman)} تومان`;
};

const STORAGE_KEY = 'vira_user_profile';
const ADMIN_STORAGE_KEY = 'vira_admin_session';
const ADMIN_AUTH_KEY = 'vira_admin_auth_meta';

export const useSnappLogic = () => {
  const storedProfileStr = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  const storedProfile = storedProfileStr ? JSON.parse(storedProfileStr) : null;
  
  // Security Fix: Use sessionStorage so admin access clears on browser close.
  const storedAdminSession = typeof window !== 'undefined' ? sessionStorage.getItem(ADMIN_STORAGE_KEY) : null;
  const storedAdminMetaRaw = typeof window !== 'undefined' ? sessionStorage.getItem(ADMIN_AUTH_KEY) : null;
  const storedAdminMeta = storedAdminMetaRaw ? JSON.parse(storedAdminMetaRaw) : null;

  const isSuperAdminRoute = typeof window !== 'undefined' && (
    window.location.pathname.includes('/mohd/super/admin') ||
    window.location.pathname.startsWith('/dataanalysis')
  );

  const [authStage, setAuthStage] = useState<AuthStage>(
    // If on Admin Route, skip splash/auth form immediately.
    isSuperAdminRoute ? AuthStage.LOGGED_IN : 
    storedProfile ? AuthStage.LOGGED_IN : 
    AuthStage.SPLASH_START
  );

  const [view, setView] = useState<ViewState>(() => {
    // Security Fix: Only show Admin Dashboard if we are EXPLICITLY on the admin route.
    // If user goes to root '/', they should see Home, even if admin session exists in background.
    if (isSuperAdminRoute) {
        return storedAdminSession === 'true' ? ViewState.ADMIN_DASHBOARD : ViewState.ADMIN_LOGIN;
    }
    // Default to Home for any other route (including root)
    return ViewState.HOME;
  });
  
  const [bookingStage, setBookingStage] = useState<BookingStage>(BookingStage.IDLE);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [userProfile, setUserProfile] = useState<UserProfile>(storedProfile || DEFAULT_USER_PROFILE);
  const [tickets, setTickets] = useState<Ticket[]>(MOCK_TICKETS);
  const [transactions, setTransactions] = useState<Transaction[]>(MOCK_TRANSACTIONS);

  const [stations, setStations] = useState<Station[]>([]);
  const [origin, setOrigin] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [busOptions, setBusOptions] = useState<BusOption[]>([]);
  const [selectedBus, setSelectedBus] = useState<BusOption | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  const [ratingTicketId, setRatingTicketId] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'model', text: INITIAL_CHAT_MESSAGE }]);
  const [inputMsg, setInputMsg] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const [toast, setToast] = useState<ToastState>({ message: '', type: 'success', visible: false });
  const [activeNotification, setActiveNotification] = useState<AppNotification | null>(null);
  const [adminRole, setAdminRole] = useState<'admin' | 'analyst'>(() => (storedAdminMeta?.role === 'analyst' ? 'analyst' : 'admin'));

  const mapRef = useRef<MapRef>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // If we are logged in (user or admin) or on admin route, do not run splash timer
    if (storedProfile || isSuperAdminRoute || storedAdminSession) return;
    
    const startTimer = setTimeout(() => setAuthStage(AuthStage.SPLASH_CENTER), 100);
    const formTimer = setTimeout(() => setAuthStage(AuthStage.AUTH_FORM), 2800);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(formTimer);
    };
  }, [isSuperAdminRoute, storedAdminSession, storedProfile]);

  useEffect(() => {
    const lang = userProfile.language || 'fa';
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
    document.body.className = `lang-${lang}`;
  }, [userProfile.language]);

  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatOpen]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type, visible: true });
  };

  const closeToast = () => setToast((prev) => ({ ...prev, visible: false }));

  const refreshStations = async () => {
    try {
      const data = await getStations();
      if (Array.isArray(data)) {
        setStations(data);
      }
    } catch (error) {
      console.warn('Stations refresh failed', error);
      showToast((error as any)?.message || 'دریافت ایستگاه‌ها ناموفق بود', 'error');
    }
  };

  const fetchActiveNotification = async () => {
    try {
        const notif = await getActiveNotification();
        setActiveNotification(notif);
    } catch (e) {
        console.warn('Notification fetch failed', e);
    }
  };

  const refreshProfileFromServer = async () => {
    if (!userProfile?.studentId || !userProfile?.nationalCode) return;
    try {
      const profile = await loginAPI(userProfile.studentId, userProfile.nationalCode);
      setUserProfile(profile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (error) {
      console.warn('Profile refresh failed', error);
    }
  };

  const refreshWalletTransactions = async () => {
    if (!userProfile?.studentId) return;
    try {
      const data = await getWalletTransactions(userProfile.studentId);
      if (Array.isArray(data)) setTransactions(data);
    } catch (error) {
      console.warn('Transactions refresh failed', error);
    }
  };

  const refreshTicketsFromServer = async () => {
    if (!userProfile?.studentId) return;
    try {
      const data = await getUserTickets(userProfile.studentId);
      if (Array.isArray(data)) setTickets(data);
    } catch (error) {
      console.warn('Tickets refresh failed', error);
    }
  };

  useEffect(() => {
    // Only fetch stations if we are not on the pure login route (to save requests)
    // or if we are already logged in
    refreshStations();
    // Fetch active notification on load
    fetchActiveNotification();
  }, []);

  useEffect(() => {
    if (authStage !== AuthStage.LOGGED_IN || !userProfile?.studentId) return;
    const refreshUserData = async () => {
      await refreshProfileFromServer();
      await Promise.all([refreshTicketsFromServer(), refreshWalletTransactions()]);
    };
    refreshUserData();
  }, [authStage, userProfile?.studentId]);

  useEffect(() => {
    if (view !== ViewState.WALLET) return;
    refreshProfileFromServer();
    refreshWalletTransactions();
  }, [view]);

  useEffect(() => {
    if (view !== ViewState.TICKETS) return;
    refreshTicketsFromServer();
  }, [view]);

  const handleRegister = async (name: string, studentId: string, nationalCode: string) => {
    try {
      const profile = await registerAPI(name, studentId, nationalCode);
      setUserProfile(profile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      setAuthStage(AuthStage.LOGGED_IN);
      showToast('ثبت نام با موفقیت انجام شد', 'success');
    } catch (error: any) {
      showToast(error?.message || 'ثبت نام ناموفق بود', 'error');
    }
  };

  const handleLogin = async (studentId: string, nationalCode: string) => {
    try {
      const profile = await loginAPI(studentId, nationalCode);
      setUserProfile(profile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      setAuthStage(AuthStage.LOGGED_IN);
      showToast('خوش آمدید', 'success');
    } catch (error: any) {
      showToast(error?.message || 'اطلاعات ورود صحیح نیست', 'error');
    }
  };

  const handleAdminLogin = async (u: string, p: string) => {
    try {
      const payload = await adminLoginAPI(u, p) as any;
      sessionStorage.setItem(ADMIN_STORAGE_KEY, 'true'); // Security: Use sessionStorage
      sessionStorage.setItem(ADMIN_AUTH_KEY, JSON.stringify({ role: payload?.role === 'analyst' ? 'analyst' : 'admin', username: payload?.username || '' }));
      setAdminRole(payload?.role === 'analyst' ? 'analyst' : 'admin');
      setView(ViewState.ADMIN_DASHBOARD);
      showToast(payload?.role === 'analyst' ? 'ورود تحلیل‌گر موفق بود' : 'ورود ادمین موفق بود', 'success');
      return;
    } catch {
      showToast('نام کاربری یا رمز عبور اشتباه است', 'error');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(ADMIN_STORAGE_KEY);
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    clearAuthTokens();
    
    setUserProfile(DEFAULT_USER_PROFILE);
    setTickets([]);
    setTransactions([]);

    if (isSuperAdminRoute) {
      setView(ViewState.ADMIN_LOGIN);
    } else {
      setAuthStage(AuthStage.AUTH_FORM);
      setView(ViewState.HOME);
    }
    showToast('خارج شدید', 'info');
  };

  const updateProfile = async (province: string, city: string, avatar: string, language: Language) => {
    try {
      const updatedProfile = { ...userProfile, province, city, avatar, language };
      setUserProfile(updatedProfile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProfile));
      await updateProfileAPI(userProfile.studentId, { province, city, avatar, language });
      showToast('پروفایل ذخیره شد', 'success');
    } catch (error) {
      console.error('Profile update error', error);
      showToast('ذخیره پروفایل ناموفق بود', 'error');
    }
  };

  const toggleTheme = () => setIsDarkMode((prev) => !prev);

  const goToService = (serviceId: string) => {
    if (serviceId === 'bus') {
      setView(ViewState.BUS);
      setBookingStage(BookingStage.IDLE);
      setOrigin('');
      setDestination('');
      setBusOptions([]);
    } else if (serviceId === 'tickets') setView(ViewState.TICKETS);
    else if (serviceId === 'wallet') setView(ViewState.WALLET);
    else if (serviceId === 'support') setView(ViewState.SUPPORT);
    else if (serviceId === 'feedback') setView(ViewState.FEEDBACK);
    else showToast('این بخش به زودی فعال می شود', 'info');
  };

  const goToProfile = () => setView(ViewState.PROFILE);
  const goHome = () => {
    setView(ViewState.HOME);
    setBookingStage(BookingStage.IDLE);
  };

  const updateStation = (stationId: string, type: 'origin' | 'destination') => {
    if (type === 'origin') {
      setOrigin(stationId);
      if (destination) fetchBuses(stationId, destination);
      return;
    }

    setDestination(stationId);
    if (origin) fetchBuses(origin, stationId);
  };

  const fetchBuses = async (fromId: string, toId: string) => {
    setBookingStage(BookingStage.SELECT_BUS);
    setLoadingSchedule(true);

    try {
      const options = await getBusSchedule(fromId, toId);
      setBusOptions(Array.isArray(options) ? options : []);
    } catch (error: any) {
      showToast(error?.message || 'دریافت برنامه سرویس ناموفق بود', 'error');
      setBusOptions([]);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const refreshSchedule = () => {
    if (origin && destination) {
        fetchBuses(origin, destination);
        showToast('لیست سرویس‌ها بروزرسانی شد', 'info');
    } else {
        refreshStations();
    }
  };

  const selectBus = (bus: BusOption) => {
    setSelectedBus(bus);
    setBookingStage(BookingStage.CONFIRMATION);
  };

  const confirmBooking = async (count: number = 1) => {
    if (!selectedBus) return;

    if (!userProfile?.studentId) {
        showToast('خطا در احراز هویت. لطفا مجدد وارد شوید.', 'error');
        return;
    }

    try {
      const result = await reserveTicket({
        student_id: userProfile.studentId,
        schedule_id: selectedBus.id,
        origin_station_id: origin,
        destination_station_id: destination,
        departure_time: selectedBus.departureTime,
        seatCount: count
      });

      const updatedProfile = { ...userProfile, balance: formatBalance(result.balance) };
      setUserProfile(updatedProfile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProfile));

      if (result?.transaction) setTransactions((prev) => [result.transaction, ...prev]);
      
      // If multiple tickets returned
      if (result?.tickets && Array.isArray(result.tickets)) {
          setTickets((prev) => [...result.tickets, ...prev]);
      } else if (result?.ticket) {
          setTickets((prev) => [result.ticket, ...prev]);
      }

      setBookingStage(BookingStage.TICKET_VIEW);
      showToast(`${count} بلیط با موفقیت رزرو شد`, 'success');
    } catch (error: any) {
      showToast(error?.message || 'رزرو بلیط انجام نشد', 'error');
    }
  };

  const resetBooking = () => {
    setBookingStage(BookingStage.SELECT_BUS);
    setSelectedBus(null);
  };

  const initiateRating = (ticketId: string) => setRatingTicketId(ticketId);

  const submitRating = async (rating: number, comment: string) => {
    if (!ratingTicketId) return;
    try {
      const updated = await submitTicketFeedback(ratingTicketId, { rating, comment });
      setTickets((prev) => prev.map((ticket) => (ticket.id === ratingTicketId ? { ...ticket, ...updated.ticket } : ticket)));
      setRatingTicketId(null);
      showToast('نظر شما ثبت شد', 'success');
      if (bookingStage === BookingStage.TICKET_VIEW) resetBooking();
    } catch (error: any) {
      showToast(error?.message || 'ثبت نظر ناموفق بود', 'error');
    }
  };

  const cancelRating = () => setRatingTicketId(null);

  const sendMessage = async () => {
    if (!inputMsg.trim()) return;
    const outgoing: ChatMessage = { role: 'user', text: inputMsg };
    setMessages((prev) => [...prev, outgoing]);
    setInputMsg('');
    setIsTyping(true);

    // AI Logic removed. Replaced with static response.
    setTimeout(() => {
        const reply = "پیام شما در سیستم ثبت شد. همکاران پشتیبانی به زودی پاسخ خواهند داد.";
        setMessages((prev) => [...prev, { role: 'model', text: reply }]);
        setIsTyping(false);
    }, 1000);
  };

  const locateUser = () => mapRef.current?.locateUser();

  return {
    state: {
      authStage,
      view,
      bookingStage,
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
      activeNotification
      ,
      adminRole
    },
    refs: { mapRef, chatEndRef },
    actions: {
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
      closeToast
    }
  };
};
