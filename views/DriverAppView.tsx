
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '../components/Icons';
import {
  DriverScanItem,
  DriverScheduleCard,
  DriverSession,
  driverLogin,
  driverScanCode,
  driverScanQr,
  getDriverDashboard,
  getDriverRecentScans,
  getDriverSummary,
  driverRegister,
  driverCreateRouteRequest,
  driverListRouteRequests,
  getStations,
  hasDriverAuthToken,
  getLegalContent
} from '../services/apiService';
import Toast from '../components/Toast';
import { addCommas, amountToPersianWordsToman, formatAmountFa, formatTomanFa, removeCommas, toEnglishDigits } from '../utils/numberUtils';
import StationSelect from '../components/StationSelect';
import type { DriverRouteRequest, Station } from '../types';

const DRIVER_STORAGE_KEY = 'vira_driver_session';

const DriverAppView: React.FC = () => {
  // Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<DriverSession | null>(null);
  const [error, setError] = useState('');

  // Dashboard Data
  const [summary, setSummary] = useState({ boardedCount: 0, totalRevenue: 0, serviceDate: '' });
  const [dashboardCards, setDashboardCards] = useState<DriverScheduleCard[]>([]);
  const [recentScans, setRecentScans] = useState<DriverScanItem[]>([]);
  const [codeInput, setCodeInput] = useState(''); // Dashboard input

  // Driver multi-page navigation
  const [driverPage, setDriverPage] = useState<'dashboard' | 'scan' | 'request' | 'profile'>('dashboard');

  // Route request page state
  const [routeStations, setRouteStations] = useState<Station[]>([]);
  const [routeOrigin, setRouteOrigin] = useState('');
  const [routeDestination, setRouteDestination] = useState('');
  const [routeTime, setRouteTime] = useState('');
  const [routePrice, setRoutePrice] = useState('50,000');
  const [routeRequests, setRouteRequests] = useState<DriverRouteRequest[]>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  
  // Registration State
  const [isRegistering, setIsRegistering] = useState(false);
  const [regStep, setRegStep] = useState(1);
  const [regData, setRegData] = useState({
    name: '',
    nationalCode: '',
    birthDay: '',
    birthMonth: '1',
    birthYear: '',
    phone: '',
    plate: { part1: '', part2: '', letter: 'ع', part3: '' },
    documents: { nationalCard: '', licenseCard: '', carCard: '' },
    regUsername: '',
    regPassword: ''
  });
  
  // Pending / Rejected Status View
  const [pendingMessage, setPendingMessage] = useState('');
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [showLegal, setShowLegal] = useState(false);
  const [legalContent, setLegalContent] = useState('در حال دریافت قوانین...');
  const [legalLoading, setLegalLoading] = useState(false);
  
  // Scanner State
  const [showScanner, setShowScanner] = useState(false);
  const [scannerMode, setScannerMode] = useState<'camera' | 'manual'>('camera');
  const [manualScannerInput, setManualScannerInput] = useState('');
  const [cameraLoading, setCameraLoading] = useState(false);
  const [scanStatus, setScanStatus] = useState<{
    type: 'idle' | 'loading' | 'success' | 'error';
    title: string;
    detail?: string;
  }>({ type: 'idle', title: '' });

  // Custom Toast State for Driver View
  const [toast, setToast] = useState({ message: '', type: 'info' as 'success' | 'error' | 'info', visible: false });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<any>(null);
  const isProcessingScanRef = useRef(false);
  const lastScanValueRef = useRef<string>('');
  const lastScanAtRef = useRef<number>(0);
  const manualInputRef = useRef<HTMLInputElement>(null);

  const canUseBarcodeDetector = useMemo(() => typeof window !== 'undefined' && 'BarcodeDetector' in window, []);

  // Restore session on mount
  useEffect(() => {
    const stored = localStorage.getItem(DRIVER_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.status === 'active' && hasDriverAuthToken()) {
            setSession(parsed);
            refreshData(parsed.id);
        } else {
            localStorage.removeItem(DRIVER_STORAGE_KEY);
        }
      } catch (e) {
        localStorage.removeItem(DRIVER_STORAGE_KEY);
      }
    }
  }, []);

  const showDriverToast = (msg: string, type: 'success' | 'error') => {
    setToast({ message: msg, type, visible: true });
  };

  const closeToast = () => setToast(prev => ({ ...prev, visible: false }));

  const refreshData = async (driverId: string) => {
    try {
      const [summaryData, scansData, dashboardData] = await Promise.all([
        getDriverSummary(driverId),
        getDriverRecentScans(driverId),
        getDriverDashboard(driverId)
      ]);
      setSummary(summaryData);
      setRecentScans(scansData);
      setDashboardCards(dashboardData);
    } catch (e: any) {
      if (String(e?.message || '').includes('ورود به حساب کاربری الزامی است')) {
        handleLogout();
        setError('نشست شما منقضی شده است. لطفاً دوباره وارد شوید.');
        return;
      }
      console.error(e);
    }
  };

  const loadRouteRequestData = async () => {
    if (!session) return;
    setRouteLoading(true);
    try {
      const [stationsData, requestsData] = await Promise.all([
        getStations(),
        driverListRouteRequests()
      ]);
      setRouteStations(stationsData);
      setRouteRequests(requestsData);
    } catch (e) {
      console.error(e);
      showDriverToast('خطا در دریافت اطلاعات درخواست مسیر', 'error');
    } finally {
      setRouteLoading(false);
    }
  };

  useEffect(() => {
    if (!session) return;
    if (driverPage === 'request') loadRouteRequestData();
  }, [driverPage, session]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPendingMessage('');
    const normalizedUser = toEnglishDigits(username).trim();
    const normalizedPass = toEnglishDigits(password).trim();
    if (!normalizedUser || normalizedUser.length < 3) {
      setError('نام کاربری معتبر (حداقل ۳ کاراکتر) وارد کنید.');
      return;
    }
    if (!normalizedPass || normalizedPass.length < 4) {
      setError('رمز عبور معتبر (حداقل ۴ کاراکتر) وارد کنید.');
      return;
    }

    try {
      const data: any = await driverLogin(normalizedUser, normalizedPass);
      
      if (data.status === 'pending') {
          setPendingMessage(data.message);
          return;
      }

      if (data.status === 'rejected') {
          // Pre-fill form
          const old = data.data;
          let bDay = '', bMonth = '1', bYear = '';
          if (old.birthDate) {
             const parts = old.birthDate.split('/');
             if (parts.length === 3) { bYear = parts[0]; bMonth = parts[1]; bDay = parts[2]; }
          }

          // Safely handle plate data (parse if string)
          let safePlate = old.plateData;
          if (typeof safePlate === 'string') {
             try { safePlate = JSON.parse(safePlate); } catch {}
          }
          if (!safePlate || typeof safePlate !== 'object') {
             safePlate = { part1: '', part2: '', letter: 'ع', part3: '' };
          }
          if (!safePlate.letter) safePlate.letter = 'ع';

          // Safely handle documents (parse if string)
          let safeDocs = old.documents;
          if (typeof safeDocs === 'string') {
             try { safeDocs = JSON.parse(safeDocs); } catch {}
          }
          if (!safeDocs || typeof safeDocs !== 'object') {
             safeDocs = { nationalCard: '', licenseCard: '', carCard: '' };
          }

          setRegData({
              name: old.name || '',
              nationalCode: old.nationalCode || '',
              birthDay: bDay,
              birthMonth: bMonth,
              birthYear: bYear,
              phone: old.phone || '',
              plate: safePlate,
              documents: safeDocs,
              regUsername: old.username || normalizedUser,
              regPassword: normalizedPass
          });
          
          setError(`درخواست قبلی شما رد شد. علت: ${data.reason}`);
          setIsRegistering(true);
          setRegStep(1);
          return;
      }

      // Active
      setSession(data);
      localStorage.setItem(DRIVER_STORAGE_KEY, JSON.stringify(data));
      await refreshData(data.id);
    } catch (err: any) {
      setError(err?.message || 'ورود ناموفق بود');
    }
  };

  const handleLogout = () => {
    setSession(null);
    localStorage.removeItem(DRIVER_STORAGE_KEY);
    setUsername('');
    setPassword('');
    setIsRegistering(false);
    setPendingMessage('');
  };

  // --- Registration Logic ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    if (e.target.files && e.target.files[0]) {
        // Limit size 3MB
        if (e.target.files[0].size > 3 * 1024 * 1024) {
            showDriverToast('حجم فایل باید کمتر از ۳ مگابایت باشد', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            setRegData(prev => ({
                ...prev,
                documents: { ...prev.documents, [docType]: ev.target?.result }
            }));
        };
        reader.readAsDataURL(e.target.files[0]);
    }
  };

  const submitRegistration = async () => {
      if (registerSubmitting) return;
      const normalizedUsername = toEnglishDigits(regData.regUsername).trim();
      const normalizedPassword = toEnglishDigits(regData.regPassword).trim();
      const normalizedPhone = toEnglishDigits(regData.phone).trim();
      const normalizedNationalCode = toEnglishDigits(regData.nationalCode).trim();
      if (!normalizedUsername || normalizedUsername.length < 3) {
          showDriverToast('نام کاربری معتبر (حداقل ۳ کاراکتر) وارد کنید', 'error');
          return;
      }
      if (!normalizedPassword || normalizedPassword.length < 4) {
          showDriverToast('رمز عبور معتبر (حداقل ۴ کاراکتر) وارد کنید', 'error');
          return;
      }
      if (!normalizedNationalCode || normalizedNationalCode.length !== 10) {
          showDriverToast('کد ملی باید ۱۰ رقم باشد', 'error');
          return;
      }
      if (normalizedPhone && normalizedPhone.length < 11) {
          showDriverToast('شماره موبایل معتبر وارد کنید', 'error');
          return;
      }
      setRegisterSubmitting(true);
      try {
          const birthDate = `${regData.birthYear}/${regData.birthMonth}/${regData.birthDay}`;
          await driverRegister({
              name: regData.name,
              nationalCode: normalizedNationalCode,
              birthDate,
              phone: normalizedPhone,
              plateData: regData.plate,
              documents: regData.documents,
              username: normalizedUsername,
              password: normalizedPassword
          });
          setPendingMessage('درخواست شما با موفقیت ثبت شد. کارشناسان ما مدارک شما را بررسی کرده و نتیجه را تا ۱۲ ساعت آینده از طریق همین سامانه به اطلاع شما خواهند رساند.');
          setIsRegistering(false);
          setRegStep(1);
      } catch (err: any) {
          setError(err.message || 'خطا در ثبت درخواست');
      } finally {
          setRegisterSubmitting(false);
      }
  };

  const openLegal = async () => {
    setShowLegal(true);
    setLegalLoading(true);
    try {
      const data = await getLegalContent('driver');
      setLegalContent(data?.content || 'متنی برای قوانین راننده ثبت نشده است.');
    } catch (error: any) {
      setLegalContent(error?.message || 'دریافت قوانین ناموفق بود.');
    } finally {
      setLegalLoading(false);
    }
  };

  const submitRouteRequest = async () => {
    if (!session) return;
    const priceNum = removeCommas(routePrice);
    if (!routeOrigin || !routeDestination || !routeTime || !Number.isFinite(priceNum) || priceNum <= 0) {
      showDriverToast('لطفا تمام موارد را تکمیل کنید', 'error');
      return;
    }
    if (routeOrigin === routeDestination) {
      showDriverToast('مبدا و مقصد نمی‌توانند یکسان باشند', 'error');
      return;
    }
    try {
      await driverCreateRouteRequest({
        originStationId: routeOrigin,
        destinationStationId: routeDestination,
        departureTime: routeTime,
        priceToman: priceNum
      });
      showDriverToast('درخواست مسیر ثبت شد', 'success');
      setRouteOrigin('');
      setRouteDestination('');
      setRouteTime('');
      setRoutePrice('50,000');
      await loadRouteRequestData();
    } catch (e: any) {
      showDriverToast(e?.message || 'ثبت درخواست ناموفق بود', 'error');
    }
  };

  // --- Scanner Logic ---
  const processQrText = async (value: string) => {
    if (!session) return;
    try {
      setScanStatus({ type: 'loading', title: 'در حال بررسی بلیط...' });
      const scan = await driverScanQr(session.id, value.trim());
      setScanStatus({
        type: 'success',
        title: 'بلیط تایید شد',
        detail: `${scan.passengerName} | کد ${scan.validationCode || '----'}`
      });
      showDriverToast(`مسافر تایید شد: ${scan.passengerName}`, 'success');
      await refreshData(session.id);
    } catch (err: any) {
      setScanStatus({
        type: 'error',
        title: 'اسکن ناموفق بود',
        detail: err?.message || 'کد بلیط معتبر نیست'
      });
      showDriverToast(err?.message || 'اسکن نامعتبر', 'error');
    }
  };

  const processCode = async (value: string, source: 'dashboard' | 'overlay') => {
    if (!session) return;
    try {
      setScanStatus({ type: 'loading', title: 'در حال بررسی بلیط...' });
      const scan = await driverScanCode(session.id, value);
      setScanStatus({
        type: 'success',
        title: 'بلیط تایید شد',
        detail: `${scan.passengerName} | کد ${scan.validationCode || '----'}`
      });
      showDriverToast(`مسافر تایید شد: ${scan.passengerName}`, 'success');
      
      if (source === 'dashboard') setCodeInput('');
      else setManualScannerInput(''); // Keep overlay input clean
      
      await refreshData(session.id);
    } catch (err: any) {
      setScanStatus({
        type: 'error',
        title: 'اسکن ناموفق بود',
        detail: err?.message || 'کد بلیط معتبر نیست'
      });
      showDriverToast(err?.message || 'کد نامعتبر', 'error');
      if (source === 'dashboard') setCodeInput('');
      else setManualScannerInput('');
    }
  };

  const openScanner = () => {
      setScanStatus({ type: 'idle', title: '' });
      if (!canUseBarcodeDetector) {
          setScannerMode('manual');
          setShowScanner(true);
          return;
      }
      setScannerMode('camera');
      setShowScanner(true);
  };

  const closeScanner = () => {
      setShowScanner(false);
      setManualScannerInput('');
      setScanStatus({ type: 'idle', title: '' });
  };

  // Handle Camera Logic
  useEffect(() => {
    if (!showScanner || !session || scannerMode !== 'camera' || !canUseBarcodeDetector) {
        if (intervalRef.current) { window.clearInterval(intervalRef.current); intervalRef.current = null; }
        if (streamRef.current) { streamRef.current.getTracks().forEach((track) => track.stop()); streamRef.current = null; }
        setCameraLoading(false);
        return;
    }

    setCameraLoading(true);
    let detector: any;
    
    const start = async () => {
      try {
        const BarcodeDetectorClass = (window as any).BarcodeDetector;
        detector = new BarcodeDetectorClass({ formats: ['qr_code'] });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        streamRef.current = stream;
        
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            // Wait for video to be ready
            videoRef.current.onloadedmetadata = () => {
                videoRef.current?.play().then(() => {
                    setCameraLoading(false);
                });
            };
        }
        
        intervalRef.current = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
          try {
            const results = await detector.detect(videoRef.current);
            if (results && results.length > 0 && results[0].rawValue) {
              const raw = String(results[0].rawValue || '').trim();
              const now = Date.now();
              // Cooldown + de-dup to avoid repeated scans / freezes
              if (!raw) return;
              if (isProcessingScanRef.current) return;
              if (raw === lastScanValueRef.current && (now - lastScanAtRef.current) < 2500) return;
              isProcessingScanRef.current = true;
              lastScanValueRef.current = raw;
              lastScanAtRef.current = now;
              try {
                await processQrText(raw);
                // Keep scanner open but prevent immediate re-scan
              } finally {
                window.setTimeout(() => { isProcessingScanRef.current = false; }, 800);
              }
            }
          } catch {}
        }, 350); 
      } catch (e) {
          console.error("Camera error", e);
          const errName = (e as any)?.name || '';
          if (errName === 'NotAllowedError') showDriverToast("مجوز دوربین داده نشد", "error");
          else if (errName === 'NotFoundError') showDriverToast("دوربینی یافت نشد", "error");
          else showDriverToast("خطا در دسترسی به دوربین", "error");
          setScannerMode('manual'); // Auto switch to manual on error
      }
    };
    start();

    return () => {
      if (intervalRef.current) { window.clearInterval(intervalRef.current); intervalRef.current = null; }
      if (streamRef.current) { streamRef.current.getTracks().forEach((track) => track.stop()); streamRef.current = null; }
    };
  }, [showScanner, session, canUseBarcodeDetector, scannerMode]);

  // Handle Dashboard Input
  useEffect(() => {
    const normalized = toEnglishDigits(codeInput);
    const cleaned = normalized.replace(/\D/g, '').slice(0, 4);
    if (cleaned !== codeInput) { setCodeInput(cleaned); return; }
    if (cleaned.length === 4 && session) processCode(cleaned, 'dashboard');
  }, [codeInput, session]);

  // Handle Overlay Manual Input Focus
  useEffect(() => {
    if (scannerMode === 'manual' && showScanner) {
        // Auto focus with a slight delay to ensure render
        const timer = setTimeout(() => {
            manualInputRef.current?.focus();
        }, 150);
        return () => clearTimeout(timer);
    }
  }, [scannerMode, showScanner]);

  // Handle Overlay Manual Input Logic
  useEffect(() => {
    const normalized = toEnglishDigits(manualScannerInput);
    const cleaned = normalized.replace(/\D/g, '').slice(0, 4);
    if (cleaned !== manualScannerInput) { setManualScannerInput(cleaned); return; }
    
    if (cleaned.length === 4 && session) {
        processCode(cleaned, 'overlay');
    }
  }, [manualScannerInput, session]);


  // --- Render Views ---

  if (pendingMessage) { return (
        <div className="flex justify-center bg-gray-50 min-h-screen w-full font-sans items-center px-6 py-10" dir="rtl">
            <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md text-center border border-gray-100 w-full">
                <div className="w-20 h-20 bg-yellow-50 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-6"><Icons.Clock size={40} /></div>
                <h2 className="text-xl font-black text-gray-800 mb-4">وضعیت: در حال بررسی</h2>
                <p className="text-gray-500 leading-7 text-sm mb-8 text-justify">{pendingMessage}</p>
                <button onClick={() => setPendingMessage('')} className="text-blue-600 font-bold text-sm bg-blue-50 px-6 py-3 rounded-xl w-full hover:bg-blue-100 transition-colors">بازگشت</button>
            </div>
        </div>
  ); }

  if (isRegistering) { 
    return (
        <div className="flex justify-center bg-gray-50 min-h-screen w-full font-sans transition-colors duration-300" dir="rtl">
            <div className="w-full max-w-md bg-white shadow-xl relative flex flex-col h-full overflow-y-auto">
                <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={closeToast} duration={3000} />
                {/* Header */}
                <div className="p-4 border-b flex items-center gap-3 sticky top-0 bg-white z-10">
                    <button onClick={() => { setIsRegistering(false); setRegStep(1); setError(''); }} className="p-2 hover:bg-gray-100 rounded-full">
                        <Icons.ArrowRight size={20} />
                    </button>
                    <h2 className="font-bold text-gray-800">ثبت نام راننده جدید</h2>
                </div>

                <div className="p-6 space-y-6 pb-20">
                    {/* Rejection Message - Visible on Step 1 */}
                    {regStep === 1 && error && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3 animate-in fade-in">
                            <Icons.AlertTriangle className="text-red-500 shrink-0" />
                            <div>
                                <h4 className="text-red-700 font-bold text-sm">درخواست شما رد شده است</h4>
                                <p className="text-red-600 text-xs mt-1 leading-5">{error.replace('درخواست قبلی شما رد شد. علت: ', '')}</p>
                            </div>
                        </div>
                    )}

                    {/* Steps Indicator (3 Steps) */}
                    <div className="flex items-center gap-2 mb-6">
                        <div className={`flex-1 h-2 rounded-full transition-colors ${regStep >= 1 ? 'bg-vira-primary' : 'bg-gray-200'}`}></div>
                        <div className={`flex-1 h-2 rounded-full transition-colors ${regStep >= 2 ? 'bg-vira-primary' : 'bg-gray-200'}`}></div>
                        <div className={`flex-1 h-2 rounded-full transition-colors ${regStep >= 3 ? 'bg-vira-primary' : 'bg-gray-200'}`}></div>
                    </div>

                    {/* Step 1: Personal Info */}
                    {regStep === 1 && (
                        <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                            <h3 className="font-bold text-lg text-gray-700">اطلاعات فردی و خودرو</h3>
                            
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500">نام و نام خانوادگی</label>
                                <input 
                                    value={regData.name}
                                    onChange={e => setRegData({...regData, name: e.target.value})}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-vira-primary text-sm"
                                    placeholder="مثال: علی محمدی"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500">کد ملی</label>
                                <input 
                                    value={regData.nationalCode}
                                    onChange={e => setRegData({...regData, nationalCode: toEnglishDigits(e.target.value)})}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-vira-primary text-sm dir-ltr text-right"
                                    placeholder="0012345678"
                                    inputMode="numeric"
                                    maxLength={10}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500">تاریخ تولد</label>
                                <div className="flex gap-2">
                                    <input 
                                        value={regData.birthDay}
                                        onChange={e => setRegData({...regData, birthDay: toEnglishDigits(e.target.value)})}
                                        placeholder="روز"
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-vira-primary text-sm text-center"
                                        maxLength={2}
                                        inputMode="numeric"
                                    />
                                    <select 
                                        value={regData.birthMonth}
                                        onChange={e => setRegData({...regData, birthMonth: e.target.value})}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-vira-primary text-sm text-center appearance-none"
                                    >
                                        {Array.from({length: 12}, (_, i) => <option key={i} value={i+1}>{['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'][i]}</option>)}
                                    </select>
                                    <input 
                                        value={regData.birthYear}
                                        onChange={e => setRegData({...regData, birthYear: toEnglishDigits(e.target.value)})}
                                        placeholder="سال"
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-vira-primary text-sm text-center"
                                        maxLength={4}
                                        inputMode="numeric"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500">شماره موبایل</label>
                                <input 
                                    value={regData.phone}
                                    onChange={e => setRegData({...regData, phone: toEnglishDigits(e.target.value)})}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-vira-primary text-sm dir-ltr text-right"
                                    placeholder="0912..."
                                    inputMode="tel"
                                    maxLength={11}
                                />
                            </div>

                            <div className="space-y-1 pt-2">
                                <label className="text-xs font-bold text-gray-500">شماره پلاک</label>
                                <div className="flex items-center bg-white border border-gray-300 rounded-xl overflow-hidden h-14 dir-ltr shadow-sm focus-within:border-vira-primary focus-within:ring-1 focus-within:ring-vira-primary transition-all" dir="ltr">
                                    {/* Blue Strip */}
                                    <div className="w-10 bg-[#003399] h-full flex flex-col items-center justify-center pt-1 shrink-0">
                                        <div className="w-6 h-4 flex flex-col rounded-[2px] overflow-hidden mb-0.5 shadow-sm">
                                            <div className="h-1/3 bg-[#239f40]"></div>
                                            <div className="h-1/3 bg-white"></div>
                                            <div className="h-1/3 bg-[#da0000]"></div>
                                        </div>
                                        <span className="text-[6px] font-bold text-white leading-tight">I.R.</span>
                                        <span className="text-[6px] font-bold text-white leading-tight">IRAN</span>
                                    </div>

                                    {/* Part 1 (2 digits) */}
                                    <input
                                        value={regData.plate.part1}
                                        onChange={e => {
                                            const val = toEnglishDigits(e.target.value).replace(/\D/g, '').slice(0, 2);
                                            setRegData({...regData, plate: {...regData.plate, part1: val}});
                                        }}
                                        className="w-10 h-full text-center text-2xl font-bold text-gray-800 outline-none bg-transparent"
                                        placeholder="11"
                                        inputMode="numeric"
                                    />

                                    {/* Letter */}
                                    <div className="relative h-full flex items-center justify-center w-10">
                                        <select
                                            value={regData.plate.letter || 'ع'}
                                            onChange={e => setRegData({...regData, plate: {...regData.plate, letter: e.target.value}})}
                                            className="w-full h-full text-center font-bold text-xl text-gray-800 appearance-none bg-transparent outline-none pb-1 cursor-pointer"
                                            style={{ textAlignLast: 'center' }}
                                        >
                                            {['الف','ب','پ','ت','ث','ج','چ','ح','خ','د','ذ','ر','ز','ژ','س','ش','ص','ض','ط','ظ','ع','غ','ف','ق','ک','گ','ل','م','ن','و','ه','ی'].map(l => (
                                                <option key={l} value={l}>{l}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Part 2 (3 digits) */}
                                    <input
                                        value={regData.plate.part2}
                                        onChange={e => {
                                            const val = toEnglishDigits(e.target.value).replace(/\D/g, '').slice(0, 3);
                                            setRegData({...regData, plate: {...regData.plate, part2: val}});
                                        }}
                                        className="w-14 h-full text-center text-2xl font-bold text-gray-800 outline-none bg-transparent"
                                        placeholder="345"
                                        inputMode="numeric"
                                    />

                                    {/* Divider */}
                                    <div className="w-[2px] h-full bg-black"></div>

                                    {/* Region Code (2 digits) */}
                                    <div className="flex-1 flex flex-col items-center justify-center h-full bg-white">
                                        <span className="text-[10px] font-bold text-gray-800 mb-[-2px] mt-1">ایران</span>
                                        <input
                                            value={regData.plate.part3}
                                            onChange={e => {
                                                const val = toEnglishDigits(e.target.value).replace(/\D/g, '').slice(0, 2);
                                                setRegData({...regData, plate: {...regData.plate, part3: val}});
                                            }}
                                            className="w-full h-full text-center text-2xl font-bold text-gray-800 outline-none bg-transparent pb-1"
                                            placeholder="67"
                                            inputMode="numeric"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={() => {
                                    if(regData.name && regData.nationalCode && regData.birthYear && regData.phone && regData.plate.part1 && regData.plate.part2 && regData.plate.part3) setRegStep(2);
                                    else showDriverToast('لطفا تمام موارد را تکمیل کنید', 'error');
                                }}
                                className="w-full bg-vira-primary text-white py-3 rounded-xl font-bold mt-4 shadow-lg shadow-vira-accent/50"
                            >
                                مرحله بعد
                            </button>
                        </div>
                    )}

                    {/* Step 2: Documents (Refactored to single responsibility) */}
                    {regStep === 2 && (
                        <div className="space-y-4 animate-in slide-in-from-right-4 duration-300 flex flex-col h-full">
                            <h3 className="font-bold text-lg text-gray-700 mb-2">بارگذاری مدارک</h3>

                            <div className="space-y-3 flex-1 overflow-y-auto px-1 py-2 custom-scrollbar">
                                {/* National Card Box */}
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-700 text-right block pr-1">تصویر کارت ملی</label>
                                    <div className="relative w-full h-32 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden cursor-pointer hover:bg-gray-100 hover:border-vira-primary/50 transition-all">
                                        {(regData.documents as any)['nationalCard'] ? (
                                            <img src={(regData.documents as any)['nationalCard']} className="w-full h-full object-cover" alt="National Card" />
                                        ) : (
                                            <div className="text-center p-4">
                                                <Icons.UploadCloud size={28} className="mx-auto text-gray-400 mb-2" />
                                                <span className="text-[10px] text-gray-400 block font-medium">برای بارگذاری کلیک کنید</span>
                                            </div>
                                        )}
                                        <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleFileChange(e, 'nationalCard')} />
                                    </div>
                                </div>

                                {/* License Card Box */}
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-700 text-right block pr-1">تصویر گواهینامه</label>
                                    <div className="relative w-full h-32 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden cursor-pointer hover:bg-gray-100 hover:border-vira-primary/50 transition-all">
                                        {(regData.documents as any)['licenseCard'] ? (
                                            <img src={(regData.documents as any)['licenseCard']} className="w-full h-full object-cover" alt="License Card" />
                                        ) : (
                                            <div className="text-center p-4">
                                                <Icons.UploadCloud size={28} className="mx-auto text-gray-400 mb-2" />
                                                <span className="text-[10px] text-gray-400 block font-medium">برای بارگذاری کلیک کنید</span>
                                            </div>
                                        )}
                                        <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleFileChange(e, 'licenseCard')} />
                                    </div>
                                </div>

                                {/* Car Card Box */}
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-700 text-right block pr-1">تصویر کارت خودرو</label>
                                    <div className="relative w-full h-32 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden cursor-pointer hover:bg-gray-100 hover:border-vira-primary/50 transition-all">
                                        {(regData.documents as any)['carCard'] ? (
                                            <img src={(regData.documents as any)['carCard']} className="w-full h-full object-cover" alt="Car Card" />
                                        ) : (
                                            <div className="text-center p-4">
                                                <Icons.UploadCloud size={28} className="mx-auto text-gray-400 mb-2" />
                                                <span className="text-[10px] text-gray-400 block font-medium">برای بارگذاری کلیک کنید</span>
                                            </div>
                                        )}
                                        <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => handleFileChange(e, 'carCard')} />
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-4 pt-2 border-t border-gray-100">
                                <button 
                                    onClick={() => setRegStep(1)}
                                    className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold"
                                >
                                    قبلی
                                </button>
                                <button 
                                    onClick={() => {
                                        // Basic check if documents are uploaded
                                        if (regData.documents.nationalCard && regData.documents.licenseCard && regData.documents.carCard) {
                                            setRegStep(3);
                                        } else {
                                            showDriverToast('لطفا همه مدارک را بارگذاری کنید', 'error');
                                        }
                                    }}
                                    className="flex-[2] bg-vira-primary text-white py-3 rounded-xl font-bold shadow-lg shadow-vira-accent/50"
                                >
                                    مرحله بعد
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Account Credentials & Submit */}
                    {regStep === 3 && (
                        <div className="space-y-4 animate-in slide-in-from-right-4 duration-300">
                            <h3 className="font-bold text-lg text-gray-700">اطلاعات حساب کاربری</h3>
                            <p className="text-xs text-gray-500 mb-4">لطفا نام کاربری و رمز عبور دلخواه خود را وارد کنید. از این اطلاعات برای ورود به پنل رانندگان استفاده خواهد شد.</p>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500">نام کاربری (انگلیسی)</label>
                                <input 
                                    value={regData.regUsername}
                                    onChange={e => setRegData({...regData, regUsername: toEnglishDigits(e.target.value)})}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-vira-primary text-sm dir-ltr"
                                    placeholder="username"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500">رمز عبور</label>
                                <input 
                                    type="password"
                                    value={regData.regPassword}
                                    onChange={e => setRegData({...regData, regPassword: toEnglishDigits(e.target.value)})}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-vira-primary text-sm dir-ltr"
                                    placeholder="password"
                                />
                            </div>

                            <div className="flex gap-3 mt-8">
                                <button 
                                    onClick={() => setRegStep(2)}
                                    className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold"
                                >
                                    قبلی
                                </button>
                                <button 
                                    onClick={submitRegistration}
                                    disabled={registerSubmitting}
                                    className={`flex-[2] py-3 rounded-xl font-bold shadow-lg shadow-vira-accent/50 ${registerSubmitting ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-vira-primary text-white'}`}
                                >
                                    {registerSubmitting ? 'در حال ثبت...' : 'ثبت نام نهایی'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
  }

  if (!session) { return (
      <div className="flex justify-center bg-gray-50 h-screen w-full font-sans transition-colors duration-300" dir="rtl">
        <div className="w-full max-w-md h-full relative overflow-hidden flex flex-col bg-white shadow-xl">
           <div className="bg-vira-primary/10 h-[35vh] relative flex flex-col items-center justify-center rounded-b-[40px] px-6">
              <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-lg shadow-green-100 mb-4"><Icons.Car className="text-vira-primary w-10 h-10" /></div>
              <h2 className="text-2xl font-black text-gray-800 mb-2">پنل رانندگان</h2>
           </div>
           <div className="flex-1 px-8 -mt-8">
              <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 p-6">
                 <form onSubmit={handleLogin} noValidate className="space-y-4">
                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center"><Icons.User className="text-gray-400 ml-3" size={20} /><input type="text" placeholder="نام کاربری" className="bg-transparent w-full text-sm font-bold text-gray-800 outline-none" value={username} onChange={(e) => setUsername(toEnglishDigits(e.target.value))} inputMode="text" autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="username" /></div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center"><Icons.Lock className="text-gray-400 ml-3" size={20} /><input type="password" placeholder="رمز عبور" className="bg-transparent w-full text-sm font-bold text-gray-800 outline-none" value={password} onChange={(e) => setPassword(toEnglishDigits(e.target.value))} autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="current-password" /></div>
                    {error && <div className="text-red-500 text-xs font-bold text-center">{error}</div>}
                    <button type="submit" className="w-full bg-vira-primary text-white font-bold text-lg py-4 rounded-xl shadow-lg hover:bg-vira-secondary transition-all mt-6">ورود به پنل</button>
                 </form>
                 
                 <div className="mt-6 pt-4 border-t border-gray-100 text-center">
                    <button 
                        onClick={() => { setIsRegistering(true); setRegStep(1); setError(''); }}
                        className="text-sm font-bold text-gray-500 hover:text-vira-primary transition-colors flex items-center justify-center gap-2 mx-auto"
                    >
                        <span>حساب کاربری ندارید؟</span>
                        <span className="text-vira-primary underline">ثبت نام راننده</span>
                    </button>
                    <button type="button" onClick={openLegal} className="block mx-auto mt-4 text-xs text-vira-primary underline underline-offset-2">قوانین و مقررات رانندگان</button>
                 </div>
              </div>
           </div>
        </div>
        {showLegal && (
          <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center">
            <div className="absolute inset-0" onClick={() => setShowLegal(false)} />
            <div className="relative z-10 bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[75vh] overflow-hidden border border-gray-200">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="font-black text-gray-800">قوانین و مقررات راننده</div>
                <button type="button" onClick={() => setShowLegal(false)} className="p-2 rounded-xl bg-gray-100 text-gray-600"><Icons.X size={16} /></button>
              </div>
              <div className="p-4 overflow-y-auto text-sm leading-7 whitespace-pre-wrap text-gray-700">
                {legalLoading ? 'در حال دریافت...' : legalContent}
              </div>
            </div>
          </div>
        )}
      </div>
  ); }

  return (
    <div className="h-screen w-full overflow-hidden bg-gray-50 text-gray-800 relative" dir="rtl">
      
      {/* Toast - Rendered here to be accessible generally */}
      {!showScanner && <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={closeToast} duration={3000} />}

      {/* FULL SCREEN SCANNER OVERLAY */}
      {showScanner && (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center animate-in fade-in duration-300">
              {/* Internal Toast for Overlay - High Z-Index */}
              <div className="absolute top-0 w-full z-[120] flex justify-center pt-6 pointer-events-none">
                  <Toast message={toast.message} type={toast.type} visible={toast.visible} onClose={closeToast} duration={2500} />
              </div>

              <button 
                  onClick={closeScanner}
                  className="absolute top-6 right-6 z-50 bg-white/20 p-3 rounded-full text-white hover:bg-white/40 backdrop-blur-md transition-colors"
              >
                  <Icons.X size={24} />
              </button>
              
              {scannerMode === 'camera' ? (
                  <div className="relative w-full h-full flex flex-col">
                      <div className="flex-1 relative overflow-hidden bg-black">
                          {cameraLoading && (
                              <div className="absolute inset-0 flex items-center justify-center text-white/50 gap-2">
                                  <div className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"></div>
                                  <span>راه‌اندازی دوربین...</span>
                              </div>
                          )}
                          {scanStatus.type !== 'idle' && (
                            <div className={`absolute top-6 left-1/2 -translate-x-1/2 z-20 max-w-[92vw] rounded-2xl px-4 py-3 text-center shadow-xl backdrop-blur border ${
                              scanStatus.type === 'success'
                                ? 'bg-emerald-500/90 text-white border-emerald-300'
                                : scanStatus.type === 'error'
                                  ? 'bg-red-500/90 text-white border-red-300'
                                  : 'bg-black/70 text-white border-white/10'
                            }`}>
                              <div className="font-black text-sm">{scanStatus.title}</div>
                              {scanStatus.detail && <div className="mt-1 text-[11px] opacity-90">{scanStatus.detail}</div>}
                            </div>
                          )}
                          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
                          
                          {/* Scanning Frame Overlay */}
                          <div className="absolute inset-0 border-[50px] border-black/50 pointer-events-none flex items-center justify-center">
                              <div className="w-72 h-72 border-4 border-vira-primary rounded-3xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] bg-transparent overflow-hidden">
                                  <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-4 py-1.5 rounded-full backdrop-blur-md font-bold whitespace-nowrap">
                                      کد QR مسافر را اینجا قرار دهید
                                  </div>
                                  <div className="absolute top-0 left-0 w-full h-1 bg-vira-primary shadow-[0_0_15px_#3674B5] animate-[scan_2s_infinite_linear]"></div>
                                  {/* Corner Accents */}
                                  <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-xl opacity-50"></div>
                                  <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-xl opacity-50"></div>
                                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-xl opacity-50"></div>
                                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-xl opacity-50"></div>
                              </div>
                          </div>
                      </div>
                      
                      {/* Bottom Action Area */}
                      <div className="bg-black p-6 pb-12 pt-4 flex justify-center">
                          <button 
                             onClick={() => setScannerMode('manual')}
                             className="w-full max-w-xs bg-white/10 border border-white/20 text-white rounded-2xl py-4 flex items-center justify-center gap-2 active:bg-white/20 transition-all"
                          >
                              <Icons.Key size={20} />
                              <span className="font-bold">اسکن نشد؟ کد ۴ رقمی را وارد کنید</span>
                          </button>
                      </div>
                  </div>
              ) : (
                  <div className="relative w-full h-full flex flex-col items-center justify-center p-6 bg-black">
                      <div className="w-full max-w-sm space-y-6">
                          <div className="text-center">
                              <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4 text-white">
                                  <Icons.Key size={40} />
                              </div>
                              <h3 className="text-white text-xl font-bold">ورود کد دستی</h3>
                              <p className="text-white/50 text-sm mt-2">کد ۴ رقمی زیر QR بلیط را وارد کنید</p>
                              {scanStatus.type !== 'idle' && (
                                <div className={`mt-4 rounded-2xl border px-4 py-3 text-right ${
                                  scanStatus.type === 'success'
                                    ? 'bg-emerald-500/15 text-emerald-100 border-emerald-400/30'
                                    : scanStatus.type === 'error'
                                      ? 'bg-red-500/15 text-red-100 border-red-400/30'
                                      : 'bg-white/5 text-white/80 border-white/10'
                                }`}>
                                  <div className="font-black text-sm">{scanStatus.title}</div>
                                  {scanStatus.detail && <div className="mt-1 text-[11px] leading-5">{scanStatus.detail}</div>}
                                </div>
                              )}
                            </div>

                          <div className="relative">
                              <input 
                                  ref={manualInputRef}
                                  value={manualScannerInput} 
                                  onChange={(e) => setManualScannerInput(toEnglishDigits(e.target.value))} 
                                  placeholder="- - - -" 
                                  maxLength={4} 
                                  className="w-full bg-white/5 border-2 border-white/20 rounded-3xl p-6 text-center text-5xl font-black tracking-[16px] text-white outline-none focus:border-vira-primary transition-all placeholder:text-white/10 dir-ltr" 
                                  dir="ltr"
                                  inputMode="numeric"
                              />
                          </div>

                          <button 
                             onClick={() => setScannerMode('camera')}
                             className="w-full text-white/60 hover:text-white py-4 font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                          >
                              {/* Using Camera Icon Here */}
                              <Icons.Camera size={18} />
                              بازگشت به دوربین
                          </button>
                      </div>
                  </div>
              )}
          </div>
      )}

      <div className="h-full overflow-y-auto p-4 md:p-6 pb-28">
      {driverPage === 'dashboard' && (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-vira-light rounded-full flex items-center justify-center text-vira-primary">
               <Icons.Car size={24} />
            </div>
            <div>
              <div className="font-black text-lg text-gray-800">{session.name}</div>
              <div className="text-xs text-gray-500 font-bold">{session.licensePlate}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="text-xs bg-red-50 hover:bg-red-100 text-red-500 border border-red-100 px-3 py-2 rounded-xl font-bold transition-colors flex items-center gap-1">
             <Icons.LogOut size={14} />
             خروج
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
            <div>
               <div className="text-sm text-gray-500 mb-1">مسافر سوار شده</div>
               <div className="text-3xl font-black text-gray-800">{summary.boardedCount}</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center"><Icons.Users size={20} /></div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
            <div>
               <div className="text-sm text-gray-500 mb-1">درآمد خالص امروز (تومان)</div>
               <div className="text-3xl font-black text-vira-primary">{formatAmountFa(summary.totalRevenue)}</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-green-50 text-green-500 flex items-center justify-center"><Icons.Wallet size={20} /></div>
          </div>
        </div>

        {/* SCANNER BUTTONS */}
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
               <Icons.QrCode size={18} className="text-vira-primary" />
               ثبت مسافر (اسکن بلیط)
            </h2>
            
            <button 
                onClick={openScanner}
                className="w-full bg-vira-primary text-white h-36 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-lg shadow-vira-accent/50 hover:bg-vira-secondary transition-all active:scale-95 group relative overflow-hidden"
            >
                {/* Decorative circles */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-700"></div>
                <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-black/10 rounded-full blur-xl"></div>
                
                <Icons.QrCode size={48} className="relative z-10" />
                <span className="font-black text-xl relative z-10">اسکن بارکد (دوربین)</span>
                <span className="text-xs text-white/80 relative z-10">برای باز کردن اسکنر تمام صفحه کلیک کنید</span>
            </button>
            
            {!canUseBarcodeDetector && <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg mt-3 text-center border border-amber-100">مرورگر شما اسکن خودکار را پشتیبانی نمی‌کند.</div>}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
               <Icons.Key size={18} className="text-vira-primary" />
               کد ۴ رقمی (داشبورد)
            </h2>
            <div className="py-2">
               <input 
                  value={codeInput} 
                  onChange={(e) => setCodeInput(toEnglishDigits(e.target.value))} 
                  placeholder="----" 
                  maxLength={4} 
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-center text-3xl font-black tracking-[12px] text-gray-800 outline-none focus:border-vira-primary transition-all placeholder:tracking-normal placeholder:text-gray-300 dir-ltr" 
                  dir="ltr"
               />
            </div>
            <p className="text-xs text-gray-400 text-center leading-5">
               در صورت خرابی دوربین، کد ۴ رقمی بلیط مسافر را وارد کنید.
            </p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold mb-4 text-gray-800 flex items-center gap-2">
             <Icons.Calendar size={18} className="text-vira-primary" />
             وضعیت سرویس‌های من
          </h2>
          <div className="grid md:grid-cols-2 gap-3">
            {dashboardCards.map((card) => (
              <div key={card.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 transition-all hover:border-vira-primary/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-sm text-gray-800">{card.route}</div>
                  <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${card.soldOut ? 'bg-red-100 text-red-600' : card.hasSales ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-600'}`}>
                    {card.soldOut ? 'تکمیل ظرفیت' : card.hasSales ? 'دارای فروش' : 'بدون فروش'}
                  </span>
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-1">
                   <Icons.Clock size={12} />
                   ساعت حرکت: {card.departureTime}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200 border-dashed flex justify-between items-center">
                   <div className="text-xs text-gray-600">فروش: <span className="font-bold">{card.soldCount}</span></div>
                   <div className="text-xs text-vira-primary font-bold">{formatTomanFa(card.soldAmount)}</div>
                </div>
              </div>
            ))}
            {dashboardCards.length === 0 && <div className="text-xs text-gray-500 text-center py-4 bg-gray-50 rounded-xl">برنامه فعالی برای امروز ثبت نشده است.</div>}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <h2 className="font-bold mb-4 text-gray-800 flex items-center gap-2">
             <Icons.Clock size={18} className="text-vira-primary" />
             اسکن‌های اخیر
          </h2>
          <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
            {recentScans.map((scan) => (
              <div key={scan.id} className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="font-bold text-sm text-gray-800">{scan.passengerName}</div>
                  <div className="text-xs text-gray-500 mt-1">کد: {scan.validationCode} | روش: {scan.method === 'qr' ? 'اسکن QR' : 'کد دستی'}</div>
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-vira-primary">{formatTomanFa(scan.amount)}</div>
                  <div className="text-xs text-gray-400 mt-1">{new Date(scan.scannedAt).toLocaleTimeString('fa-IR')}</div>
                </div>
              </div>
            ))}
            {recentScans.length === 0 && <div className="text-xs text-gray-500 text-center py-4">هنوز مسافری ثبت نشده است.</div>}
          </div>
        </div>
      </div>
      )}

      {driverPage === 'scan' && (
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h2 className="font-black text-gray-800 flex items-center gap-2 mb-4">
              <Icons.QrCode size={20} className="text-vira-primary" />
              اسکن بلیط
            </h2>
            <button
              onClick={openScanner}
              className="w-full bg-vira-primary text-white h-40 rounded-2xl flex flex-col items-center justify-center gap-3 shadow-lg shadow-vira-accent/50 hover:bg-vira-secondary transition-all active:scale-95 group relative overflow-hidden"
            >
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-700"></div>
              <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-black/10 rounded-full blur-xl"></div>
              <Icons.Camera size={48} className="relative z-10" />
              <span className="font-black text-xl relative z-10">اسکن با دوربین</span>
              <span className="text-xs text-white/80 relative z-10">برای شروع اسکن لمس کنید</span>
            </button>
            {!canUseBarcodeDetector && <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg mt-3 text-center border border-amber-100">مرورگر شما اسکن خودکار را پشتیبانی نمی‌کند.</div>}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h2 className="font-black text-gray-800 flex items-center gap-2">
              <Icons.Key size={18} className="text-vira-primary" />
              ورود دستی کد ۴ رقمی
            </h2>
            <div className="py-2">
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(toEnglishDigits(e.target.value))}
                placeholder="----"
                maxLength={4}
                className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-center text-3xl font-black tracking-[12px] text-gray-800 outline-none focus:border-vira-primary transition-all placeholder:tracking-normal placeholder:text-gray-300 dir-ltr"
                dir="ltr"
                inputMode="numeric"
              />
            </div>
            <p className="text-xs text-gray-400 text-center leading-5">در صورت مشکل دوربین، کد ۴ رقمی بلیط مسافر را وارد کنید.</p>
          </div>
        </div>
      )}

      {driverPage === 'request' && (
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-gray-800 flex items-center gap-2">
                <Icons.Navigation size={18} className="text-vira-primary" />
                درخواست مسیر
              </h2>
              <button onClick={loadRouteRequestData} className="text-xs bg-gray-50 border px-3 py-1.5 rounded-lg hover:bg-gray-100 font-bold">بروزرسانی</button>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <StationSelect label="ایستگاه مبدا" placeholder="انتخاب مبدا..." value={routeOrigin} stations={routeStations} onChange={setRouteOrigin} />
              <StationSelect label="ایستگاه مقصد" placeholder="انتخاب مقصد..." value={routeDestination} stations={routeStations} onChange={setRouteDestination} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500">ساعت حرکت</label>
                <input type="time" value={routeTime} onChange={(e) => setRouteTime(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm font-bold outline-none focus:border-vira-primary dir-ltr text-right" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500">قیمت (تومان)</label>
                <input
                  value={routePrice}
                  onChange={(e) => {
                    const raw = toEnglishDigits(e.target.value).replace(/[^\d]/g, '').slice(0, 12);
                    setRoutePrice(raw ? addCommas(raw) : '');
                  }}
                  inputMode="numeric"
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm font-bold outline-none focus:border-vira-primary text-center"
                  placeholder="50,000"
                />
                {routePrice && <div className="text-[11px] text-blue-600 font-bold">{amountToPersianWordsToman(routePrice)}</div>}
              </div>
            </div>
            <button onClick={submitRouteRequest} disabled={routeLoading} className="w-full bg-vira-primary hover:bg-vira-secondary text-white rounded-2xl p-4 font-black shadow-lg shadow-vira-accent/50 transition-all disabled:opacity-60">
              {routeLoading ? 'در حال ثبت...' : 'ثبت درخواست'}
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <h2 className="font-black text-gray-800 flex items-center gap-2 mb-4">
              <Icons.FileText size={18} className="text-vira-primary" />
              وضعیت درخواست‌ها
            </h2>
            {routeLoading ? (
              <div className="text-center text-gray-400 py-10 text-sm font-bold">در حال دریافت...</div>
            ) : (
              <div className="space-y-3">
                {routeRequests.map(r => (
                  <div key={r.id} className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-black text-gray-800 text-sm">{r.originName || r.originStationId} → {r.destinationName || r.destinationStationId}</div>
                        <div className="text-xs text-gray-500 mt-1">ساعت: <span className="font-bold">{r.departureTime}</span> • قیمت: <span className="font-bold">{formatAmountFa(r.price)}</span> تومان</div>
                        {r.adminNote && <div className="text-xs text-gray-500 mt-2">توضیح ادمین: {r.adminNote}</div>}
                      </div>
                      <span className={`text-[10px] px-2 py-1 rounded-lg font-bold border ${
                        r.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                        r.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-100' :
                        'bg-amber-50 text-amber-700 border-amber-100'
                      }`}>
                        {r.status === 'approved' ? 'تایید شد' : r.status === 'rejected' ? 'رد شد' : 'در انتظار'}
                      </span>
                    </div>
                  </div>
                ))}
                {routeRequests.length === 0 && <div className="text-center text-gray-400 py-10 text-sm font-bold">درخواستی ثبت نشده است.</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {driverPage === 'profile' && (
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h2 className="font-black text-gray-800 flex items-center gap-2">
              <Icons.User size={18} className="text-vira-primary" />
              پروفایل
            </h2>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                <div className="text-xs text-gray-400 font-bold">نام</div>
                <div className="font-black text-gray-800 mt-1">{session.name}</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                <div className="text-xs text-gray-400 font-bold">نام کاربری</div>
                <div className="font-black text-gray-800 mt-1">{session.username}</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                <div className="text-xs text-gray-400 font-bold">پلاک</div>
                <div className="font-black text-gray-800 mt-1 dir-ltr text-right">{session.licensePlate}</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                <div className="text-xs text-gray-400 font-bold">تلفن</div>
                <div className="font-black text-gray-800 mt-1 dir-ltr text-right">{session.phone || '-'}</div>
              </div>
            </div>
            <button onClick={handleLogout} className="w-full bg-red-50 text-red-600 py-3 rounded-2xl font-black hover:bg-red-100">خروج از حساب</button>
          </div>
        </div>
      )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
        <div className="max-w-4xl mx-auto grid grid-cols-4 p-2 gap-2">
          <button onClick={() => setDriverPage('dashboard')} className={`py-2 rounded-xl flex flex-col items-center gap-1 text-xs font-bold ${driverPage === 'dashboard' ? 'bg-vira-light text-vira-primary' : 'text-gray-500 hover:bg-gray-50'}`}>
            <Icons.Activity size={18} />
            داشبورد
          </button>
          <button onClick={() => setDriverPage('scan')} className={`py-2 rounded-xl flex flex-col items-center gap-1 text-xs font-bold ${driverPage === 'scan' ? 'bg-vira-light text-vira-primary' : 'text-gray-500 hover:bg-gray-50'}`}>
            <Icons.QrCode size={18} />
            اسکن
          </button>
          <button onClick={() => setDriverPage('request')} className={`py-2 rounded-xl flex flex-col items-center gap-1 text-xs font-bold ${driverPage === 'request' ? 'bg-vira-light text-vira-primary' : 'text-gray-500 hover:bg-gray-50'}`}>
            <Icons.Navigation size={18} />
            درخواست مسیر
          </button>
          <button onClick={() => setDriverPage('profile')} className={`py-2 rounded-xl flex flex-col items-center gap-1 text-xs font-bold ${driverPage === 'profile' ? 'bg-vira-light text-vira-primary' : 'text-gray-500 hover:bg-gray-50'}`}>
            <Icons.User size={18} />
            پروفایل
          </button>
        </div>
      </div>
    </div>
  );
};

export default DriverAppView;
