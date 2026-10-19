
import { useState, useRef, useEffect } from 'react';
import { ViewState, BookingStage, BusOption, ChatMessage, UserProfile, Ticket, Transaction, AuthStage, Language, ToastState, Station, AppNotification } from '../types';
import { adminLoginAPI, clearAuthTokens, getBusSchedule, getStations, getUserTickets, getWalletTransactions, getCurrentUserAPI, chatWithSupport, loginAPI, registerAPI, reserveTicket, submitTicketFeedback, updateProfileAPI, getActiveNotification } from '../services/apiService';
import { INITIAL_CHAT_MESSAGE, DEFAULT_USER_PROFILE, MOCK_TICKETS, MOCK_TRANSACTIONS } from '../constants';
import { MapRef } from '../components/MapVisual';
import { formatAmountFa } from '../utils/numberUtils';
const formatBalance = (amountRial: number): string => {
  const amountToman = Math.round(amountRial / 10);
  return `${formatAmountFa(amountToman)} تومان`;
};

const STORAGE_KEY = 'vira_user_profile';
const ADMIN_STORAGE_KEY = 'vira_admin_session';
const ADMIN_AUTH_KEY = 'vira_admin_auth_meta';

export const useSnappLogic = () => {
  const readJson = (storage: Storage, key: string) => {
    try { const value = JSON.parse(storage.getItem(key) || 'null'); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
    catch { storage.removeItem(key); return null; }
  };
  const [storedProfile] = useState(() => {
    const profile = readJson(localStorage, STORAGE_KEY);
    return profile?.studentId && localStorage.getItem('vira_user_auth_token') ? profile : null;
  });
  const [storedAdminSession] = useState(() => sessionStorage.getItem(ADMIN_STORAGE_KEY));
  const [storedAdminMeta] = useState(() => readJson(sessionStorage, ADMIN_AUTH_KEY));
  const isDriverRoute = /^\/(driver|deriver)(?:\/|$)/.test(window.location.pathname);
  const persistProfile = (profile: UserProfile) => {
    // Credentials are fetched with the session token and never persisted in profile cache.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...profile, nationalCode: '' }));
  };

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
    if (new URLSearchParams(window.location.search).has('topupTransactionId')) return ViewState.WALLET;
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
  const [bookingPending, setBookingPending] = useState(false);
  const [issuedTicket, setIssuedTicket] = useState<Ticket | null>(null);
  const purchaseBusy = useRef(false);
  const purchaseRequest = useRef<{ signature: string; key: string } | null>(null);
  const scheduleRequest = useRef(0);
  const sessionGeneration = useRef(0);
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
    const formTimer = setTimeout(() => setAuthStage(AuthStage.AUTH_FORM), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900);
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
    if (!userProfile?.studentId) return;
    const generation = sessionGeneration.current;
    try {
      const profile = await getCurrentUserAPI();
      if (generation !== sessionGeneration.current) return;
      setUserProfile(profile);
      persistProfile(profile);
    } catch (error) {
      if (generation !== sessionGeneration.current) return;
      if ([401, 403].includes((error as any)?.status)) handleLogout();
      else showToast((error as Error).message || 'اطلاعات حساب دریافت نشد.', 'error');
    }
  };

  const refreshWalletTransactions = async () => {
    if (!userProfile?.studentId) return;
    const generation = sessionGeneration.current;
    try {
      const data = await getWalletTransactions(userProfile.studentId);
      if (generation === sessionGeneration.current && Array.isArray(data)) setTransactions(data);
    } catch (error) {
      console.warn('Transactions refresh failed', error);
    }
  };

  const refreshTicketsFromServer = async () => {
    if (!userProfile?.studentId) return;
    const generation = sessionGeneration.current;
    try {
      const data = await getUserTickets(userProfile.studentId);
      if (generation === sessionGeneration.current && Array.isArray(data)) { setTickets(data); setIssuedTicket(previous => previous ? data.find(ticket => ticket.id === previous.id) || previous : null); }
    } catch (error) {
      console.warn('Tickets refresh failed', error);
    }
  };

  useEffect(() => {
    // Only fetch stations if we are not on the pure login route (to save requests)
    // or if we are already logged in
    if (isDriverRoute || isSuperAdminRoute) return;
    refreshStations();
    // Fetch active notification on load
    fetchActiveNotification();
  }, []);

  useEffect(() => {
    if (isDriverRoute || isSuperAdminRoute || authStage !== AuthStage.LOGGED_IN || !userProfile?.studentId) return;
    const refreshUserData = async () => {
      const generation = sessionGeneration.current;
      await refreshProfileFromServer();
      if (generation !== sessionGeneration.current) return;
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
    if (view !== ViewState.TICKETS && !(view === ViewState.BUS && bookingStage === BookingStage.TICKET_VIEW)) return;
    let pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try { await refreshTicketsFromServer(); } finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 15_000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [view, bookingStage]);

  const handleRegister = async (name: string, studentId: string, nationalCode: string) => {
    try {
      const profile = await registerAPI(name, studentId, nationalCode);
      sessionGeneration.current += 1;
      setUserProfile(profile);
      persistProfile(profile);
      setAuthStage(AuthStage.LOGGED_IN);
      showToast('ثبت نام با موفقیت انجام شد', 'success');
    } catch (error: any) {
      showToast(error?.message || 'ثبت نام ناموفق بود', 'error');
    }
  };

  const handleLogin = async (studentId: string, nationalCode: string) => {
    try {
      const profile = await loginAPI(studentId, nationalCode);
      sessionGeneration.current += 1;
      setUserProfile(profile);
      persistProfile(profile);
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
    sessionGeneration.current += 1;
    scheduleRequest.current += 1;
    purchaseRequest.current = null;
    purchaseBusy.current = false;
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(ADMIN_STORAGE_KEY);
    sessionStorage.removeItem(ADMIN_AUTH_KEY);
    clearAuthTokens();
    
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
    setMessages([{ role: 'model', text: INITIAL_CHAT_MESSAGE }]);

    if (isSuperAdminRoute) {
      setView(ViewState.ADMIN_LOGIN);
    } else {
      setAuthStage(AuthStage.AUTH_FORM);
      setView(ViewState.HOME);
    }
    showToast('خارج شدید', 'info');
  };

  const updateProfile = async (province: string, city: string, avatar: string, language: Language) => {
    const generation = sessionGeneration.current;
    try {
      const updatedProfile = { ...userProfile, province, city, avatar, language };
      await updateProfileAPI(userProfile.studentId, { province, city, avatar, language });
      if (generation !== sessionGeneration.current) return;
      setUserProfile(updatedProfile);
      persistProfile(updatedProfile);
      showToast('پروفایل ذخیره شد', 'success');
    } catch (error) {
      if (generation !== sessionGeneration.current) return;
      console.error('Profile update error', error);
      showToast((error as Error)?.message || 'ذخیره پروفایل ناموفق بود', 'error');
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
    const request = ++scheduleRequest.current;
    if (fromId === toId) { setBusOptions([]); setLoadingSchedule(false); showToast('مبدا و مقصد باید متفاوت باشند.', 'error'); return; }
    setBookingStage(BookingStage.SELECT_BUS);
    setLoadingSchedule(true);

    try {
      const options = await getBusSchedule(fromId, toId);
      if (request === scheduleRequest.current) setBusOptions(Array.isArray(options) ? options : []);
    } catch (error: any) {
      if (request === scheduleRequest.current) { showToast(error?.message || 'دریافت برنامه سرویس ناموفق بود', 'error'); setBusOptions([]); }
    } finally {
      if (request === scheduleRequest.current) setLoadingSchedule(false);
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
    if (!selectedBus || purchaseBusy.current) return;

    if (!userProfile?.studentId) {
        showToast('خطا در احراز هویت. لطفا مجدد وارد شوید.', 'error');
        return;
    }

    purchaseBusy.current = true; setBookingPending(true);
    const generation = sessionGeneration.current;
    const signature = JSON.stringify([selectedBus.id, origin, destination, count]);
    if (purchaseRequest.current?.signature !== signature) purchaseRequest.current = { signature, key: crypto.randomUUID() };
    try {
      const result = await reserveTicket({
        student_id: userProfile.studentId,
        schedule_id: selectedBus.id,
        origin_station_id: origin,
        destination_station_id: destination,
        departure_time: selectedBus.departureTime,
        seatCount: count
      }, purchaseRequest.current.key);
      if (generation !== sessionGeneration.current) return;

      const updatedProfile = { ...userProfile, balance: formatBalance(result.balance) };
      setUserProfile(updatedProfile);
      persistProfile(updatedProfile);

      if (result?.transaction) setTransactions((prev) => [result.transaction, ...prev]);
      
      // If multiple tickets returned
      if (result?.tickets && Array.isArray(result.tickets)) {
          setTickets((prev) => [...result.tickets, ...prev]);
      } else if (result?.ticket) {
          setTickets((prev) => [result.ticket, ...prev]);
      }

      setIssuedTicket(result.ticket || result.tickets?.[0] || null);
      purchaseRequest.current = null;
      setBookingStage(BookingStage.TICKET_VIEW);
      showToast(`${count} بلیط با موفقیت رزرو شد`, 'success');
    } catch (error: any) {
      if (generation !== sessionGeneration.current) return;
      showToast(error?.message || 'رزرو بلیط انجام نشد', 'error');
    } finally { if (generation === sessionGeneration.current) { purchaseBusy.current = false; setBookingPending(false); } }
  };

  const resetBooking = () => {
    setBookingStage(BookingStage.SELECT_BUS);
    setSelectedBus(null);
  };

  const initiateRating = (ticketId: string) => setRatingTicketId(ticketId);

  const submitRating = async (rating: number, comment: string) => {
    if (!ratingTicketId) return;
    const generation = sessionGeneration.current;
    try {
      const updated = await submitTicketFeedback(ratingTicketId, { rating, comment });
      if (generation !== sessionGeneration.current) return;
      setTickets((prev) => prev.map((ticket) => (ticket.id === ratingTicketId ? { ...ticket, ...updated.ticket } : ticket)));
      setRatingTicketId(null);
      showToast('نظر شما ثبت شد', 'success');
      if (bookingStage === BookingStage.TICKET_VIEW) resetBooking();
    } catch (error: any) {
      if (generation !== sessionGeneration.current) return;
      showToast(error?.message || 'ثبت نظر ناموفق بود', 'error');
    }
  };

  const cancelRating = () => setRatingTicketId(null);

  const sendMessage = async () => {
    if (!inputMsg.trim() || isTyping) return;
    const generation = sessionGeneration.current;
    const outgoing: ChatMessage = { role: 'user', text: inputMsg };
    setMessages((prev) => [...prev, outgoing]);
    setInputMsg('');
    setIsTyping(true);

    try {
      const reply = await chatWithSupport(messages.map(item => item.text), outgoing.text);
      if (generation !== sessionGeneration.current) return;
      setMessages(prev => [...prev, { role: 'model', text: reply }]);
    } catch {
      if (generation !== sessionGeneration.current) return;
      setMessages(prev => [...prev, { role: 'model', text: 'ارتباط برقرار نشد. برای پیگیری، از بخش پشتیبانی تیکت ثبت کنید.' }]);
    } finally { if (generation === sessionGeneration.current) setIsTyping(false); }
  };

  const locateUser = () => mapRef.current?.locateUser();

  return {
    state: {
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
