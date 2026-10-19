import { csvCell, csvRow } from '../utils/csv';

import React, { useEffect, useMemo, useState } from 'react';
import { Icons } from '../components/Icons';
import { AdminAccount, AdminIdea, AdminRole, AdminUser, BusSchedule, Driver, IdeaStatus, IdeaStatusHistoryItem, Station, FinanceRecord, DriverRequest, AppNotification, SupportTicketDetail, SupportTicketListItem, SupportTicketStatus, DriverRouteRequest, TicketFeedbackItem } from '../types';
import {
  createDriver,
  updateDriver,
  createSchedule,
  createStation,
  deleteDriver,
  deleteSchedule,
  deleteStation,
  getAdminUsers,
  getDrivers,
  getSchedules,
  getStations,
  getAdminFinanceData,
  getSystemSettings,
  updateSystemSettings,
  toggleUserStatus,
  deleteUser,
  toggleDriverStatus,
  updateStation,
  toggleStationStatus,
  updateSchedule,
  toggleScheduleStatus,
  getPendingDriverRequests,
  getDriverRequestHistory,
  approveDriverRequest,
  rejectDriverRequest,
  topUpUser,
  getAdminNotifications,
  createNotification,
  updateNotification,
  toggleNotificationStatus,
  deleteNotification,
  getDriverExportData, // NEW
  adminListSupportTickets,
  adminGetSupportTicketDetail,
  adminSetSupportTicketStatus,
  adminReplySupportTicket,
  adminSupportTicketTxtUrl,
  adminSupportAttachmentDownloadUrl,
  downloadAuthenticatedFile
  ,
  adminListRouteRequests,
  adminApproveRouteRequest,
  adminRejectRouteRequest,
  adminGetIdeaDetail,
  adminListIdeas,
  adminUpdateIdea,
  createAnalyst,
  listAnalysts,
  resetAnalystPassword,
  toggleAnalystStatus,
  adminListTicketFeedback,
  adminUpdateTicketFeedbackStatus
  ,
  getAdminLegalContent,
  updateAdminLegalContent
} from '../services/apiService';
import { addCommas, amountToPersianWordsToman, formatAmountFa, formatTomanFa, removeCommas, toEnglishDigits } from '../utils/numberUtils';
import JalaliDatePicker from '../components/JalaliDatePicker';
import { shamsiToGregorianStr } from '../utils/jalali';
import AdminAnalyticsPanel, { AnalyticsChart } from '../components/AdminAnalyticsPanel';

interface AdminDashboardViewProps {
  onLogout: () => void;
  role?: AdminRole;
}

type TabKey = 'dashboard' | 'users' | 'drivers' | 'stations' | 'schedules' | 'ideas' | 'finance' | 'requests' | 'notifications' | 'support' | 'legal';
type FinanceTab = 'student' | 'driver' | 'company' | 'stats' | 'settings';
type RequestTab = 'pending' | 'history';

const tabs: { key: TabKey; label: string; icon: React.ComponentType<any> }[] = [
  { key: 'dashboard', label: 'داشبورد', icon: Icons.Activity },
  { key: 'notifications', label: 'اطلاعیه‌ها', icon: Icons.Bell },
  { key: 'legal', label: 'قوانین', icon: Icons.FileText },
  { key: 'support', label: 'تیکت‌ها', icon: Icons.Headset },
  { key: 'requests', label: 'درخواست راننده', icon: Icons.FileText },
  { key: 'finance', label: 'امور مالی', icon: Icons.Wallet },
  { key: 'users', label: 'کاربران', icon: Icons.Users },
  { key: 'drivers', label: 'رانندگان', icon: Icons.Car },
  { key: 'stations', label: 'ایستگاه ها', icon: Icons.MapPin },
  { key: 'schedules', label: 'برنامه سرویس', icon: Icons.Calendar },
  { key: 'ideas', label: 'ایده‌ها و نظرات', icon: Icons.MessageSquare }
];

const docTypes = [
  { key: 'nationalCard', label: 'کارت ملی' },
  { key: 'licenseCard', label: 'گواهینامه' },
  { key: 'carCard', label: 'کارت ماشین' }
];

const formatToman = (amount: number) => formatTomanFa(Math.round(amount));
const formatRialToToman = (amount: number) => formatTomanFa(Math.round(amount / 10));

// --- Helper for Excel Export ---
const exportToCSV = (data: any[], filename: string) => {
    if (!data || !data.length) {
        alert('داده‌ای برای خروجی وجود ندارد');
        return;
    }
    
    // Get headers
    const headers = Object.keys(data[0]);
    const csvRows = [];
    
    // Add header row with BOM for UTF-8 support in Excel
    csvRows.push('\uFEFF' + csvRow(headers));
    
    // Add data rows
    for (const row of data) {
        const values = headers.map(header => {
            const val = row[header];
            // Escape quotes and commas
            return csvCell(val);
        });
        csvRows.push(values.join(','));
    }
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const toDateBucket = (value?: string | null) => {
  if (!value) return '';
  const v = String(value);
  if (v.includes('T')) return v.slice(0, 10);
  if (v.includes(' ')) return v.slice(0, 10);
  if (v.length >= 10) return v.slice(0, 10);
  return v;
};

const topN = <T extends { label: string; value: number }>(items: T[], n = 8) =>
  [...items].sort((a, b) => b.value - a.value).slice(0, n);

const renderAggregateCards = (
  title: string,
  note: string,
  cards: { label: string; value: string; icon: React.ComponentType<any> }[]
) => (
  <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div>
        <h3 className="font-black text-gray-800">{title}</h3>
        <div className="text-xs text-gray-500 mt-1 leading-6">{note}</div>
      </div>
      <div className="px-3 py-2 rounded-full bg-vira-light text-vira-primary text-xs font-bold">نمای تجمیعی</div>
    </div>
    <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <div className="w-10 h-10 rounded-xl bg-white text-vira-primary flex items-center justify-center mb-3 shadow-sm">
            <card.icon size={18} />
          </div>
          <div className="text-xs text-gray-500 font-bold">{card.label}</div>
          <div className="text-2xl font-black mt-2 text-gray-800">{card.value}</div>
        </div>
      ))}
    </div>
  </div>
);

const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({ onLogout, role = 'admin' }) => {
  const isAnalyst = role === 'analyst';
  const analystAllowedTabs = new Set<TabKey>(['dashboard', 'notifications', 'support', 'finance', 'users', 'drivers', 'stations', 'schedules']);
  const isTabAllowed = (tab: TabKey) => !isAnalyst || analystAllowedTabs.has(tab);
  const sidebarStorageKey = `vira_admin_sidebar_collapsed_${role}`;
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(sidebarStorageKey) === '1';
  });
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [financeTab, setFinanceTab] = useState<FinanceTab>('student');
  const [requestTab, setRequestTab] = useState<RequestTab>('pending');
  
  const [stations, setStations] = useState<Station[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [schedules, setSchedules] = useState<BusSchedule[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [financeData, setFinanceData] = useState<FinanceRecord[]>([]);
  const [pendingRequests, setPendingRequests] = useState<DriverRequest[]>([]);
  const [historyRequests, setHistoryRequests] = useState<DriverRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicketListItem[]>([]);
  const [supportStatusFilter, setSupportStatusFilter] = useState<SupportTicketStatus | ''>('');
  const [supportSearch, setSupportSearch] = useState('');
  const [selectedSupportTicket, setSelectedSupportTicket] = useState<SupportTicketDetail | null>(null);
  const [supportReply, setSupportReply] = useState('');
  const [supportReplyFiles, setSupportReplyFiles] = useState<{ name: string; dataUrl: string }[]>([]);
  const [supportStatusNote, setSupportStatusNote] = useState('');
  const [analysts, setAnalysts] = useState<AdminAccount[]>([]);
  const [newAnalystUsername, setNewAnalystUsername] = useState('');
  const [newAnalystPassword, setNewAnalystPassword] = useState('');
  const [ideas, setIdeas] = useState<AdminIdea[]>([]);
  const [ideasPage, setIdeasPage] = useState(1);
  const [ideasPageSize, setIdeasPageSize] = useState(20);
  const [ideasTotal, setIdeasTotal] = useState(0);
  const [ideasStatusFilter, setIdeasStatusFilter] = useState<IdeaStatus | ''>('');
  const [ideasSearch, setIdeasSearch] = useState('');
  const [ideasUserFilter, setIdeasUserFilter] = useState('');
  const [ideasFromDate, setIdeasFromDate] = useState('');
  const [ideasToDate, setIdeasToDate] = useState('');
  const [selectedIdeaDetail, setSelectedIdeaDetail] = useState<{ idea: AdminIdea; history: IdeaStatusHistoryItem[] } | null>(null);
  const [ideaAdminResponse, setIdeaAdminResponse] = useState('');
  const [ideaAdminNote, setIdeaAdminNote] = useState('');
  const [ideaNextStatus, setIdeaNextStatus] = useState<IdeaStatus>('reviewing');
  const [ticketFeedbacks, setTicketFeedbacks] = useState<TicketFeedbackItem[]>([]);
  const [ticketFeedbackStatusFilter, setTicketFeedbackStatusFilter] = useState<'pending' | 'reviewing' | 'resolved' | ''>('');
  const [ticketFeedbackSearch, setTicketFeedbackSearch] = useState('');
  const [selectedTicketFeedback, setSelectedTicketFeedback] = useState<TicketFeedbackItem | null>(null);
  const [ticketFeedbackNextStatus, setTicketFeedbackNextStatus] = useState<'pending' | 'reviewing' | 'resolved'>('pending');
  const [ticketFeedbackNote, setTicketFeedbackNote] = useState('');
  const [docsDriver, setDocsDriver] = useState<Driver | null>(null);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [editingDriverForm, setEditingDriverForm] = useState({ name: '', username: '', password: '', licensePlate: '', phone: '', capacity: '30' });
  const [editingDriverStations, setEditingDriverStations] = useState<string[]>([]);
  
  const [searchQuery, setSearchQuery] = useState('');
  
  // Specific User Search States
  const [searchName, setSearchName] = useState('');
  const [searchStudentId, setSearchStudentId] = useState('');
  const [searchNationalCode, setSearchNationalCode] = useState('');

  // Request History Search
  const [historySearchName, setHistorySearchName] = useState('');
  const [historySearchCode, setHistorySearchCode] = useState('');

  const [commission, setCommission] = useState(10);
  const [weeklyWalletLimit, setWeeklyWalletLimit] = useState(0);
  const [weeklyWalletLimitInput, setWeeklyWalletLimitInput] = useState('0');
  const [weeklyWalletLimitMeta, setWeeklyWalletLimitMeta] = useState<{ updatedAt: string | null; updatedBy: string | null }>({ updatedAt: null, updatedBy: null });

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // User Management State
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null); // For the Side Panel
  const [topupAmount, setTopupAmount] = useState('');

  // Driver Request Review State
  const [selectedRequest, setSelectedRequest] = useState<DriverRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Form States (Create)
  const [driverName, setDriverName] = useState('');
  const [driverUser, setDriverUser] = useState('');
  const [driverPass, setDriverPass] = useState('');
  const [driverPlate, setDriverPlate] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [driverCapacity, setDriverCapacity] = useState('30');
  const [selectedStations, setSelectedStations] = useState<string[]>([]);

  const [stationName, setStationName] = useState('');
  const [stationLat, setStationLat] = useState('');
  const [stationLng, setStationLng] = useState('');

  const [schedDriver, setSchedDriver] = useState('');
  const [schedOrigin, setSchedOrigin] = useState('');
  const [schedDest, setSchedDest] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [schedPrice, setSchedPrice] = useState('5,000');

  // Driver Route Requests (Service Program)
  const [routeRequests, setRouteRequests] = useState<DriverRouteRequest[]>([]);
  const [routeReqStatus, setRouteReqStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [selectedRouteReq, setSelectedRouteReq] = useState<DriverRouteRequest | null>(null);
  const [routeReqEdit, setRouteReqEdit] = useState({ driverId: '', originStationId: '', destinationStationId: '', departureTime: '', priceToman: '50,000', adminNote: '' });

  // Notification Form State
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifType, setNotifType] = useState('info');
  const [notifAudience, setNotifAudience] = useState<'student' | 'driver' | 'both'>('both');
  const [editingNotifId, setEditingNotifId] = useState<string | null>(null);
  const [legalAudience, setLegalAudience] = useState<'user' | 'driver'>('user');
  const [legalContent, setLegalContent] = useState('');
  const [legalUpdatedAt, setLegalUpdatedAt] = useState<string | null>(null);
  const [legalUpdatedBy, setLegalUpdatedBy] = useState<string | null>(null);

  useEffect(() => {
    if (!isTabAllowed(activeTab)) {
      setActiveTab('dashboard');
    }
  }, [activeTab, isAnalyst]);

  useEffect(() => {
    if (isAnalyst && financeTab !== 'stats') {
      setFinanceTab('stats');
    }
  }, [financeTab, isAnalyst]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(sidebarStorageKey, isSidebarCollapsed ? '1' : '0');
  }, [isSidebarCollapsed, sidebarStorageKey]);

  const stats = useMemo(
    () => [
      { title: 'کاربران', value: users.length.toString(), icon: Icons.Users },
      { title: 'رانندگان', value: drivers.length.toString(), icon: Icons.Car },
      { title: 'درخواست ها', value: pendingRequests.length.toString(), icon: Icons.Bell },
      { title: 'برنامه های فعال', value: schedules.length.toString(), icon: Icons.Calendar }
    ],
    [users.length, drivers.length, pendingRequests.length, schedules.length]
  );

  // Filter Users
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchName = u.name.toLowerCase().includes(searchName.toLowerCase());
      const matchId = u.studentId.includes(toEnglishDigits(searchStudentId));
      const matchCode = u.nationalCode.includes(toEnglishDigits(searchNationalCode));
      return matchName && matchId && matchCode;
    });
  }, [users, searchName, searchStudentId, searchNationalCode]);

  // Filter History Requests
  const filteredHistory = useMemo(() => {
      return historyRequests.filter(r => {
          const matchName = r.name.toLowerCase().includes(historySearchName.toLowerCase());
          const matchCode = r.nationalCode.includes(toEnglishDigits(historySearchCode));
          return matchName && matchCode;
      });
  }, [historyRequests, historySearchName, historySearchCode]);

  const filteredFinance = useMemo(() => {
    if (!searchQuery) return financeData;
    return financeData.filter(r => r.trackingNumber.includes(searchQuery));
  }, [financeData, searchQuery]);

  const filteredSupportTickets = useMemo(() => {
    const q = toEnglishDigits(supportSearch).trim().toLowerCase();
    if (!q) return supportTickets;
    return supportTickets.filter(t => {
      const idMatch = String(t.id).includes(q);
      const titleMatch = (t.title || '').toLowerCase().includes(q);
      const userIdMatch = (t.user?.studentId || '').includes(q);
      const userNameMatch = (t.user?.name || '').toLowerCase().includes(q);
      return idMatch || titleMatch || userIdMatch || userNameMatch;
    });
  }, [supportTickets, supportSearch]);

  const financeTotals = useMemo(() => {
    return filteredFinance.reduce((acc, curr) => {
      acc.amount += curr.amount || 0;
      acc.driverShare += curr.driverShare || 0;
      acc.companyShare += curr.companyShare || 0;
      return acc;
    }, { amount: 0, driverShare: 0, companyShare: 0 });
  }, [filteredFinance]);

  const loadAll = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [usersData, stationsData, driversData, schedulesData, requestsData, notifsData] = await Promise.all([
        getAdminUsers(),
        getStations(),
        getDrivers(),
        getSchedules(),
        getPendingDriverRequests(),
        getAdminNotifications()
      ]);
      setUsers(usersData);
      setStations(stationsData);
      setDrivers(driversData);
      setSchedules(schedulesData);
      setPendingRequests(requestsData);
      setNotifications(notifsData);
      if (isAnalyst) {
        setAnalysts([]);
      } else {
        const analystsData = await listAnalysts();
        setAnalysts(analystsData);
      }
    } catch (error: any) {
      setMessage(error?.message || 'دریافت اطلاعات ناموفق بود');
    } finally {
      setLoading(false);
    }
  };

  const loadRequestHistory = async () => {
      setLoading(true);
      try {
          const data = await getDriverRequestHistory();
          setHistoryRequests(data);
      } catch (e) {
          setMessage('خطا در دریافت تاریخچه درخواست‌ها');
      } finally {
          setLoading(false);
      }
  };

  const loadFinance = async (type: 'student' | 'driver' | 'company' | 'stats') => {
    setLoading(true);
    try {
      const reqType = type === 'stats' ? 'company' : type;
      const data = await getAdminFinanceData(reqType, startDate.replace(/\//g, '-'), endDate.replace(/\//g, '-'));
      setFinanceData(data);
    } catch (error: any) {
      setMessage('خطا در دریافت گزارش مالی');
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const s = await getSystemSettings();
      setCommission(s.companyCommissionPercent);
      const limit = Number((s as any).weeklyWalletTopupLimitToman || 0);
      setWeeklyWalletLimit(Number.isFinite(limit) ? limit : 0);
      setWeeklyWalletLimitInput(addCommas(String(Number.isFinite(limit) ? limit : 0)));
      setWeeklyWalletLimitMeta({
        updatedAt: (s as any).weeklyWalletTopupLimitUpdatedAt ?? null,
        updatedBy: (s as any).weeklyWalletTopupLimitUpdatedBy ?? null
      });
    } catch {}
  };

  const loadSupportTickets = async () => {
    setLoading(true);
    setMessage('');
    try {
      const data = await adminListSupportTickets(supportStatusFilter || undefined);
      setSupportTickets(data);
    } catch (e: any) {
      setMessage(e?.message || 'خطا در دریافت تیکت‌ها');
    } finally {
      setLoading(false);
    }
  };

  const loadRouteRequestsAdmin = async () => {
    setLoading(true);
    setMessage('');
    try {
      const data = await adminListRouteRequests(routeReqStatus);
      setRouteRequests(data);
    } catch (e: any) {
      setMessage(e?.message || 'خطا در دریافت درخواست‌های مسیر');
    } finally {
      setLoading(false);
    }
  };

  const loadLegal = async (audience: 'user' | 'driver') => {
    setLoading(true);
    setMessage('');
    try {
      const data = await getAdminLegalContent(audience);
      setLegalAudience(audience);
      setLegalContent(data?.content || '');
      setLegalUpdatedAt(data?.updatedAt || null);
      setLegalUpdatedBy(data?.updatedBy || null);
    } catch (e: any) {
      setMessage(e?.message || 'خطا در دریافت قوانین');
    } finally {
      setLoading(false);
    }
  };

  const refreshActiveTabData = async () => {
    if (activeTab === 'finance') {
      if (financeTab === 'settings') await loadSettings();
      else await loadFinance(financeTab as any);
      return;
    }
    if (activeTab === 'support') {
      await loadSupportTickets();
      return;
    }
    if (activeTab === 'legal') {
      await loadLegal(legalAudience);
      return;
    }
    if (activeTab === 'ideas') {
      await loadIdeasAdmin();
      if (!isAnalyst) await loadTicketFeedbacks();
      return;
    }
    if (activeTab === 'schedules') {
      await loadAll();
      await loadRouteRequestsAdmin();
      return;
    }
    if (activeTab === 'requests') {
      if (requestTab === 'history') await loadRequestHistory();
      else await loadAll();
      return;
    }
    await loadAll();
  };

  const loadIdeasAdmin = async () => {
    setLoading(true);
    setMessage('');
    try {
      const from = shamsiToGregorianStr(ideasFromDate) || '';
      const to = shamsiToGregorianStr(ideasToDate) || '';
      const result = await adminListIdeas({
        page: ideasPage,
        pageSize: ideasPageSize,
        status: ideasStatusFilter || undefined,
        q: ideasSearch.trim() || undefined,
        user: ideasUserFilter.trim() || undefined,
        from: from || undefined,
        to: to ? `${to} 23:59:59` : undefined
      });
      setIdeas(Array.isArray(result.items) ? result.items : []);
      setIdeasTotal(Number(result.total || 0));
    } catch (e: any) {
      setMessage(e?.message || 'خطا در دریافت ایده‌ها');
    } finally {
      setLoading(false);
    }
  };

  const loadTicketFeedbacks = async () => {
    setLoading(true);
    setMessage('');
    try {
      const data = await adminListTicketFeedback(ticketFeedbackStatusFilter || undefined);
      setTicketFeedbacks(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setMessage(e?.message || 'خطا در دریافت نظرات سفر');
    } finally {
      setLoading(false);
    }
  };

  const openIdea = async (ideaId: string) => {
    setLoading(true);
    setMessage('');
    try {
      const detail = await adminGetIdeaDetail(ideaId);
      setSelectedIdeaDetail(detail);
      setIdeaAdminResponse(detail.idea.adminResponse || '');
      setIdeaAdminNote('');
      setIdeaNextStatus((detail.idea.status === 'submitted' ? 'reviewing' : detail.idea.status) as IdeaStatus);
    } catch (e: any) {
      setMessage(e?.message || 'خطا در دریافت جزئیات ایده');
    } finally {
      setLoading(false);
    }
  };

  const saveIdeaAdmin = async () => {
    if (!selectedIdeaDetail) return;
    setLoading(true);
    setMessage('');
    try {
      const updated = await adminUpdateIdea(selectedIdeaDetail.idea.id, {
        status: ideaNextStatus,
        adminResponse: ideaAdminResponse,
        adminNote: ideaAdminNote
      });
      setMessage('ذخیره شد');
      // Refresh list + detail
      await loadIdeasAdmin();
      await openIdea(updated.id);
    } catch (e: any) {
      setMessage(e?.message || 'ذخیره ناموفق بود');
    } finally {
      setLoading(false);
    }
  };

  const openSupportTicket = async (ticketId: string) => {
    setLoading(true);
    setMessage('');
    try {
      const detail = await adminGetSupportTicketDetail(ticketId);
      setSelectedSupportTicket(detail);
    } catch (e: any) {
      setMessage(e?.message || 'خطا در دریافت تیکت');
    } finally {
      setLoading(false);
    }
  };

  const openTicketFeedback = (item: TicketFeedbackItem) => {
    setSelectedTicketFeedback(item);
    setTicketFeedbackNextStatus(item.status);
    setTicketFeedbackNote('');
  };

  const readSupportFiles = async (fileList: FileList) => {
    const arr = Array.from(fileList).slice(0, 5);
    const results: { name: string; dataUrl: string }[] = [];
    for (const f of arr) {
      if (f.size > 5 * 1024 * 1024) { setMessage('حجم هر فایل باید کمتر از ۵ مگابایت باشد'); continue; }
      const okMime = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain'].includes(f.type);
      if (!okMime) { setMessage('فرمت فایل مجاز نیست'); continue; }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(f);
      });
      results.push({ name: f.name, dataUrl });
    }
    setSupportReplyFiles((prev) => [...prev, ...results].slice(0, 5));
  };

  const handleAdminReplySupport = async () => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
    if (!selectedSupportTicket) return;
    try {
      const text = supportReply.trim();
      if (!text) { setMessage('متن پاسخ الزامی است'); return; }
      await adminReplySupportTicket(selectedSupportTicket.id, { message: text, attachments: supportReplyFiles });
      setSupportReply('');
      setSupportReplyFiles([]);
      await openSupportTicket(selectedSupportTicket.id);
      setMessage('پاسخ ارسال شد');
    } catch (e: any) {
      setMessage(e?.message || 'ارسال پاسخ ناموفق بود');
    }
  };

  const handleAdminSetSupportStatus = async (status: SupportTicketStatus) => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
    if (!selectedSupportTicket) return;
    try {
      await adminSetSupportTicketStatus(selectedSupportTicket.id, status, supportStatusNote);
      setSupportStatusNote('');
      await openSupportTicket(selectedSupportTicket.id);
      await loadSupportTickets();
      setMessage('وضعیت بروزرسانی شد');
    } catch (e: any) {
      setMessage(e?.message || 'ذخیره وضعیت ناموفق بود');
    }
  };

  const handleUpdateTicketFeedback = async () => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
    if (!selectedTicketFeedback) return;
    try {
      const updated = await adminUpdateTicketFeedbackStatus(selectedTicketFeedback.ticketId, ticketFeedbackNextStatus, ticketFeedbackNote);
      const nextTicket = updated?.ticket || { ...selectedTicketFeedback, status: ticketFeedbackNextStatus, reviewedBy: 'admin', reviewedAt: new Date().toISOString() };
      setTicketFeedbacks((prev) => prev.map((item) => (item.ticketId === selectedTicketFeedback.ticketId ? { ...item, ...nextTicket } : item)));
      setSelectedTicketFeedback((prev) => (prev ? { ...prev, ...nextTicket } : prev));
      setTicketFeedbackNote('');
      setMessage('وضعیت نظر بروزرسانی شد');
    } catch (e: any) {
      setMessage(e?.message || 'بروزرسانی نظر ناموفق بود');
    }
  };

  const handleProtectedDownload = async (url: string, fallbackName: string) => {
    try {
      await downloadAuthenticatedFile(url, fallbackName);
    } catch (e: any) {
      setMessage(e?.message || 'دانلود فایل ناموفق بود');
    }
  };

  useEffect(() => {
    if (activeTab === 'finance') {
      if (financeTab === 'settings') loadSettings();
      else loadFinance(financeTab as any);
    } else if (activeTab === 'support') {
      loadSupportTickets();
    } else if (activeTab === 'legal') {
      loadLegal(legalAudience);
    } else if (activeTab === 'ideas') {
      loadIdeasAdmin();
      if (!isAnalyst) loadTicketFeedbacks();
    } else if (activeTab === 'schedules') {
      loadAll();
      loadRouteRequestsAdmin();
    } else if (activeTab === 'requests') {
        if (requestTab === 'history') loadRequestHistory();
        else loadAll();
    } else {
      loadAll();
    }
  }, [
    activeTab,
    financeTab,
    requestTab,
    startDate,
    endDate,
    supportStatusFilter,
    routeReqStatus,
    ideasPage,
    ideasPageSize,
    ideasStatusFilter,
    ideasSearch,
    ideasUserFilter,
    ideasFromDate,
    ideasToDate,
    legalAudience,
    ticketFeedbackStatusFilter
  ]);

  useEffect(() => {
    const timer = setInterval(() => {
      refreshActiveTabData().catch(() => {});
    }, 45000);
    return () => clearInterval(timer);
  }, [
    activeTab,
    financeTab,
    requestTab,
    supportStatusFilter,
    routeReqStatus,
    ideasPage,
    ideasPageSize,
    ideasStatusFilter,
    ideasSearch,
    ideasUserFilter,
    ideasFromDate,
    ideasToDate,
    legalAudience,
    ticketFeedbackStatusFilter
  ]);

  // --- Handlers ---

  // Export Active Drivers List
  const handleExportDriversList = () => {
      const exportData = drivers.map(d => ({
          'نام': d.name,
          'نام کاربری': d.username,
          'پلاک': d.licensePlate,
          'تلفن': d.phone,
          'وضعیت': d.status === 'active' ? 'فعال' : 'غیرفعال',
          'ظرفیت': d.capacity
      }));
      exportToCSV(exportData, `active_drivers_list_${new Date().toISOString().slice(0,10)}`);
  };

  // Export Specific Driver Data
  const handleExportSingleDriver = async (driverId: string) => {
      try {
          const data = await getDriverExportData(driverId);
          if (!data || data.length === 0) {
              alert('اطلاعاتی برای این راننده یافت نشد');
              return;
          }
          
          // Separate summary and details for CSV structure
          const summary = data[0]; // First row is summary
          const details = data.slice(1);

          // Construct CSV content manually for multi-part structure
          let csvContent = '\uFEFF'; // BOM
          
          csvContent += [
            ['خلاصه عملکرد راننده', summary.name], ['پلاک', summary.plate], ['کد ملی', summary.nationalCode],
            ['ایستگاه‌های مجاز', summary.stations], ['تعداد کل سفرها', summary.totalTrips], ['درآمد کل (تومان)', summary.totalRevenue], [],
            ['لیست سفرها'], ['تاریخ', 'ساعت', 'نام مسافر', 'مبلغ (تومان)', 'روش اسکن'],
            ...details.map((row: any) => [row.date, row.time, row.passenger, row.price, row.method])
          ].map(csvRow).join('\n');

          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `driver_report_${summary.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
    URL.revokeObjectURL(url);

      } catch (e) {
          console.error(e);
          alert('خطا در دریافت اطلاعات راننده');
      }
  };

  // Export Request History
  const handleExportHistory = () => {
      const exportData = filteredHistory.map(r => ({
          'نام': r.name,
          'کد ملی': r.nationalCode,
          'تاریخ تولد': r.birthDate,
          'تلفن': r.phone,
          'پلاک': r.licensePlate,
          'وضعیت': r.status === 'active' ? 'تایید شده' : (r.status === 'rejected' ? 'رد شده' : 'معلق'),
          'تاریخ درخواست': new Date(r.createdAt).toLocaleDateString('fa-IR')
      }));
      exportToCSV(exportData, `requests_history_${new Date().toISOString().slice(0,10)}`);
  };

  // ... (Other handlers remain unchanged)
  // Notifications
  const handleSaveNotification = async (e: React.FormEvent) => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
    e.preventDefault();
    if (!notifTitle || !notifMessage) { setMessage('عنوان و متن الزامی است'); return; }
    
    try {
        if (editingNotifId) {
            await updateNotification(editingNotifId, { title: notifTitle, message: notifMessage, type: notifType, audience: notifAudience });
            setNotifications(prev => prev.map(n => n.id === editingNotifId ? { ...n, title: notifTitle, message: notifMessage, type: notifType as any, audience: notifAudience } : n));
            setMessage('اطلاعیه ویرایش شد');
        } else {
            const newNotif = await createNotification({ title: notifTitle, message: notifMessage, type: notifType, audience: notifAudience });
            setNotifications(prev => [newNotif, ...prev]);
            setMessage('اطلاعیه ایجاد شد');
        }
        setNotifTitle(''); setNotifMessage(''); setNotifType('info'); setNotifAudience('both'); setEditingNotifId(null);
    } catch (err: any) { setMessage(err.message); }
  };

  const handleEditNotification = (n: AppNotification) => {
      setNotifTitle(n.title);
      setNotifMessage(n.message);
      setNotifType(n.type);
      setNotifAudience((n as any).audience || 'both');
      setEditingNotifId(n.id);
  };

  const handleToggleNotification = async (n: AppNotification) => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
      try {
          await toggleNotificationStatus(n.id);
          setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, status: item.status === 'active' ? 'archived' : 'active' } : item));
      } catch (e) { alert('خطا در تغییر وضعیت'); }
  };

  const handleDeleteNotificationItem = async (id: string) => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
      if (!confirm('آیا از حذف این اطلاعیه اطمینان دارید؟')) return;
      try {
          await deleteNotification(id);
          setNotifications(prev => prev.filter(n => n.id !== id));
      } catch (e) { alert('خطا در حذف'); }
  };

  const handleCancelEditNotif = () => {
      setNotifTitle(''); setNotifMessage(''); setNotifType('info'); setNotifAudience('both'); setEditingNotifId(null);
  }

  const handleSaveLegal = async () => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
    const content = String(legalContent || '').trim();
    if (!content) {
      setMessage('متن قوانین نمی‌تواند خالی باشد');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      await updateAdminLegalContent({ audience: legalAudience, content });
      await loadLegal(legalAudience);
      setMessage('قوانین با موفقیت ذخیره شد');
    } catch (e: any) {
      setMessage(e?.message || 'ذخیره قوانین ناموفق بود');
    } finally {
      setLoading(false);
    }
  };

  // Users
  const handleUserToggle = async () => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
    if (!selectedUser) return;
    try {
        await toggleUserStatus(selectedUser.id);
        setUsers(prev => prev.map(u => u.id === selectedUser.id ? {...u, status: u.status === 'active' ? 'suspended' : 'active'} : u));
        setSelectedUser(prev => prev ? {...prev, status: prev.status === 'active' ? 'suspended' : 'active'} : null);
        setMessage('وضعیت کاربر تغییر کرد');
    } catch (e) { alert('عملیات ناموفق بود'); }
  };

  const handleUserDelete = async () => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
      if(!selectedUser) return;
      if(!confirm('آیا از حذف این کاربر اطمینان دارید؟')) return;
      try {
          await deleteUser(selectedUser.id);
          setUsers(prev => prev.filter(u => u.id !== selectedUser.id));
          setSelectedUser(null);
          setMessage('کاربر حذف شد');
      } catch (e) { alert('حذف ناموفق بود'); }
  };
  
  const handleTopUpSubmit = async (e: React.FormEvent) => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
      e.preventDefault();
      if(!selectedUser || !topupAmount) return;
      
      try {
          const amountToman = Number(removeCommas(topupAmount));
          const amountRial = amountToman * 10;
          await topUpUser(selectedUser.studentId, amountToman);
          
          const newBalance = selectedUser.balance + amountRial;
          setUsers(prev => prev.map(u => u.id === selectedUser.id ? {...u, balance: newBalance} : u));
          setSelectedUser(prev => prev ? {...prev, balance: newBalance} : null);
          
          setMessage(`کیف پول ${selectedUser.name} مبلغ ${formatAmountFa(amountToman)} تومان شارژ شد`);
          setTopupAmount('');
      } catch (err: any) {
          setMessage(err.message || 'خطا در شارژ کیف پول');
      }
  };

  // Drivers
  const handleAddDriver = async (e: React.FormEvent) => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
    e.preventDefault();
    setMessage('');
    try {
      if (!driverName.trim() || !driverUser.trim() || !driverPass.trim() || !driverPlate.trim()) {
        setMessage('نام، نام کاربری، رمز عبور و پلاک راننده الزامی است');
        return;
      }
      if (selectedStations.length === 0) {
        setMessage('حداقل یک ایستگاه مجاز برای راننده انتخاب کنید');
        return;
      }
      const created = await createDriver({
        name: driverName, username: driverUser, password: driverPass,
        licensePlate: driverPlate, phone: driverPhone, capacity: Number(driverCapacity) || 30,
        assignedStations: selectedStations
      });
      setDrivers((prev) => [created, ...prev]);
      setDriverName(''); setDriverUser(''); setDriverPass(''); setDriverPlate(''); setDriverPhone(''); setSelectedStations([]);
      setMessage('راننده با موفقیت ثبت شد');
    } catch (error: any) { setMessage(error?.message || 'ثبت راننده ناموفق بود'); }
  };
  const handleDriverToggle = async (driver: Driver) => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
      try {
          await toggleDriverStatus(driver.id);
          setDrivers(prev => prev.map(d => d.id === driver.id ? {...d, status: d.status === 'active' ? 'inactive' : 'active'} : d));
      } catch (e) { alert('عملیات ناموفق بود'); }
  };
  const handleDriverDelete = async (id: string) => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
      if(!confirm('حذف راننده؟')) return;
      try {
          await deleteDriver(id);
          setDrivers(prev => prev.filter(d => d.id !== id));
      } catch (e) { alert('حذف ناموفق'); }
  };

  const handleSaveDriverEdit = async () => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
      if (!editingDriver) return;
      try {
          const payload: any = {
              name: editingDriverForm.name,
              username: toEnglishDigits(editingDriverForm.username),
              licensePlate: toEnglishDigits(editingDriverForm.licensePlate),
              phone: toEnglishDigits(editingDriverForm.phone),
              capacity: Number(toEnglishDigits(editingDriverForm.capacity)) || 30,
              assignedStations: editingDriverStations
          };
          if (editingDriverForm.password?.trim()) payload.password = toEnglishDigits(editingDriverForm.password);
          await updateDriver(editingDriver.id, payload);
          setEditingDriver(null);
          setEditingDriverForm({ name: '', username: '', password: '', licensePlate: '', phone: '', capacity: '30' });
          setEditingDriverStations([]);
          setMessage('اطلاعات راننده بروزرسانی شد');
          loadAll();
      } catch (e: any) {
          setMessage(e?.message || 'ویرایش راننده ناموفق بود');
      }
  };

  // Stations
  const handleAddStation = async (e: React.FormEvent) => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
      e.preventDefault();
      try {
          const created = await createStation({ name: stationName, lat: Number(stationLat), lng: Number(stationLng) });
          setStations(prev => [created, ...prev]);
          setStationName(''); setStationLat(''); setStationLng('');
          setMessage('ایستگاه ایجاد شد');
      } catch (e: any) { setMessage(e.message); }
  };
  const handleStationToggle = async (s: Station) => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
      try {
          await toggleStationStatus(s.id);
          setStations(prev => prev.map(st => st.id === s.id ? {...st, isActive: !st.isActive} : st));
      } catch (e) { alert('Error'); }
  };
  const handleStationDelete = async (id: string) => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
      if(!confirm('Delete?')) return;
      try { await deleteStation(id); setStations(prev => prev.filter(s => s.id !== id)); } catch {}
  };

  // Schedules
  const handleAddSchedule = async (e: React.FormEvent) => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
      e.preventDefault();
      try {
          const created = await createSchedule({
              driverId: schedDriver, originStationId: schedOrigin, destinationStationId: schedDest,
              departureTime: schedTime, price: Number(removeCommas(schedPrice))*10 // convert Toman to Rial
          });
          setSchedules(prev => [created, ...prev]);
          setMessage('برنامه ایجاد شد');
      } catch (e: any) { setMessage(e.message); }
  };
  const handleScheduleToggle = async (s: BusSchedule) => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
      try {
          await toggleScheduleStatus(s.id);
          setSchedules(prev => prev.map(sc => sc.id === s.id ? {...sc, status: sc.status === 'active' ? 'inactive' : 'active'} : sc));
      } catch {}
  };
  const handleScheduleDelete = async (id: string) => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
      if(!confirm('Delete?')) return;
      try { await deleteSchedule(id); setSchedules(prev => prev.filter(s => s.id !== id)); } catch {}
  };

  // Driver Route Requests (Service Program)
  const openRouteRequestModal = (r: DriverRouteRequest) => {
    setSelectedRouteReq(r);
    setRouteReqEdit({
      driverId: r.driverId,
      originStationId: r.originStationId,
      destinationStationId: r.destinationStationId,
      departureTime: r.departureTime,
      priceToman: addCommas(String(r.price || 50000)),
      adminNote: r.adminNote || ''
    });
  };

  const handleApproveRouteReq = async () => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
    if (!selectedRouteReq) return;
    try {
      await adminApproveRouteRequest(selectedRouteReq.id, {
        driverId: routeReqEdit.driverId,
        originStationId: routeReqEdit.originStationId,
        destinationStationId: routeReqEdit.destinationStationId,
        departureTime: routeReqEdit.departureTime,
        priceToman: Number(removeCommas(toEnglishDigits(routeReqEdit.priceToman)) || 0),
        adminNote: routeReqEdit.adminNote
      });
      setSelectedRouteReq(null);
      setMessage('درخواست تایید شد و برنامه سرویس ایجاد گردید');
      loadRouteRequestsAdmin();
      loadAll();
    } catch (e: any) {
      setMessage(e?.message || 'تایید درخواست ناموفق بود');
    }
  };

  const handleRejectRouteReq = async () => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
    if (!selectedRouteReq) return;
    try {
      await adminRejectRouteRequest(selectedRouteReq.id, routeReqEdit.adminNote || '');
      setSelectedRouteReq(null);
      setMessage('درخواست رد شد');
      loadRouteRequestsAdmin();
    } catch (e: any) {
      setMessage(e?.message || 'رد درخواست ناموفق بود');
    }
  };

  // Finance Settings
  const handleUpdateFinanceSettings = async () => {
      if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
      try {
          await updateSystemSettings({ companyCommissionPercent: commission, weeklyWalletTopupLimitToman: weeklyWalletLimit });
          setMessage('تنظیمات مالی بروزرسانی شد');
          loadSettings();
      } catch (e) { setMessage('خطا در ذخیره تنظیمات'); }
  };

  // Request Actions
  const handleApprove = async () => {
      if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
      if(!selectedRequest) return;
      try {
          await approveDriverRequest(selectedRequest.id);
          setPendingRequests(prev => prev.filter(r => r.id !== selectedRequest.id));
          setSelectedRequest(null);
          setMessage('راننده تایید شد');
      } catch (err: any) { setMessage(err.message); }
  };

  const handleReject = async () => {
      if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
      if(!selectedRequest || !rejectReason) {
          alert('لطفا علت رد را بنویسید');
          return;
      }
      try {
          await rejectDriverRequest(selectedRequest.id, rejectReason);
          setPendingRequests(prev => prev.filter(r => r.id !== selectedRequest.id));
          setSelectedRequest(null);
          setRejectReason('');
          setMessage('درخواست رد شد');
      } catch (err: any) { setMessage(err.message); }
  };

  const handleCreateAnalyst = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
    try {
      await createAnalyst({ username: newAnalystUsername, password: newAnalystPassword, role: 'analyst' });
      setNewAnalystUsername('');
      setNewAnalystPassword('');
      setMessage('تحلیل‌گر ایجاد شد');
      const data = await listAnalysts();
      setAnalysts(data);
    } catch (error: any) {
      setMessage(error?.message || 'ایجاد تحلیل‌گر ناموفق بود');
    }
  };

  const handleToggleAnalyst = async (id: number) => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
    try {
      await toggleAnalystStatus(id);
      const data = await listAnalysts();
      setAnalysts(data);
      setMessage('وضعیت تحلیل‌گر بروزرسانی شد');
    } catch (error: any) {
      setMessage(error?.message || 'تغییر وضعیت تحلیل‌گر ناموفق بود');
    }
  };

  const handleResetAnalyst = async (id: number) => {
    if (isAnalyst) return setMessage('این عملیات برای تحلیل‌گر مجاز نیست');
    const password = prompt('رمز عبور جدید (حداقل ۶ کاراکتر):');
    if (!password) return;
    try {
      await resetAnalystPassword(id, password);
      setMessage('رمز عبور تحلیل‌گر بروزرسانی شد');
    } catch (error: any) {
      setMessage(error?.message || 'ریست رمز ناموفق بود');
    }
  };

  const activeNotifications = notifications.filter((item) => item.status === 'active');
  const archivedNotifications = notifications.filter((item) => item.status === 'archived');
  const analyticsUpdatedAt = useMemo(() => new Date().toLocaleString('fa-IR'), [
    activeTab,
    users.length,
    drivers.length,
    stations.length,
    schedules.length,
    filteredFinance.length,
    pendingRequests.length,
    historyRequests.length,
    notifications.length,
    supportTickets.length,
    ideas.length
  ]);
  const filteredTicketFeedbacks = useMemo(() => {
    const q = ticketFeedbackSearch.trim().toLowerCase();
    if (!q) return ticketFeedbacks;
    return ticketFeedbacks.filter((item) =>
      [item.userName, item.studentId, item.origin, item.destination, item.comment, item.busNumber]
        .some((value) => String(value || '').toLowerCase().includes(q))
    );
  }, [ticketFeedbacks, ticketFeedbackSearch]);
  const visibleTabs = isAnalyst ? tabs.filter((tab) => isTabAllowed(tab.key)) : tabs;

  const analyticsByTab = useMemo<Record<TabKey, AnalyticsChart[]>>(() => {
    const usersByStatus = users.reduce<Record<string, number>>((acc, user) => {
      const key = user.status === 'active' ? 'فعال' : 'معلق';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const usersByProvince = users.reduce<Record<string, number>>((acc, user) => {
      const key = String(user.province || 'نامشخص');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const usersByCreateDate = users.reduce<Record<string, number>>((acc, user) => {
      const key = toDateBucket(user.createdAt) || 'بدون تاریخ';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const driversByStatus = drivers.reduce<Record<string, number>>((acc, item) => {
      const key = item.status === 'active' ? 'فعال' : 'غیرفعال';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const driversByCapacity = drivers.reduce<Record<string, number>>((acc, item) => {
      const cap = Number(item.capacity || 0);
      const key = cap <= 20 ? 'کم (<=20)' : cap <= 35 ? 'متوسط (21-35)' : 'زیاد (>35)';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const driversByDate = drivers.reduce<Record<string, number>>((acc, item) => {
      const key = toDateBucket(item.createdAt) || 'بدون تاریخ';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const stationsByStatus = stations.reduce<Record<string, number>>((acc, item) => {
      const key = item.isActive ? 'فعال' : 'غیرفعال';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const stationsByRegion = stations.reduce<Record<string, number>>((acc, item) => {
      const lat = Number(item.lat || 0);
      const key = lat >= 35.7 ? 'شمال شهر' : 'جنوب شهر';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const stationsByNameLen = stations.reduce<Record<string, number>>((acc, item) => {
      const len = String(item.name || '').length;
      const key = len <= 10 ? 'نام کوتاه' : len <= 20 ? 'نام متوسط' : 'نام بلند';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const schedulesByStatus = schedules.reduce<Record<string, number>>((acc, item) => {
      const key = item.status === 'active' ? 'فعال' : 'غیرفعال';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const schedulesByRoute = schedules.reduce<Record<string, number>>((acc, item) => {
      const origin = stations.find((s) => s.id === item.originStationId)?.name || 'نامشخص';
      const dest = stations.find((s) => s.id === item.destinationStationId)?.name || 'نامشخص';
      const key = `${origin} ← ${dest}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const schedulesByHour = schedules.reduce<Record<string, number>>((acc, item) => {
      const hour = Number(String(item.departureTime || '00:00').split(':')[0] || 0);
      const bucket = hour < 9 ? 'صبح' : hour < 15 ? 'ظهر' : 'عصر/شب';
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, {});

    const financeByType = filteredFinance.reduce<Record<string, number>>((acc, rec) => {
      const key = rec.type === 'student' ? 'دانشجو' : rec.type === 'driver' ? 'راننده' : 'شرکت';
      acc[key] = (acc[key] || 0) + Number(rec.amount || 0);
      return acc;
    }, {});
    const financeByDate = filteredFinance.reduce<Record<string, number>>((acc, rec) => {
      const key = toDateBucket(rec.date) || 'بدون تاریخ';
      acc[key] = (acc[key] || 0) + Number(rec.amount || 0);
      return acc;
    }, {});
    const financeByAmountBand = filteredFinance.reduce<Record<string, number>>((acc, rec) => {
      const amount = Number(rec.amount || 0);
      const key = amount < 100000 ? 'کمتر از ۱۰۰هزار' : amount < 500000 ? '۱۰۰ تا ۵۰۰هزار' : amount < 2000000 ? '۵۰۰هزار تا ۲میلیون' : 'بیشتر از ۲میلیون';
      acc[key] = (acc[key] || 0) + Number(rec.amount || 0);
      return acc;
    }, {});

    const pendingByDate = pendingRequests.reduce<Record<string, number>>((acc, rec) => {
      const key = toDateBucket(rec.createdAt) || 'بدون تاریخ';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const historyByStatus = historyRequests.reduce<Record<string, number>>((acc, rec) => {
      const key = rec.status === 'active' ? 'تایید شده' : rec.status === 'rejected' ? 'رد شده' : 'معلق';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const historyByDate = historyRequests.reduce<Record<string, number>>((acc, rec) => {
      const key = toDateBucket(rec.createdAt) || 'بدون تاریخ';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const notificationsByStatus = notifications.reduce<Record<string, number>>((acc, n) => {
      const key = n.status === 'active' ? 'فعال' : 'آرشیو';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const notificationsByType = notifications.reduce<Record<string, number>>((acc, n) => {
      const key = n.type === 'warning' ? 'هشدار' : n.type === 'error' ? 'خطا' : n.type === 'success' ? 'موفق' : 'اطلاع';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const notificationsByDate = notifications.reduce<Record<string, number>>((acc, n) => {
      const key = toDateBucket(n.date) || 'بدون تاریخ';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const supportByStatus = supportTickets.reduce<Record<string, number>>((acc, t) => {
      const key = t.status === 'open' ? 'باز' : t.status === 'in_progress' ? 'درحال بررسی' : t.status === 'answered' ? 'پاسخ داده شده' : 'بسته';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const supportByDate = supportTickets.reduce<Record<string, number>>((acc, t) => {
      const key = toDateBucket(t.createdAt) || 'بدون تاریخ';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const supportByDayPart = supportTickets.reduce<Record<string, number>>((acc, t) => {
      const hour = Number(String(t.createdAt || '').slice(11, 13) || 0);
      const key = hour < 8 ? 'بامداد' : hour < 14 ? 'صبح' : hour < 19 ? 'عصر' : 'شب';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const ideasByStatus = ideas.reduce<Record<string, number>>((acc, idea) => {
      const map: Record<string, string> = { submitted: 'ثبت شده', reviewing: 'درحال بررسی', approved: 'تایید شده', rejected: 'رد شده', done: 'انجام شد' };
      const key = map[idea.status] || 'نامشخص';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const ideasByCategory = ideas.reduce<Record<string, number>>((acc, idea) => {
      const key = String((idea as any).category || 'بدون دسته');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const ideasByDate = ideas.reduce<Record<string, number>>((acc, idea) => {
      const key = toDateBucket(idea.createdAt) || 'بدون تاریخ';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const mapPoints = (obj: Record<string, number>) =>
      Object.entries(obj).map(([label, value]) => ({ label, value: Number(value || 0) }));

    return {
      dashboard: [
        { id: 'dash-pie', title: 'سهم شاخص‌های اصلی', kind: 'pie', points: [
          { label: 'کاربران', value: users.length },
          { label: 'رانندگان', value: drivers.length },
          { label: 'ایستگاه‌ها', value: stations.length },
          { label: 'برنامه‌ها', value: schedules.length }
        ] },
        { id: 'dash-line', title: 'روند وضعیت تیکت‌ها', kind: 'line', points: [
          { label: 'تیکت‌ها', value: supportTickets.length },
          { label: 'ایده‌ها', value: ideas.length },
          { label: 'اطلاعیه‌ها', value: notifications.length },
          { label: 'درخواست‌ها', value: pendingRequests.length }
        ] },
        { id: 'dash-tech', title: 'مقایسه شاخص‌های کلیدی', kind: 'bar', points: [
          { label: 'کاربران', value: users.length },
          { label: 'رانندگان', value: drivers.length },
          { label: 'برنامه‌ها', value: schedules.length },
          { label: 'تیکت‌ها', value: supportTickets.length }
        ] }
      ],
      users: [
        { id: 'users-pie', title: 'ترکیب وضعیت کاربران', kind: 'pie', points: mapPoints(usersByStatus) },
        { id: 'users-line', title: 'توزیع کاربران بر اساس استان', kind: 'line', points: topN(mapPoints(usersByProvince), 8) },
        { id: 'users-tech', title: 'روند ثبت کاربران', kind: 'bar', points: mapPoints(usersByCreateDate) }
      ],
      drivers: [
        { id: 'drivers-pie', title: 'وضعیت رانندگان', kind: 'pie', points: mapPoints(driversByStatus) },
        { id: 'drivers-line', title: 'توزیع ظرفیت ناوگان', kind: 'line', points: mapPoints(driversByCapacity) },
        { id: 'drivers-tech', title: 'روند ثبت رانندگان', kind: 'bar', points: mapPoints(driversByDate) }
      ],
      stations: [
        { id: 'stations-pie', title: 'وضعیت ایستگاه‌ها', kind: 'pie', points: mapPoints(stationsByStatus) },
        { id: 'stations-line', title: 'پراکندگی مکانی ایستگاه‌ها', kind: 'line', points: mapPoints(stationsByRegion) },
        { id: 'stations-tech', title: 'تحلیل ساختار نام ایستگاه‌ها', kind: 'bar', points: mapPoints(stationsByNameLen) }
      ],
      schedules: [
        { id: 'schedules-pie', title: 'وضعیت برنامه‌ها', kind: 'pie', points: mapPoints(schedulesByStatus) },
        { id: 'schedules-line', title: 'برنامه‌ها به تفکیک مسیر', kind: 'line', points: topN(mapPoints(schedulesByRoute), 8) },
        { id: 'schedules-tech', title: 'الگوی ساعات حرکت', kind: 'bar', points: mapPoints(schedulesByHour) }
      ],
      finance: [
        { id: 'finance-pie', title: 'سهم مالی بر اساس نوع', kind: 'pie', points: mapPoints(financeByType) },
        { id: 'finance-line', title: 'روند مالی روزانه', kind: 'line', points: mapPoints(financeByDate) },
        { id: 'finance-tech', title: 'تعداد تراکنش در بازه‌های مبلغ', kind: 'bar', points: mapPoints(financeByAmountBand) }
      ],
      requests: [
        { id: 'requests-pie', title: 'نتیجه درخواست رانندگان', kind: 'pie', points: mapPoints(historyByStatus) },
        { id: 'requests-line', title: 'درخواست‌های در انتظار (روزانه)', kind: 'line', points: mapPoints(pendingByDate) },
        { id: 'requests-tech', title: 'روند تاریخچه درخواست‌ها', kind: 'bar', points: mapPoints(historyByDate) }
      ],
      notifications: [
        { id: 'notif-pie', title: 'وضعیت اطلاعیه‌ها', kind: 'pie', points: mapPoints(notificationsByStatus) },
        { id: 'notif-line', title: 'نوع اطلاعیه‌ها', kind: 'line', points: mapPoints(notificationsByType) },
        { id: 'notif-tech', title: 'روند انتشار اطلاعیه', kind: 'bar', points: mapPoints(notificationsByDate) }
      ],
      support: [
        { id: 'support-pie', title: 'وضعیت تیکت‌ها', kind: 'pie', points: mapPoints(supportByStatus) },
        { id: 'support-line', title: 'توزیع زمانی تیکت‌ها', kind: 'line', points: mapPoints(supportByDayPart) },
        { id: 'support-tech', title: 'روند ثبت تیکت', kind: 'bar', points: mapPoints(supportByDate) }
      ],
      ideas: [
        { id: 'ideas-pie', title: 'وضعیت ایده‌ها', kind: 'pie', points: mapPoints(ideasByStatus) },
        { id: 'ideas-line', title: 'دسته‌بندی ایده‌ها', kind: 'line', points: topN(mapPoints(ideasByCategory), 8) },
        { id: 'ideas-tech', title: 'روند ثبت ایده', kind: 'bar', points: mapPoints(ideasByDate) }
      ],
      legal: [
        { id: 'legal-pie', title: 'حجم قوانین به تفکیک مخاطب', kind: 'pie', points: [
          { label: 'کاربر', value: legalAudience === 'user' ? (legalContent?.length || 0) : 0 },
          { label: 'راننده', value: legalAudience === 'driver' ? (legalContent?.length || 0) : 0 }
        ] },
        { id: 'legal-line', title: 'ساختار متن قوانین', kind: 'line', points: [
          { label: 'کاراکتر', value: legalContent?.length || 0 },
          { label: 'کلمه', value: String(legalContent || '').trim().split(/\s+/).filter(Boolean).length },
          { label: 'خط', value: String(legalContent || '').split('\n').filter((l) => l.trim()).length }
        ] },
        { id: 'legal-tech', title: 'نوسان طول قوانین', kind: 'bar', points: [
          { label: legalAudience === 'user' ? 'نسخه کاربران' : 'نسخه رانندگان', value: legalContent?.length || 0, open: Math.max(0, (legalContent?.length || 0) - 80), high: (legalContent?.length || 0) + 40, low: Math.max(0, (legalContent?.length || 0) - 120), close: legalContent?.length || 0 }
        ] }
      ]
    };
  }, [
    users,
    drivers,
    stations,
    schedules,
    filteredFinance,
    pendingRequests,
    historyRequests,
    notifications,
    supportTickets,
    ideas,
    legalAudience,
    legalContent
  ]);
  const analystDashboardCharts = useMemo(
    () => analyticsByTab.dashboard.filter((chart) => chart.id !== 'dash-tech'),
    [analyticsByTab.dashboard]
  );

  return (
    <div className="min-h-[100dvh] bg-gray-50 text-gray-800 flex flex-col lg:flex-row font-sans overflow-x-hidden" dir="rtl">
      {/* Sidebar */}
      <aside className={`w-full bg-white border-b lg:border-b-0 lg:border-l border-gray-200 flex flex-col gap-3 shadow-sm z-10 lg:sticky lg:top-0 lg:h-[100dvh] overflow-y-visible lg:overflow-y-auto shrink-0 transition-all duration-300 ${isSidebarCollapsed ? 'lg:w-20 lg:p-3' : 'lg:w-72 lg:p-4'}`}>
        <div className="p-4 rounded-[26px] bg-[linear-gradient(135deg,_#0f766e_0%,_#0369a1_55%,_#2563eb_100%)] text-white shadow-[0_20px_50px_rgba(14,165,233,0.28)]">
          <div className={`flex items-start gap-3 ${isSidebarCollapsed ? 'lg:flex-col lg:items-center lg:gap-2' : 'justify-between'}`}>
            <div className={isSidebarCollapsed ? 'lg:text-center lg:hidden' : ''}>
              <div className="text-lg font-black">{isAnalyst ? 'پنل تحلیل‌گر' : 'پنل سوپر ادمین'}</div>
              <div className="text-[11px] mt-1 bg-white/20 inline-flex px-2 py-1 rounded-full font-bold">
                {isAnalyst ? 'نقش ورود: تحلیل‌گر' : 'نقش ورود: سوپر ادمین'}
              </div>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <Icons.Activity size={20} />
            </div>
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              className="hidden lg:inline-flex w-10 h-10 items-center justify-center rounded-2xl bg-white/15 border border-white/15 text-white hover:bg-white/25 transition-colors mr-auto"
              title={isSidebarCollapsed ? 'باز کردن سایدبار' : 'جمع کردن سایدبار'}
            >
              <Icons.Menu size={18} />
            </button>
          </div>
          <div className={`mt-4 grid grid-cols-2 gap-2 text-[11px] font-bold text-white/90 ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>
            <div className="rounded-2xl bg-white/10 px-3 py-2">دسترسی سریع</div>
            <div className="rounded-2xl bg-white/10 px-3 py-2">نمایش تجمیعی</div>
          </div>
        </div>

        <button onClick={() => activeTab === 'finance' ? loadFinance(financeTab as any) : loadAll()} className="w-full text-sm bg-gray-50 border border-gray-200 hover:bg-gray-100 rounded-2xl py-2.5 font-black text-gray-600 transition-colors">بروزرسانی اطلاعات</button>

        <div className="space-y-2 mt-2">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setSelectedUser(null);
                }}
                className={`w-full text-right px-3.5 py-3.5 rounded-2xl border flex items-center gap-3 transition-all ${
                  activeTab === tab.key
                    ? 'bg-vira-light border-vira-accent text-vira-primary shadow-sm'
                    : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-800'
                } ${isSidebarCollapsed ? 'lg:px-2 lg:justify-center' : ''}`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-white/70 ${isSidebarCollapsed ? 'lg:mx-auto' : ''}`}>
                  <Icon size={18} />
                </div>
                <span className={`text-sm font-bold ${isSidebarCollapsed ? 'lg:hidden' : ''}`}>{tab.label}</span>
                {tab.key === 'requests' && pendingRequests.length > 0 && !isSidebarCollapsed && (
                    <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full mr-auto">{pendingRequests.length}</span>
                )}
              </button>
            );
          })}
        </div>

        <button onClick={onLogout} className={`mt-auto w-full text-sm bg-red-50 border border-red-100 text-red-700 dark:text-red-300 rounded-xl py-3 font-bold hover:bg-red-100 transition-colors ${isSidebarCollapsed ? 'lg:px-2' : ''}`}>خروج از حساب</button>
      </aside>

      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto lg:h-[100dvh] relative">
        {message && <div className="mb-6 text-sm p-4 rounded-xl border border-vira-accent bg-vira-light text-vira-primary shadow-sm font-bold animate-in fade-in slide-in-from-top-2">{message}</div>}
        {loading && <div className="mb-6 text-xs text-gray-600 dark:text-gray-400 font-bold animate-pulse">در حال دریافت اطلاعات از سرور...</div>}
        <AdminAnalyticsPanel
          sectionLabel={
            tabs.find((t) => t.key === activeTab)?.label || 'تحلیل'
          }
          charts={isAnalyst && activeTab === 'dashboard' ? analystDashboardCharts : (analyticsByTab[activeTab] || [])}
          updatedAt={analyticsUpdatedAt}
          allowExport
        />
        {/* ... (DASHBOARD, NOTIFICATIONS, REQUESTS, USERS, STATIONS, SCHEDULES TABS) ... */}
        {/* --- DASHBOARD TAB --- */}
        {activeTab === 'dashboard' && isTabAllowed('dashboard') && (
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
            {stats.map((stat) => (
                <div key={stat.title} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
                <div className="w-12 h-12 bg-vira-light rounded-full flex items-center justify-center text-vira-primary mb-3">
                    <stat.icon size={22} />
                </div>
                <div className="text-sm text-gray-500 font-bold">{stat.title}</div>
                <div className="text-3xl font-black mt-2 text-gray-800">{stat.value}</div>
                </div>
            ))}
            </div>
        )}

        {isAnalyst && activeTab === 'dashboard' && (
          <div className="mt-6">
            {renderAggregateCards(
              'نمای تجمیعی داشبورد',
              'فقط شاخص‌های کلان نمایش داده می‌شوند و دسترسی به داده‌های خام و عملیات مدیریتی در این نقش غیرفعال است.',
              [
                { label: 'کاربران', value: users.length.toLocaleString('fa-IR'), icon: Icons.Users },
                { label: 'رانندگان', value: drivers.length.toLocaleString('fa-IR'), icon: Icons.Car },
                { label: 'ایستگاه‌ها', value: stations.length.toLocaleString('fa-IR'), icon: Icons.MapPin },
                { label: 'برنامه‌ها', value: schedules.length.toLocaleString('fa-IR'), icon: Icons.Calendar }
              ]
            )}
          </div>
        )}

        {/* --- NOTIFICATIONS TAB --- */}
        {activeTab === 'notifications' && isTabAllowed('notifications') && (
            isAnalyst ? (
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                  <h3 className="font-black text-gray-800 mb-2">نمای تجمیعی اطلاعیه‌ها</h3>
                  <p className="text-sm text-gray-500 leading-7 mb-4">برای تحلیل‌گر فقط شاخص‌های خلاصه، نمودارها و وضعیت کلی نمایش داده می‌شود.</p>
                  <div className="grid md:grid-cols-3 gap-3">
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                      <div className="text-xs text-gray-500 font-bold">فعال</div>
                      <div className="text-2xl font-black mt-2 text-gray-800">{activeNotifications.length.toLocaleString('fa-IR')}</div>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                      <div className="text-xs text-gray-500 font-bold">آرشیو</div>
                      <div className="text-2xl font-black mt-2 text-gray-800">{archivedNotifications.length.toLocaleString('fa-IR')}</div>
                    </div>
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                      <div className="text-xs text-gray-500 font-bold">کل اطلاعیه‌ها</div>
                      <div className="text-2xl font-black mt-2 text-gray-800">{notifications.length.toLocaleString('fa-IR')}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
            // ... (Notification content unchanged) ...
            <div className="grid lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
                <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b font-bold sticky top-0 bg-white z-10">مدیریت اطلاعیه‌ها</div>
                    <div className="overflow-auto flex-1 p-4 space-y-3">
                        {notifications.length === 0 && <div className="text-center text-gray-600 dark:text-gray-400 mt-10">هیچ اطلاعیه‌ای وجود ندارد</div>}
                        {activeNotifications.length > 0 && <div className="text-xs font-black text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">اطلاعیه‌ها (فعال)</div>}
                        {activeNotifications.map((notif) => (
                          <div key={notif.id} className="p-4 rounded-xl border bg-white border-gray-200 shadow-sm transition-all">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${notif.type === 'warning' ? 'bg-orange-500' : notif.type === 'error' ? 'bg-red-500' : notif.type === 'success' ? 'bg-green-500' : 'bg-blue-500'}`}></span>
                                <h4 className="font-bold text-gray-800">{notif.title}</h4>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] bg-gray-100 px-2 py-1 rounded text-gray-500">{notif.date}</span>
                                <span className="text-[10px] bg-vira-light text-vira-primary px-2 py-1 rounded font-bold">
                                  {(notif as any).audience === 'student' ? 'دانشجو' : (notif as any).audience === 'driver' ? 'راننده' : 'هر دو'}
                                </span>
                              </div>
                            </div>
                            <p className="text-sm text-gray-600 leading-6 mb-3">{notif.message}</p>
                            <div className="flex justify-end gap-2 border-t pt-3">
                              <button onClick={() => handleEditNotification(notif)} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-bold">ویرایش</button>
                              <button onClick={() => handleToggleNotification(notif)} className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-200 font-bold">آرشیو</button>
                              <button onClick={() => handleDeleteNotificationItem(notif.id)} className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 font-bold">حذف</button>
                            </div>
                          </div>
                        ))}
                        {archivedNotifications.length > 0 && <div className="text-xs font-black text-gray-700 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 mt-6">آرشیو</div>}
                        {archivedNotifications.map((notif) => (
                          <div key={notif.id} className="p-4 rounded-xl border bg-gray-50 border-gray-200 opacity-70 transition-all">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${notif.type === 'warning' ? 'bg-orange-500' : notif.type === 'error' ? 'bg-red-500' : notif.type === 'success' ? 'bg-green-500' : 'bg-blue-500'}`}></span>
                                <h4 className="font-bold text-gray-800">{notif.title}</h4>
                              </div>
                              <span className="text-[10px] bg-gray-200 px-2 py-1 rounded text-gray-500">{notif.date}</span>
                            </div>
                            <p className="text-sm text-gray-600 leading-6 mb-3">{notif.message}</p>
                            <div className="flex justify-end gap-2 border-t pt-3">
                              <button onClick={() => handleToggleNotification(notif)} className="text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-100 font-bold">فعال‌سازی</button>
                              <button onClick={() => handleDeleteNotificationItem(notif.id)} className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 font-bold">حذف</button>
                            </div>
                          </div>
                        ))}
                    </div>
                </div>
                <form onSubmit={handleSaveNotification} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 h-fit sticky top-0 shadow-sm">
                    <h3 className="font-bold text-gray-800 border-b pb-3 mb-2">
                        {editingNotifId ? 'ویرایش اطلاعیه' : 'ایجاد اطلاعیه جدید'}
                    </h3>
                    {/* ... (Form Fields) ... */}
                    <div className="space-y-1">
                        <label className="text-xs text-gray-500 font-bold">عنوان</label>
                        <input value={notifTitle} onChange={e => setNotifTitle(e.target.value)} placeholder="مثلاً: ثبت نام وام دانشجویی" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-vira-primary text-sm" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-gray-500 font-bold">متن پیام</label>
                        <textarea value={notifMessage} onChange={e => setNotifMessage(e.target.value)} placeholder="متن کامل اطلاعیه..." rows={4} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-vira-primary text-sm resize-none" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-gray-500 font-bold">نوع پیام</label>
                        <div className="flex gap-2">
                            {['info', 'warning', 'success', 'error'].map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setNotifType(t)}
                                    className={`flex-1 py-2 rounded-lg text-xs font-bold capitalize transition-colors ${notifType === t ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                >
                                    {t === 'info' ? 'اطلاع' : t === 'warning' ? 'هشدار' : t === 'success' ? 'موفقیت' : 'خطا'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-gray-500 font-bold">مخاطب اطلاعیه</label>
                        <div className="grid grid-cols-3 gap-2">
                            {([
                              { key: 'student', label: 'دانشجو' },
                              { key: 'driver', label: 'راننده' },
                              { key: 'both', label: 'هر دو' }
                            ] as const).map(a => (
                                <button
                                  key={a.key}
                                  type="button"
                                  onClick={() => setNotifAudience(a.key)}
                                  className={`py-2 rounded-lg text-xs font-bold transition-colors ${
                                    notifAudience === a.key ? 'bg-vira-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                  }`}
                                >
                                  {a.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                        {editingNotifId && <button type="button" onClick={handleCancelEditNotif} className="flex-1 bg-gray-100 text-gray-600 py-3 rounded-xl font-bold text-sm">انصراف</button>}
                        <button type="submit" className="flex-[2] bg-vira-primary text-white py-3 rounded-xl font-bold shadow-lg shadow-vira-accent/50 text-sm hover:bg-vira-secondary transition-all">
                            {editingNotifId ? 'ذخیره تغییرات' : 'انتشار اطلاعیه'}
                        </button>
                    </div>
                </form>
            </div>
            )
        )}

        {activeTab === 'legal' && isTabAllowed('legal') && (
          <div className="grid lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-black text-gray-800">قوانین و مقررات</h3>
                  <div className="text-xs text-gray-500 mt-1">
                    {legalUpdatedAt ? `آخرین بروزرسانی: ${new Date(legalUpdatedAt).toLocaleString('fa-IR')}` : 'آخرین بروزرسانی: -'}
                    {legalUpdatedBy ? ` • توسط: ${legalUpdatedBy}` : ''}
                  </div>
                </div>
                <button onClick={() => loadLegal(legalAudience)} className="text-xs bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 font-bold hover:bg-gray-200">بروزرسانی</button>
              </div>
              <textarea
                value={legalContent}
                onChange={(e) => setLegalContent(e.target.value)}
                rows={20}
                disabled={isAnalyst}
                className="w-full flex-1 min-h-[380px] bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm leading-7 outline-none focus:border-vira-primary disabled:opacity-70"
                placeholder="متن قوانین را اینجا وارد کنید..."
              />
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4 h-fit">
              <h4 className="font-bold text-gray-800">انتخاب مخاطب قوانین</h4>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setLegalAudience('user'); loadLegal('user'); }} className={`py-2 rounded-lg text-xs font-bold ${legalAudience === 'user' ? 'bg-vira-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>کاربر</button>
                <button onClick={() => { setLegalAudience('driver'); loadLegal('driver'); }} className={`py-2 rounded-lg text-xs font-bold ${legalAudience === 'driver' ? 'bg-vira-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>راننده</button>
              </div>
              <button
                type="button"
                onClick={handleSaveLegal}
                disabled={isAnalyst}
                className={`w-full py-3 rounded-xl text-sm font-bold ${isAnalyst ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-vira-primary text-white hover:bg-vira-secondary'}`}
              >
                ذخیره قوانین
              </button>
            </div>
          </div>
        )}

        {/* --- SUPPORT TICKETS TAB --- */}
        {activeTab === 'support' && isTabAllowed('support') && (
          isAnalyst ? (
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                <h3 className="font-black text-gray-800 mb-2">نمای تجمیعی تیکت‌ها</h3>
                <p className="text-sm text-gray-500 leading-7">در این نقش فقط وضعیت‌های کلان، نمودارها و آمار تجمیعی نشان داده می‌شود.</p>
              </div>
            </div>
          ) : (
          <div className="grid lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
            <div className="lg:col-span-1 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b font-bold sticky top-0 bg-white z-10 flex items-center justify-between gap-3">
                <span>تیکت‌ها</span>
                <button onClick={loadSupportTickets} className="text-xs bg-gray-50 border px-3 py-1.5 rounded-lg hover:bg-gray-100 font-bold">بروزرسانی</button>
              </div>
              <div className="p-4 border-b space-y-3">
                <div className="flex gap-2">
                  <select value={supportStatusFilter} onChange={(e) => { setSupportStatusFilter(e.target.value as any); setSelectedSupportTicket(null); }} className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold outline-none">
                    <option value="">همه وضعیت‌ها</option>
                    <option value="open">باز</option>
                    <option value="in_progress">درحال بررسی</option>
                    <option value="answered">پاسخ داده شده</option>
                    <option value="closed">بسته شده</option>
                  </select>
                </div>
                <div className="relative">
                  <input value={supportSearch} onChange={(e) => setSupportSearch(e.target.value)} placeholder="جستجو (عنوان/ID/دانشجویی)..." className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-vira-primary" />
                  <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400" size={16} />
                </div>
              </div>
              <div className="overflow-auto flex-1">
                <table className="w-full text-sm text-right">
                  <thead className="bg-gray-50 text-gray-600 font-bold border-b">
                    <tr>
                      <th className="p-3">شناسه</th>
                      <th className="p-3">عنوان</th>
                      <th className="p-3">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredSupportTickets.map(t => (
                      <tr
                        key={t.id}
                        onClick={() => { openSupportTicket(t.id); }}
                        className={`cursor-pointer transition-colors ${selectedSupportTicket?.id === t.id ? 'bg-vira-light' : 'hover:bg-gray-50'}`}
                      >
                        <td className="p-3 font-mono text-gray-500">{t.id}</td>
                        <td className="p-3 font-bold text-gray-800 truncate max-w-[160px]">{t.title}</td>
                        <td className="p-3">
                          <span className={`text-[10px] px-2 py-1 rounded-lg border font-bold ${
                            t.status === 'open' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                            t.status === 'in_progress' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                            t.status === 'answered' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                            'bg-gray-100 text-gray-600 border-gray-200'
                          }`}>
                            {t.status === 'open' ? 'باز' : t.status === 'in_progress' ? 'درحال بررسی' : t.status === 'answered' ? 'پاسخ داده شده' : 'بسته شده'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filteredSupportTickets.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-gray-600 dark:text-gray-400">تیکتی یافت نشد</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm overflow-y-auto">
              {!selectedSupportTicket ? (
                <div className="h-full flex items-center justify-center text-gray-600 dark:text-gray-400 font-bold">برای مشاهده جزئیات، یک تیکت را انتخاب کنید.</div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4 border-b pb-4">
                    <div>
                      <h2 className="text-xl font-black text-gray-800">{selectedSupportTicket.title}</h2>
                      <div className="text-sm text-gray-500 mt-1">
                        کاربر: <span className="font-bold">{selectedSupportTicket.user.name}</span> | شماره دانشجویی: <span className="font-mono">{selectedSupportTicket.user.studentId}</span>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">ایجاد: {new Date(selectedSupportTicket.createdAt).toLocaleString('fa-IR')}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <button type="button" onClick={() => handleProtectedDownload(adminSupportTicketTxtUrl(selectedSupportTicket.id), `ticket-${selectedSupportTicket.id}.txt`)} className="text-xs bg-blue-50 text-blue-600 px-3 py-2 rounded-xl font-bold hover:bg-blue-100">دانلود TXT</button>
                      <button onClick={() => setSelectedSupportTicket(null)} className="text-xs bg-gray-50 border px-3 py-2 rounded-xl font-bold hover:bg-gray-100">بستن</button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {selectedSupportTicket.messages.map(m => (
                      <div key={m.id} className={`flex ${m.senderRole === 'admin' ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[92%] rounded-2xl p-4 text-sm leading-7 border shadow-sm ${
                          m.senderRole === 'admin' ? 'bg-gray-50 border-gray-200' : 'bg-vira-primary text-white border-vira-primary/20'
                        }`}>
                          <div className={`text-[10px] font-bold mb-2 flex items-center justify-between gap-3 ${m.senderRole === 'admin' ? 'text-gray-500' : 'text-white/90'}`}>
                            <span>{m.senderRole === 'admin' ? 'ادمین' : 'کاربر'}</span>
                            <span>{new Date(m.createdAt).toLocaleString('fa-IR')}</span>
                          </div>
                          <div className="whitespace-pre-line">{m.message}</div>
                          {m.attachments?.length > 0 && (
                            <div className={`mt-3 pt-3 border-t border-dashed ${m.senderRole === 'admin' ? 'border-gray-200' : 'border-white/30'}`}>
                              <div className="text-[10px] font-black mb-2 opacity-90">ضمیمه‌ها</div>
                              <div className="space-y-2">
                                {m.attachments.map(a => (
                                  <button
                                    type="button"
                                    key={a.id}
                                    onClick={() => handleProtectedDownload(adminSupportAttachmentDownloadUrl(a.id), a.originalName || `attachment-${a.id}`)}
                                    className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border ${
                                      m.senderRole === 'admin' ? 'bg-white border-gray-200' : 'bg-white/10 border-white/20'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <Icons.Download size={16} className={m.senderRole === 'admin' ? 'text-gray-500' : 'text-white'} />
                                      <span className={`text-xs font-bold truncate ${m.senderRole === 'admin' ? 'text-gray-700' : 'text-white'}`}>{a.originalName}</span>
                                    </div>
                                    <span className={`text-[10px] opacity-80 shrink-0 ${m.senderRole === 'admin' ? 'text-gray-600 dark:text-gray-400' : 'text-white/80'}`}>{Math.round((a.sizeBytes || 0) / 1024)} KB</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {(['open','in_progress','answered','closed'] as SupportTicketStatus[]).map(st => (
                        <button
                          key={st}
                          onClick={() => handleAdminSetSupportStatus(st)}
                          className={`text-xs px-4 py-2 rounded-xl font-bold border transition-colors ${
                            selectedSupportTicket.status === st ? 'bg-vira-primary text-white border-vira-primary' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          {st === 'open' ? 'باز' : st === 'in_progress' ? 'درحال بررسی' : st === 'answered' ? 'پاسخ داده شده' : 'بسته'}
                        </button>
                      ))}
                    </div>
                    <input value={supportStatusNote} onChange={(e) => setSupportStatusNote(e.target.value)} placeholder="یادداشت ادمین (اختیاری)..." className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-vira-primary" />

                    <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-3">
                      <div className="font-bold text-gray-700">ارسال پاسخ</div>
                      <textarea value={supportReply} onChange={(e) => setSupportReply(e.target.value)} rows={3} className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary leading-7" placeholder="پاسخ را بنویسید..." />
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <label className="text-xs font-bold text-gray-500 flex items-center gap-2 cursor-pointer">
                          <Icons.UploadCloud size={16} />
                          افزودن ضمیمه
                          <input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.txt" className="hidden" onChange={(e) => e.target.files && readSupportFiles(e.target.files)} />
                        </label>
                        {supportReplyFiles.length > 0 && <span className="text-[11px] text-gray-600 dark:text-gray-400">{supportReplyFiles.length} فایل انتخاب شد</span>}
                      </div>
                      {supportReplyFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {supportReplyFiles.map((f, idx) => (
                            <button key={idx} onClick={() => setSupportReplyFiles(prev => prev.filter((_, i) => i !== idx))} className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-700 flex items-center gap-2">
                              <Icons.X size={14} />
                              <span className="max-w-[180px] truncate">{f.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <button onClick={handleAdminReplySupport} className="w-full bg-vira-primary hover:bg-vira-secondary text-white rounded-xl p-3 font-bold shadow-lg shadow-vira-accent/50 transition-all">ارسال پاسخ</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          )
        )}

        {/* --- REQUESTS TAB --- */}
        {activeTab === 'requests' && isTabAllowed('requests') && (
            // ... (Requests content unchanged) ...
            <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col">
                <div className="flex gap-2 border-b pb-4">
                    <button 
                        onClick={() => setRequestTab('pending')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${requestTab === 'pending' ? 'bg-vira-primary text-white shadow-md' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}
                    >
                        درخواست‌های در جریان ({pendingRequests.length})
                    </button>
                    <button 
                        onClick={() => setRequestTab('history')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${requestTab === 'history' ? 'bg-vira-primary text-white shadow-md' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}
                    >
                        بررسی شده / تاریخچه
                    </button>
                </div>
                {/* ... (Existing Pending/History Views) ... */}
                {requestTab === 'pending' && (
                    <div className="grid lg:grid-cols-3 gap-6 flex-1 overflow-hidden">
                        <div className="lg:col-span-1 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                            <div className="p-4 border-b font-bold sticky top-0 bg-white z-10">لیست انتظار</div>
                            <div className="overflow-auto flex-1">
                                <table className="w-full text-sm text-right">
                                    <thead className="bg-gray-50 text-gray-600 font-bold border-b">
                                        <tr>
                                            <th className="p-3">نام</th>
                                            <th className="p-3">کد ملی</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {pendingRequests.map(req => (
                                            <tr 
                                                key={req.id} 
                                                onClick={() => setSelectedRequest(req)}
                                                className={`cursor-pointer transition-colors ${selectedRequest?.id === req.id ? 'bg-vira-light' : 'hover:bg-gray-50'}`}
                                            >
                                                <td className="p-3 font-bold">{req.name}</td>
                                                <td className="p-3 font-mono text-gray-500">{req.nationalCode}</td>
                                            </tr>
                                        ))}
                                        {pendingRequests.length === 0 && (
                                            <tr>
                                                <td colSpan={2} className="p-6 text-center text-gray-600 dark:text-gray-400">هیچ درخواستی موجود نیست.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm overflow-y-auto">
                            {selectedRequest ? (
                                <div className="space-y-6">
                                    {/* ... Selected Request Details ... */}
                                    <div className="flex justify-between items-start border-b pb-4">
                                        <div>
                                            <h2 className="text-xl font-black text-gray-800">{selectedRequest.name}</h2>
                                            <p className="text-sm text-gray-500 mt-1">نام کاربری انتخابی: <span className="font-mono bg-gray-100 px-2 rounded">{selectedRequest.username}</span></p>
                                        </div>
                                        <div className="text-left">
                                            <div className="text-sm font-bold">{selectedRequest.licensePlate}</div>
                                            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">پلاک خودرو</div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div className="bg-gray-50 p-3 rounded-lg"><span className="text-gray-500 block mb-1">کد ملی</span><span className="font-bold">{selectedRequest.nationalCode}</span></div>
                                        <div className="bg-gray-50 p-3 rounded-lg"><span className="text-gray-500 block mb-1">تاریخ تولد</span><span className="font-bold">{selectedRequest.birthDate}</span></div>
                                        <div className="bg-gray-50 p-3 rounded-lg"><span className="text-gray-500 block mb-1">شماره تماس</span><span className="font-bold">{selectedRequest.phone}</span></div>
                                    </div>
                                    <div>
                                        <h4 className="font-bold mb-3 text-gray-700">مدارک ارسالی</h4>
                                        <div className="grid grid-cols-3 gap-4">
                                            {docTypes.map((doc) => {
                                                const src = (selectedRequest.documents as any)?.[doc.key];
                                                if(!src) return (
                                                    <div key={doc.key} className="border-2 border-dashed border-gray-300 rounded-xl h-32 flex items-center justify-center text-gray-600 dark:text-gray-400 text-xs font-bold bg-gray-50">
                                                        {doc.label} (موجود نیست)
                                                    </div>
                                                );
                                                return (
                                                    <div key={doc.key} className="border rounded-xl p-2 relative group bg-white shadow-sm overflow-hidden">
                                                        <img src={src} className="w-full h-32 object-contain rounded-lg bg-gray-50" alt={doc.label} />
                                                        <div className="text-center text-xs mt-2 font-bold text-gray-500">{doc.label}</div>
                                                        
                                                        <a 
                                                            href={src} 
                                                            download={`${selectedRequest.nationalCode}-${doc.key}.jpg`}
                                                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white font-bold transition-all duration-300 gap-2 backdrop-blur-sm"
                                                        >
                                                            <Icons.Download size={24} />
                                                            <span>دانلود تصویر</span>
                                                        </a>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                    <div className="pt-6 border-t flex flex-col gap-4">
                                        <button onClick={handleApprove} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-colors">تایید راننده و فعال‌سازی حساب</button>
                                        <div className="flex gap-2">
                                            <input 
                                                value={rejectReason} 
                                                onChange={e => setRejectReason(e.target.value)} 
                                                placeholder="علت رد درخواست را بنویسید..." 
                                                className="flex-1 border border-red-200 bg-red-50 rounded-xl px-4 py-3 text-sm outline-none focus:border-red-400 placeholder:text-red-300" 
                                            />
                                            <button onClick={handleReject} className="bg-red-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-red-600 whitespace-nowrap">رد درخواست</button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-600 dark:text-gray-400">
                                    <Icons.FileText size={48} className="mb-4 opacity-50" />
                                    <p>لطفا یک درخواست را جهت بررسی انتخاب کنید</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {requestTab === 'history' && (
                    <div className="flex flex-col gap-4 flex-1 overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-bold text-gray-700">تاریخچه بررسی‌ها</h3>
                            <button onClick={handleExportHistory} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                                <Icons.Download size={16} />
                                خروجی اکسل
                            </button>
                        </div>
                        <div className="flex gap-4 mb-4">
                            <input 
                                value={historySearchName}
                                onChange={e => setHistorySearchName(e.target.value)}
                                placeholder="جستجو نام..."
                                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-vira-primary"
                            />
                            <input 
                                value={historySearchCode}
                                onChange={e => setHistorySearchCode(toEnglishDigits(e.target.value))}
                                placeholder="جستجو کد ملی..."
                                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-vira-primary text-left dir-ltr"
                            />
                        </div>
                        <div className="overflow-auto flex-1">
                            <table className="w-full text-sm text-right">
                                <thead className="bg-gray-50 text-gray-600 font-bold border-b sticky top-0">
                                    <tr>
                                        <th className="p-3">نام</th>
                                        <th className="p-3">کد ملی</th>
                                        <th className="p-3">تاریخ درخواست</th>
                                        <th className="p-3">وضعیت نهایی</th>
                                        <th className="p-3">پلاک</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {filteredHistory.map(req => (
                                        <tr key={req.id} className="hover:bg-gray-50">
                                            <td className="p-3 font-bold">{req.name}</td>
                                            <td className="p-3 font-mono text-gray-500 dir-ltr text-right">{req.nationalCode}</td>
                                            <td className="p-3 text-gray-500 dir-ltr text-right">{new Date(req.createdAt).toLocaleDateString('fa-IR')}</td>
                                            <td className="p-3">
                                                {req.status === 'active' ? (
                                                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">تایید شده</span>
                                                ) : req.status === 'rejected' ? (
                                                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">رد شده</span>
                                                ) : (
                                                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">معلق</span>
                                                )}
                                            </td>
                                            <td className="p-3 font-mono text-gray-500 dir-ltr text-right">{req.licensePlate}</td>
                                        </tr>
                                    ))}
                                    {filteredHistory.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-gray-600 dark:text-gray-400">موردی یافت نشد</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* --- USERS TAB --- */}
        {activeTab === 'users' && isTabAllowed('users') && (
          isAnalyst ? (
            <div className="space-y-6">
              {renderAggregateCards(
                'خلاصه کاربران',
                'فقط آمار کلان نمایش داده می‌شود؛ جدول، ویرایش، حذف و شارژ برای تحلیل‌گر مخفی است.',
                [
                  { label: 'کل کاربران', value: users.length.toLocaleString('fa-IR'), icon: Icons.Users },
                  { label: 'فعال', value: users.filter((u) => u.status === 'active').length.toLocaleString('fa-IR'), icon: Icons.CheckCircle },
                  { label: 'معلق', value: users.filter((u) => u.status !== 'active').length.toLocaleString('fa-IR'), icon: Icons.Lock },
                  { label: 'استان‌ها', value: new Set(users.map((u) => u.province || 'نامشخص')).size.toLocaleString('fa-IR'), icon: Icons.MapPin }
                ]
              )}
            </div>
          ) : (
            // ... (Users content unchanged) ...
            <div className="flex gap-6 h-[calc(100vh-140px)]">
                <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                    {/* ... Search ... */}
                    <div className="flex flex-col gap-4 shrink-0">
                        <h3 className="font-bold text-lg">مدیریت کاربران</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="relative">
                                <input value={searchName} onChange={e => setSearchName(e.target.value)} placeholder="جستجو بر اساس نام..." className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-vira-primary shadow-sm pl-10" />
                                <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400" size={16} />
                            </div>
                            <div className="relative">
                                <input value={searchStudentId} onChange={e => setSearchStudentId(toEnglishDigits(e.target.value))} placeholder="شماره دانشجویی..." className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-vira-primary shadow-sm pl-10 text-left dir-ltr" />
                                <Icons.Book className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400" size={16} />
                            </div>
                            <div className="relative">
                                <input value={searchNationalCode} onChange={e => setSearchNationalCode(toEnglishDigits(e.target.value))} placeholder="کد ملی..." className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-vira-primary shadow-sm pl-10 text-left dir-ltr" />
                                <Icons.QrCode className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400" size={16} />
                            </div>
                        </div>
                    </div>
                    {/* ... Table ... */}
                    <div className="bg-white border border-gray-200 rounded-2xl overflow-y-auto shadow-sm flex-1">
                        <table className="w-full text-sm text-right">
                            <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-200 sticky top-0 z-10">
                                <tr>
                                    <th className="p-4">نام کاربر</th>
                                    <th className="p-4">شماره دانشجویی</th>
                                    <th className="p-4">کد ملی</th>
                                    <th className="p-4">موجودی</th>
                                    <th className="p-4">وضعیت</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredUsers.map((user) => (
                                    <tr 
                                        key={user.id} 
                                        onClick={() => { setSelectedUser(user); setTopupAmount(''); }}
                                        className={`hover:bg-vira-light cursor-pointer transition-colors ${selectedUser?.id === user.id ? 'bg-vira-light' : ''} ${user.status === 'suspended' ? 'bg-red-50/30' : ''}`}
                                    >
                                        <td className="p-4 font-bold">{user.name}</td>
                                        <td className="p-4 font-mono text-gray-600 dir-ltr text-right">{user.studentId}</td>
                                        <td className="p-4 font-mono text-gray-600 dir-ltr text-right">{user.nationalCode}</td>
                                        <td className="p-4 text-green-600 font-bold">{formatRialToToman(user.balance)}</td>
                                        <td className="p-4">
                                            {user.status === 'active' ? (
                                                <span className="bg-green-100 text-green-700 px-2 py-1 rounded-md text-xs font-bold">فعال</span>
                                            ) : (
                                                <span className="bg-red-100 text-red-700 px-2 py-1 rounded-md text-xs font-bold">معلق</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {filteredUsers.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-gray-600 dark:text-gray-400">کاربری یافت نشد</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="font-bold text-gray-800">مدیریت تحلیل‌گرها</h4>
                            <span className="text-xs text-gray-500">{analysts.length.toLocaleString('fa-IR')} نفر</span>
                        </div>
                        {!isAnalyst && (
                          <form onSubmit={handleCreateAnalyst} className="grid md:grid-cols-3 gap-2 mb-3">
                              <input value={newAnalystUsername} onChange={(e) => setNewAnalystUsername(e.target.value)} placeholder="نام کاربری تحلیل‌گر" className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm outline-none focus:border-vira-primary" />
                              <input value={newAnalystPassword} onChange={(e) => setNewAnalystPassword(e.target.value)} placeholder="رمز عبور" type="password" className="bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm outline-none focus:border-vira-primary" />
                              <button className="bg-vira-primary text-white rounded-xl text-sm font-bold">ایجاد تحلیل‌گر</button>
                          </form>
                        )}
                        <div className="overflow-auto max-h-40 border rounded-xl">
                            <table className="w-full text-xs text-right">
                                <thead className="bg-gray-50 border-b text-gray-600">
                                    <tr>
                                        <th className="p-2">نام کاربری</th>
                                        <th className="p-2">وضعیت</th>
                                        <th className="p-2">آخرین ورود</th>
                                        <th className="p-2 text-center">عملیات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analysts.map((a) => (
                                        <tr key={a.id} className="border-b last:border-0">
                                            <td className="p-2 font-bold">{a.username}</td>
                                            <td className="p-2">{a.status === 'active' ? 'فعال' : 'غیرفعال'}</td>
                                            <td className="p-2">{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleDateString('fa-IR') : '-'}</td>
                                            <td className="p-2 text-center">
                                                <div className="inline-flex gap-1">
                                                    <button disabled={isAnalyst} onClick={() => handleToggleAnalyst(a.id)} className={`px-2 py-1 rounded ${isAnalyst ? 'bg-gray-100 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                                                      {a.status === 'active' ? 'غیرفعال' : 'فعال'}
                                                    </button>
                                                    <button disabled={isAnalyst} onClick={() => handleResetAnalyst(a.id)} className={`px-2 py-1 rounded ${isAnalyst ? 'bg-gray-100 text-gray-300' : 'bg-amber-50 hover:bg-amber-100 text-amber-700'}`}>
                                                      ریست رمز
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {analysts.length === 0 && (
                                      <tr><td colSpan={4} className="p-3 text-center text-gray-600 dark:text-gray-400">تحلیل‌گری ثبت نشده است</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                {/* ... Side Panel ... */}
                <div className="w-80 shrink-0 bg-white border border-gray-200 rounded-2xl shadow-sm h-full overflow-y-auto">
                    {selectedUser ? (
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-6 border-b pb-4">
                                <h3 className="font-bold text-lg text-gray-800">مدیریت کاربر</h3>
                                <button onClick={() => setSelectedUser(null)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-500">
                                    <Icons.X size={18} />
                                </button>
                            </div>
                            <div className="flex flex-col items-center mb-6">
                                <div className="w-20 h-20 bg-vira-light text-vira-primary rounded-full flex items-center justify-center mb-3">
                                    <Icons.User size={32} />
                                </div>
                                <div className="font-black text-lg text-center">{selectedUser.name}</div>
                                <div className="text-sm text-gray-500 font-mono mt-1">{selectedUser.studentId}</div>
                                <div className={`text-xs px-2 py-1 rounded mt-2 ${selectedUser.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {selectedUser.status === 'active' ? 'فعال' : 'معلق'}
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    <span className="text-xs text-gray-500 block mb-1">موجودی فعلی</span>
                                    <div className="font-bold text-lg text-vira-primary">{formatRialToToman(selectedUser.balance)}</div>
                                </div>
                                <form onSubmit={handleTopUpSubmit} className="bg-vira-light/50 p-4 rounded-xl border border-vira-accent space-y-3">
                                    <h4 className="font-bold text-sm text-vira-primary flex items-center gap-2">
                                        <Icons.PlusSquare size={16} />
                                        افزایش موجودی
                                    </h4>
                                    <div className="relative">
                                        <input value={topupAmount} onChange={e => setTopupAmount(addCommas(toEnglishDigits(e.target.value)))} className="w-full bg-white border border-gray-200 rounded-xl p-3 text-center font-bold outline-none focus:border-vira-primary text-sm" placeholder="مبلغ به تومان" inputMode="numeric" />
                                        {topupAmount && <div className="mt-2 text-[11px] text-blue-600 font-bold text-center">{amountToPersianWordsToman(topupAmount)}</div>}
                                    </div>
                                    <button type="submit" className="w-full bg-vira-primary text-white py-2 rounded-lg text-sm font-bold hover:bg-vira-secondary shadow-sm transition-all">
                                        شارژ کیف پول
                                    </button>
                                </form>
                                <div className="border-t pt-4 space-y-2">
                                    <button disabled={isAnalyst} onClick={handleUserToggle} className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors ${selectedUser.status === 'active' ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-green-50 text-green-600 hover:bg-green-100'} ${isAnalyst ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                        {selectedUser.status === 'active' ? <><Icons.Lock size={16} /> تعلیق حساب</> : <><Icons.CheckCircle size={16} /> فعال‌سازی حساب</>}
                                    </button>
                                    <button disabled={isAnalyst} onClick={handleUserDelete} className={`w-full bg-red-50 text-red-600 py-3 rounded-xl font-bold text-sm hover:bg-red-100 flex items-center justify-center gap-2 transition-colors ${isAnalyst ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                        <Icons.X size={16} />
                                        حذف کاربر
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-600 dark:text-gray-400 p-6 text-center">
                            <Icons.User size={48} className="mb-4 opacity-50" />
                            <p className="text-sm font-bold">برای مشاهده جزئیات، روی نام کاربر کلیک کنید.</p>
                        </div>
                    )}
                </div>
            </div>
          )
        )}

        {/* --- STATIONS TAB --- */}
        {activeTab === 'stations' && isTabAllowed('stations') && (
          isAnalyst ? (
            <div className="space-y-6">
              {renderAggregateCards(
                'خلاصه ایستگاه‌ها',
                'لیست و عملیات مدیریت ایستگاه برای تحلیل‌گر نمایش داده نمی‌شود.',
                [
                  { label: 'کل ایستگاه‌ها', value: stations.length.toLocaleString('fa-IR'), icon: Icons.MapPin },
                  { label: 'فعال', value: stations.filter((s) => s.isActive).length.toLocaleString('fa-IR'), icon: Icons.CheckCircle },
                  { label: 'غیرفعال', value: stations.filter((s) => !s.isActive).length.toLocaleString('fa-IR'), icon: Icons.Lock },
                  { label: 'محدوده‌ها', value: new Set(stations.map((s) => (Number(s.lat || 0) >= 35.7 ? 'شمال' : 'جنوب'))).size.toLocaleString('fa-IR'), icon: Icons.Navigation }
                ]
              )}
            </div>
          ) : (
            // ... (Stations content unchanged) ...
            <div className="grid lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
                <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b font-bold sticky top-0 bg-white z-10">لیست ایستگاه‌های فعال</div>
                    <div className="overflow-auto flex-1">
                        <table className="w-full text-sm text-right">
                            <thead className="bg-gray-50 text-gray-600 font-bold border-b">
                                <tr>
                                    <th className="p-3">نام ایستگاه</th>
                                    <th className="p-3">مختصات</th>
                                    <th className="p-3">وضعیت</th>
                                    <th className="p-3 text-center">عملیات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {stations.map(s => (
                                    <tr key={s.id} className={`hover:bg-gray-50 ${!s.isActive ? 'opacity-60 bg-gray-50' : ''}`}>
                                        <td className="p-3 font-bold">{s.name}</td>
                                        <td className="p-3 font-mono text-xs text-gray-500 dir-ltr text-right">{s.lat}, {s.lng}</td>
                                        <td className="p-3">
                                            {s.isActive ? (
                                                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">فعال</span>
                                            ) : (
                                                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs">غیرفعال</span>
                                            )}
                                        </td>
                                        <td className="p-3 flex justify-center gap-2">
                                            <button onClick={() => handleStationToggle(s)} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded transition-colors text-gray-600">
                                                {s.isActive ? 'غیرفعال' : 'فعال'}
                                            </button>
                                            <button onClick={() => handleStationDelete(s.id)} className="text-xs bg-red-50 text-red-700 dark:text-red-300 hover:bg-red-100 px-3 py-1 rounded transition-colors">حذف</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <form onSubmit={handleAddStation} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 h-fit sticky top-0 shadow-sm">
                    <h3 className="font-bold text-gray-800 border-b pb-3 mb-2">افزودن ایستگاه</h3>
                    <input value={stationName} onChange={e => setStationName(e.target.value)} placeholder="نام ایستگاه" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm" />
                    <div className="grid grid-cols-2 gap-2">
                        <input value={stationLat} onChange={e => setStationLat(toEnglishDigits(e.target.value))} placeholder="عرض (Lat)" className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-left dir-ltr text-sm" />
                        <input value={stationLng} onChange={e => setStationLng(toEnglishDigits(e.target.value))} placeholder="طول (Lng)" className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-left dir-ltr text-sm" />
                    </div>
                    <button className="w-full bg-vira-primary hover:bg-vira-secondary text-white rounded-xl p-3 font-bold transition-colors">ثبت ایستگاه</button>
                </form>
            </div>
          )
        )}

        {/* --- SCHEDULES TAB --- */}
        {activeTab === 'schedules' && isTabAllowed('schedules') && (
          isAnalyst ? (
            <div className="space-y-6">
              {renderAggregateCards(
                'خلاصه برنامه‌ها',
                'برای تحلیل‌گر فقط آمار تجمیعی مسیرها و برنامه‌ها نمایش داده می‌شود.',
                [
                  { label: 'برنامه فعال', value: schedules.filter((s) => s.status === 'active').length.toLocaleString('fa-IR'), icon: Icons.Calendar },
                  { label: 'درخواست مسیر', value: routeRequests.length.toLocaleString('fa-IR'), icon: Icons.FileText },
                  { label: 'مبداها', value: new Set(schedules.map((s) => s.originStationId)).size.toLocaleString('fa-IR'), icon: Icons.MapPin },
                  { label: 'مقصدها', value: new Set(schedules.map((s) => s.destinationStationId)).size.toLocaleString('fa-IR'), icon: Icons.Navigation }
                ]
              )}
            </div>
          ) : (
            // ... (Schedules content unchanged) ...
            <div className="grid lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
                <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b bg-white sticky top-0 z-20">
                        <div className="flex items-center justify-between mb-3">
                            <div className="font-bold text-gray-800">درخواست مسیر راننده</div>
                            <button onClick={loadRouteRequestsAdmin} className="text-xs bg-gray-50 border px-3 py-1.5 rounded-lg hover:bg-gray-100 font-bold">بروزرسانی</button>
                        </div>
                        <div className="flex gap-2 overflow-x-auto">
                            {(['pending','approved','rejected'] as const).map(st => (
                                <button
                                  key={st}
                                  onClick={() => { setRouteReqStatus(st); setSelectedRouteReq(null); }}
                                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${routeReqStatus === st ? 'bg-vira-primary text-white shadow-md' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}
                                >
                                  {st === 'pending' ? 'در انتظار' : st === 'approved' ? 'تایید شده' : 'رد شده'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="overflow-auto max-h-56 border-b">
                        <table className="w-full text-sm text-right">
                            <thead className="bg-gray-50 text-gray-600 font-bold border-b">
                                <tr>
                                    <th className="p-3">مسیر</th>
                                    <th className="p-3">ساعت</th>
                                    <th className="p-3">راننده</th>
                                    <th className="p-3">قیمت</th>
                                    <th className="p-3 text-center">عملیات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {routeRequests.map(r => (
                                    <tr key={r.id} className="hover:bg-gray-50">
                                        <td className="p-3 font-bold">{r.originName} ← {r.destinationName}</td>
                                        <td className="p-3"><span className="bg-vira-light text-vira-primary text-xs px-2 py-1 rounded font-bold">{r.departureTime}</span></td>
                                        <td className="p-3 text-gray-600">{r.driverName || r.driverId}</td>
                                        <td className="p-3 font-bold text-gray-800">{formatToman(r.price)}</td>
                                        <td className="p-3 flex justify-center gap-2">
                                            {r.status === 'pending' ? (
                                                <button onClick={() => openRouteRequestModal(r)} className="text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1 rounded font-bold">بررسی</button>
                                            ) : (
                                                <span className="text-xs text-gray-600 dark:text-gray-400">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {routeRequests.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-6 text-center text-gray-600 dark:text-gray-400">درخواستی موجود نیست</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="p-4 border-b font-bold sticky top-0 bg-white z-10">برنامه سرویس‌ها</div>
                    <div className="overflow-auto flex-1">
                        <table className="w-full text-sm text-right">
                            <thead className="bg-gray-50 text-gray-600 font-bold border-b">
                                <tr>
                                    <th className="p-3">مسیر</th>
                                    <th className="p-3">ساعت حرکت</th>
                                    <th className="p-3">راننده</th>
                                    <th className="p-3">قیمت</th>
                                    <th className="p-3">وضعیت</th>
                                    <th className="p-3 text-center">عملیات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {schedules.map(sc => {
                                    const dr = drivers.find(d => d.id === sc.driverId);
                                    const ori = stations.find(s => s.id === sc.originStationId);
                                    const dst = stations.find(s => s.id === sc.destinationStationId);
                                    return (
                                        <tr key={sc.id} className={`hover:bg-gray-50 ${sc.status !== 'active' ? 'opacity-60 bg-gray-50' : ''}`}>
                                            <td className="p-3 font-bold">{ori?.name} ← {dst?.name}</td>
                                            <td className="p-3"><span className="bg-vira-light text-vira-primary text-xs px-2 py-1 rounded font-bold">{sc.departureTime.slice(0,5)}</span></td>
                                            <td className="p-3 text-gray-600">{dr?.name || '?'}</td>
                                            <td className="p-3 font-bold text-gray-800">{formatRialToToman(sc.price)}</td>
                                            <td className="p-3">
                                                {sc.status === 'active' ? (
                                                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">فعال</span>
                                                ) : (
                                                    <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded text-xs">غیرفعال</span>
                                                )}
                                            </td>
                                            <td className="p-3 flex justify-center gap-2">
                                                <button onClick={() => handleScheduleToggle(sc)} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1 rounded transition-colors">
                                                    {sc.status === 'active' ? 'توقف' : 'شروع'}
                                                </button>
                                                <button onClick={() => handleScheduleDelete(sc.id)} className="text-xs bg-red-50 text-red-700 dark:text-red-300 hover:bg-red-100 px-3 py-1 rounded transition-colors">حذف</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                <form onSubmit={handleAddSchedule} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 h-fit sticky top-0 shadow-sm">
                    <h3 className="font-bold text-gray-800 border-b pb-3 mb-2">برنامه جدید</h3>
                    <select value={schedDriver} onChange={e => setSchedDriver(e.target.value)} className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl text-sm">
                        <option value="">انتخاب راننده...</option>
                        {drivers.filter(d => d.status === 'active').map(d => <option key={d.id} value={d.id}>{d.name} ({d.licensePlate})</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                        <select value={schedOrigin} onChange={e => setSchedOrigin(e.target.value)} className="bg-gray-50 border border-gray-200 p-3 rounded-xl text-sm">
                            <option value="">مبدا...</option>
                            {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <select value={schedDest} onChange={e => setSchedDest(e.target.value)} className="bg-gray-50 border border-gray-200 p-3 rounded-xl text-sm">
                            <option value="">مقصد...</option>
                            {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} className="bg-gray-50 border border-gray-200 p-3 rounded-xl text-center text-sm" />
                        <div>
                          <input value={schedPrice} onChange={e => setSchedPrice(addCommas(toEnglishDigits(e.target.value)))} placeholder="قیمت (تومان)" className="bg-gray-50 border border-gray-200 p-3 rounded-xl text-center text-sm w-full" />
                          {schedPrice && <div className="mt-2 text-[11px] text-blue-600 font-bold text-center">{amountToPersianWordsToman(schedPrice)}</div>}
                        </div>
                    </div>
                    <button className="w-full bg-vira-primary hover:bg-vira-secondary text-white rounded-xl p-3 font-bold transition-colors">ثبت برنامه</button>
                </form>
            </div>
          )
        )}

        {/* --- IDEAS TAB --- */}
        {activeTab === 'ideas' && isTabAllowed('ideas') && (
          <div className="grid lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b bg-white sticky top-0 z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-bold text-gray-800">لیست ایده‌ها و نظرات</div>
                  <button onClick={loadIdeasAdmin} className="text-xs bg-gray-50 border px-3 py-1.5 rounded-lg hover:bg-gray-100 font-bold">
                    بروزرسانی
                  </button>
                </div>
                <div className="grid md:grid-cols-4 gap-2">
                  <input
                    value={ideasSearch}
                    onChange={(e) => { setIdeasPage(1); setIdeasSearch(e.target.value); }}
                    placeholder="جستجو در عنوان/متن..."
                    className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary"
                  />
                  <input
                    value={ideasUserFilter}
                    onChange={(e) => { setIdeasPage(1); setIdeasUserFilter(e.target.value); }}
                    placeholder="کاربر (نام یا شماره دانشجویی)"
                    className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary"
                  />
                  <select
                    value={ideasStatusFilter}
                    onChange={(e) => { setIdeasPage(1); setIdeasStatusFilter(e.target.value as any); }}
                    className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary"
                  >
                    <option value="">همه وضعیت‌ها</option>
                    <option value="submitted">ثبت شده</option>
                    <option value="reviewing">درحال بررسی</option>
                    <option value="approved">تایید شده</option>
                    <option value="rejected">رد شده</option>
                    <option value="done">انجام شد</option>
                  </select>
                  <select
                    value={String(ideasPageSize)}
                    onChange={(e) => { setIdeasPage(1); setIdeasPageSize(Number(e.target.value)); }}
                    className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary"
                  >
                    {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n} در صفحه</option>)}
                  </select>
                </div>

                <div className="grid md:grid-cols-2 gap-2 mt-2">
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <div className="text-[11px] text-gray-500 font-bold mb-1">از تاریخ (اختیاری)</div>
                    <JalaliDatePicker value={ideasFromDate} onChange={(v) => { setIdeasPage(1); setIdeasFromDate(v); }} />
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                    <div className="text-[11px] text-gray-500 font-bold mb-1">تا تاریخ (اختیاری)</div>
                    <JalaliDatePicker value={ideasToDate} onChange={(v) => { setIdeasPage(1); setIdeasToDate(v); }} />
                  </div>
                </div>
              </div>

              <div className="overflow-auto flex-1">
                <table className="w-full text-sm text-right">
                  <thead className="bg-gray-50 text-gray-600 font-bold border-b">
                    <tr>
                      <th className="p-3">عنوان</th>
                      <th className="p-3">کاربر</th>
                      <th className="p-3">وضعیت</th>
                      <th className="p-3">تاریخ</th>
                      <th className="p-3 text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ideas.map((idea) => (
                      <tr
                        key={idea.id}
                        className={`hover:bg-vira-light cursor-pointer transition-colors ${selectedIdeaDetail?.idea.id === idea.id ? 'bg-vira-light' : ''}`}
                        onClick={() => openIdea(idea.id)}
                      >
                        <td className="p-3 font-bold max-w-[260px] truncate">{idea.title}</td>
                        <td className="p-3 text-gray-600">
                          <div className="font-bold">{idea.user?.name}</div>
                          <div className="text-[11px] font-mono text-gray-500 dir-ltr text-right">{idea.user?.studentId}</div>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                            idea.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                            idea.status === 'reviewing' ? 'bg-amber-100 text-amber-700' :
                            idea.status === 'approved' ? 'bg-green-100 text-green-700' :
                            idea.status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-purple-100 text-purple-700'
                          }`}>
                            {idea.status === 'submitted' ? 'ثبت شده' :
                             idea.status === 'reviewing' ? 'درحال بررسی' :
                             idea.status === 'approved' ? 'تایید شده' :
                             idea.status === 'rejected' ? 'رد شده' : 'انجام شد'}
                          </span>
                        </td>
                        <td className="p-3 text-gray-500 text-xs">
                          {new Date(idea.createdAt).toLocaleDateString('fa-IR')}
                        </td>
                        <td className="p-3 text-center">
                          <button onClick={(e) => { e.stopPropagation(); openIdea(idea.id); }} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded transition-colors text-gray-700 font-bold">
                            جزئیات
                          </button>
                        </td>
                      </tr>
                    ))}
                    {ideas.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-gray-600 dark:text-gray-400">موردی یافت نشد</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-4 border-t bg-white flex items-center justify-between">
                <div className="text-xs text-gray-500 font-bold">
                  مجموع: {ideasTotal.toLocaleString('fa-IR')}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIdeasPage((p) => Math.max(1, p - 1))}
                    disabled={ideasPage <= 1}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border ${ideasPage <= 1 ? 'bg-gray-50 text-gray-300 border-gray-200' : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700'}`}
                  >
                    قبلی
                  </button>
                  <div className="text-xs font-bold text-gray-600">
                    صفحه {ideasPage.toLocaleString('fa-IR')}
                  </div>
                  <button
                    onClick={() => setIdeasPage((p) => p + 1)}
                    disabled={ideasPage * ideasPageSize >= ideasTotal}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border ${ideasPage * ideasPageSize >= ideasTotal ? 'bg-gray-50 text-gray-300 border-gray-200' : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-700'}`}
                  >
                    بعدی
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm h-full overflow-y-auto">
              {selectedIdeaDetail ? (
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between border-b pb-4">
                    <div className="font-black text-gray-800">جزئیات ایده</div>
                    <button onClick={() => setSelectedIdeaDetail(null)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-500">
                      <Icons.X size={18} />
                    </button>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <div className="text-xs text-gray-500 font-bold mb-1">کاربر</div>
                    <div className="font-black">{selectedIdeaDetail.idea.user.name}</div>
                    <div className="text-xs font-mono text-gray-500 dir-ltr text-right mt-1">{selectedIdeaDetail.idea.user.studentId}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 font-bold mb-1">عنوان</div>
                    <div className="font-bold text-gray-800">{selectedIdeaDetail.idea.title}</div>
                  </div>

                  <div>
                    <div className="text-xs text-gray-500 font-bold mb-1">متن</div>
                    <div className="text-sm text-gray-700 leading-7 whitespace-pre-wrap bg-gray-50 border border-gray-100 rounded-xl p-4">
                      {selectedIdeaDetail.idea.description}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                      <div className="text-[11px] text-gray-500 font-bold mb-1">تاریخ ثبت</div>
                      <div className="text-xs font-bold text-gray-700">{new Date(selectedIdeaDetail.idea.createdAt).toLocaleString('fa-IR')}</div>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                      <div className="text-[11px] text-gray-500 font-bold mb-1">آخرین بروزرسانی</div>
                      <div className="text-xs font-bold text-gray-700">{new Date(selectedIdeaDetail.idea.updatedAt).toLocaleString('fa-IR')}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-gray-500 font-bold">تغییر وضعیت</div>
                    <select
                      value={ideaNextStatus}
                      onChange={(e) => setIdeaNextStatus(e.target.value as IdeaStatus)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary"
                    >
                      <option value="submitted">ثبت شده</option>
                      <option value="reviewing">درحال بررسی</option>
                      <option value="approved">تایید شده</option>
                      <option value="rejected">رد شده</option>
                      <option value="done">انجام شد</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-gray-500 font-bold">پاسخ ادمین (اختیاری)</div>
                    <textarea
                      value={ideaAdminResponse}
                      onChange={(e) => setIdeaAdminResponse(e.target.value)}
                      rows={4}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary resize-none"
                      placeholder="پاسخ شما به کاربر..."
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-gray-500 font-bold">یادداشت ادمین (داخلی)</div>
                    <input
                      value={ideaAdminNote}
                      onChange={(e) => setIdeaAdminNote(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary"
                      placeholder="مثلاً: نیاز به بررسی با واحد..."
                    />
                  </div>

                  <button
                    onClick={saveIdeaAdmin}
                    disabled={loading}
                    className={`w-full text-white rounded-xl p-3 font-bold transition-colors ${loading ? 'bg-gray-300 cursor-not-allowed' : 'bg-vira-primary hover:bg-vira-secondary'}`}
                  >
                    ذخیره
                  </button>

                  <div>
                    <div className="text-xs text-gray-500 font-bold mb-2">تاریخچه</div>
                    <div className="space-y-2">
                      {selectedIdeaDetail.history?.length ? selectedIdeaDetail.history.map((h) => (
                        <div key={h.id} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                          <div className="text-[11px] text-gray-500 font-bold mb-1">{new Date(h.createdAt).toLocaleString('fa-IR')}</div>
                          <div className="text-xs text-gray-700">
                            {h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : `→ ${h.toStatus}`}
                          </div>
                          {h.note && <div className="text-[11px] text-gray-500 mt-1">{h.note}</div>}
                        </div>
                      )) : (
                        <div className="text-xs text-gray-600 dark:text-gray-400">تاریخچه‌ای ثبت نشده است</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-600 dark:text-gray-400 p-6 text-center">
                  <Icons.MessageSquare size={48} className="mb-4 opacity-50" />
                  <p className="text-sm font-bold">برای مشاهده جزئیات، روی یک ایده کلیک کنید.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'ideas' && !isAnalyst && (
          <div className="mt-6 grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b bg-white sticky top-0 z-10">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-bold text-gray-800">مدیریت بازخورد سفرها</div>
                  <button onClick={loadTicketFeedbacks} className="text-xs bg-gray-50 border px-3 py-1.5 rounded-lg hover:bg-gray-100 font-bold">بروزرسانی</button>
                </div>
                <div className="grid md:grid-cols-3 gap-2">
                  <select
                    value={ticketFeedbackStatusFilter}
                    onChange={(e) => setTicketFeedbackStatusFilter(e.target.value as any)}
                    className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary"
                  >
                    <option value="">همه وضعیت‌ها</option>
                    <option value="pending">در انتظار</option>
                    <option value="reviewing">در حال بررسی</option>
                    <option value="resolved">حل شده</option>
                  </select>
                  <input
                    value={ticketFeedbackSearch}
                    onChange={(e) => setTicketFeedbackSearch(e.target.value)}
                    placeholder="جستجو در نام/ایستگاه/کامنت..."
                    className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary md:col-span-2"
                  />
                </div>
              </div>
              <div className="overflow-auto flex-1">
                <table className="w-full text-sm text-right">
                  <thead className="bg-gray-50 text-gray-600 font-bold border-b">
                    <tr>
                      <th className="p-3">امتیاز</th>
                      <th className="p-3">کاربر</th>
                      <th className="p-3">مسیر</th>
                      <th className="p-3">وضعیت</th>
                      <th className="p-3">تاریخ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredTicketFeedbacks.map((item) => (
                      <tr
                        key={item.ticketId}
                        onClick={() => openTicketFeedback(item)}
                        className={`cursor-pointer transition-colors ${selectedTicketFeedback?.ticketId === item.ticketId ? 'bg-vira-light' : 'hover:bg-gray-50'}`}
                      >
                        <td className="p-3">
                          <div className="font-black text-gray-800">{item.rating.toLocaleString('fa-IR')} / 5</div>
                          <div className="text-[11px] text-gray-600 dark:text-gray-400">{item.price}</div>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-gray-800">{item.userName}</div>
                          <div className="text-[11px] font-mono text-gray-500 dir-ltr text-right">{item.studentId}</div>
                        </td>
                        <td className="p-3 text-gray-600">{item.origin} ← {item.destination}</td>
                        <td className="p-3">
                          <span className={`text-[10px] px-2 py-1 rounded-lg border font-bold ${
                            item.status === 'pending'
                              ? 'bg-amber-50 text-amber-700 border-amber-100'
                              : item.status === 'reviewing'
                                ? 'bg-blue-50 text-blue-700 border-blue-100'
                                : 'bg-green-50 text-green-700 border-green-100'
                          }`}>
                            {item.status === 'pending' ? 'در انتظار' : item.status === 'reviewing' ? 'در حال بررسی' : 'حل شده'}
                          </span>
                        </td>
                        <td className="p-3 text-gray-500 text-xs">{item.date} {item.time}</td>
                      </tr>
                    ))}
                    {filteredTicketFeedbacks.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-gray-600 dark:text-gray-400">نظری ثبت نشده است</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm h-full overflow-y-auto">
              {selectedTicketFeedback ? (
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between border-b pb-4">
                    <div className="font-black text-gray-800">جزئیات بازخورد</div>
                    <button onClick={() => setSelectedTicketFeedback(null)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-500">
                      <Icons.X size={18} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                      <div className="text-[11px] text-gray-500 font-bold mb-1">امتیاز</div>
                      <div className="text-lg font-black text-gray-800">{selectedTicketFeedback.rating.toLocaleString('fa-IR')} / 5</div>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                      <div className="text-[11px] text-gray-500 font-bold mb-1">وضعیت</div>
                      <div className="text-lg font-black text-gray-800">
                        {selectedTicketFeedback.status === 'pending' ? 'در انتظار' : selectedTicketFeedback.status === 'reviewing' ? 'در حال بررسی' : 'حل شده'}
                      </div>
                    </div>
                    <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 col-span-2">
                      <div className="text-[11px] text-gray-500 font-bold mb-1">مسیر</div>
                      <div className="font-bold text-gray-800">{selectedTicketFeedback.origin} ← {selectedTicketFeedback.destination}</div>
                      <div className="text-xs text-gray-500 mt-1">{selectedTicketFeedback.departureTime} • {selectedTicketFeedback.busNumber}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 font-bold mb-1">کامنت کاربر</div>
                    <div className="text-sm text-gray-700 leading-7 whitespace-pre-wrap bg-gray-50 border border-gray-100 rounded-xl p-4">
                      {selectedTicketFeedback.comment || 'کامنتی ثبت نشده است'}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500 font-bold">تغییر وضعیت</div>
                    <select
                      value={ticketFeedbackNextStatus}
                      onChange={(e) => setTicketFeedbackNextStatus(e.target.value as any)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary"
                    >
                      <option value="pending">در انتظار</option>
                      <option value="reviewing">در حال بررسی</option>
                      <option value="resolved">حل شده</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500 font-bold">یادداشت پیگیری</div>
                    <textarea
                      value={ticketFeedbackNote}
                      onChange={(e) => setTicketFeedbackNote(e.target.value)}
                      rows={4}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary resize-none"
                      placeholder="یادداشت داخلی برای پیگیری شکایت یا نظر..."
                    />
                  </div>
                  <button
                    onClick={handleUpdateTicketFeedback}
                    className="w-full text-white rounded-xl p-3 font-bold transition-colors bg-vira-primary hover:bg-vira-secondary"
                  >
                    ذخیره وضعیت بازخورد
                  </button>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-600 dark:text-gray-400 p-6 text-center">
                  <Icons.MessageSquare size={48} className="mb-4 opacity-50" />
                  <p className="text-sm font-bold">برای مشاهده جزئیات، روی یک بازخورد کلیک کنید.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- DRIVERS TAB (ACTIVE) --- */}
        {activeTab === 'drivers' && isTabAllowed('drivers') && (
          isAnalyst ? (
            <div className="space-y-6">
              {renderAggregateCards(
                'خلاصه رانندگان',
                'نمایش لیست، مدارک، ویرایش و حذف برای این نقش غیرفعال است.',
                [
                  { label: 'کل رانندگان', value: drivers.length.toLocaleString('fa-IR'), icon: Icons.Car },
                  { label: 'فعال', value: drivers.filter((d) => d.status === 'active').length.toLocaleString('fa-IR'), icon: Icons.CheckCircle },
                  { label: 'غیرفعال', value: drivers.filter((d) => d.status !== 'active').length.toLocaleString('fa-IR'), icon: Icons.Lock },
                  { label: 'ایستگاه‌های مجاز', value: drivers.reduce((sum, driver) => sum + (driver.assignedStations?.length || 0), 0).toLocaleString('fa-IR'), icon: Icons.MapPin }
                ]
              )}
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b font-bold sticky top-0 bg-white z-10 flex justify-between items-center">
                    <span>لیست رانندگان فعال</span>
                    <button onClick={handleExportDriversList} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2">
                        <Icons.Download size={14} />
                        لیست کلی
                    </button>
                </div>
                <div className="overflow-auto flex-1">
                    <table className="w-full text-sm text-right">
                        <thead className="bg-gray-50 text-gray-600 font-bold border-b">
                            <tr>
                                <th className="p-3">نام راننده</th>
                                <th className="p-3">پلاک</th>
                                <th className="p-3">تلفن</th>
                                <th className="p-3">وضعیت</th>
                                <th className="p-3 text-center">عملیات / گزارش</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {drivers.map((driver) => (
                                <tr key={driver.id} className={`hover:bg-gray-50 ${driver.status !== 'active' ? 'bg-gray-50 opacity-70' : ''}`}>
                                    <td className="p-3 font-bold">{driver.name}</td>
                                    <td className="p-3 font-bold dir-ltr text-right">{driver.licensePlate}</td>
                                    <td className="p-3 font-mono text-gray-500 dir-ltr text-right">{driver.phone || '-'}</td>
                                    <td className="p-3">
                                        {driver.status === 'active' ? (
                                            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">فعال</span>
                                        ) : (
                                            <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded text-xs">غیرفعال</span>
                                        )}
                                    </td>
                                    <td className="p-3 flex justify-center gap-2">
                                        {/* NEW: Individual Export Button */}
                                        <button 
                                            onClick={() => handleExportSingleDriver(driver.id)}
                                            className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                                            title="دانلود گزارش عملکرد"
                                        >
                                            <Icons.FileText size={16} />
                                        </button>

                                        <button
                                            onClick={() => setDocsDriver(driver)}
                                            className="p-1.5 bg-vira-light text-vira-primary rounded-lg hover:bg-vira-accent/30 transition-colors"
                                            title="مشاهده مدارک هویتی"
                                        >
                                            <Icons.UploadCloud size={16} />
                                        </button>

                                        <button
                                            onClick={() => {
                                              setEditingDriver(driver);
                                              setEditingDriverForm({ name: driver.name || '', username: (driver as any).username || '', password: '', licensePlate: driver.licensePlate || '', phone: driver.phone || '', capacity: String(driver.capacity || 30) });
                                              setEditingDriverStations(Array.isArray(driver.assignedStations) ? driver.assignedStations : []);
                                            }}
                                            className="p-1.5 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                                            title="ویرایش اطلاعات راننده"
                                        >
                                            <Icons.Settings size={16} />
                                        </button>

                                        <button onClick={() => handleDriverToggle(driver)} className={`p-1.5 rounded-lg transition-colors ${driver.status === 'active' ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                                            {driver.status === 'active' ? <Icons.Lock size={16} /> : <Icons.CheckCircle size={16} />}
                                        </button>
                                        <button onClick={() => handleDriverDelete(driver.id)} className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"><Icons.X size={16} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <form onSubmit={handleAddDriver} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 h-fit sticky top-0 shadow-sm">
                <h3 className="font-bold text-gray-800 border-b pb-3 mb-2">افزودن راننده جدید (دستی)</h3>
                <div className="space-y-3">
                    <input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="نام و نام خانوادگی" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-vira-primary text-sm" />
                    <input value={driverUser} onChange={(e) => setDriverUser(toEnglishDigits(e.target.value))} placeholder="نام کاربری" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-vira-primary text-sm" />
                    <input value={driverPass} onChange={(e) => setDriverPass(toEnglishDigits(e.target.value))} placeholder="رمز عبور" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-vira-primary text-sm" />
                    <input value={driverPlate} onChange={(e) => setDriverPlate(toEnglishDigits(e.target.value))} placeholder="شماره پلاک" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-vira-primary text-sm" />
                    <div className="grid grid-cols-2 gap-2">
                    <input value={driverPhone} onChange={(e) => setDriverPhone(toEnglishDigits(e.target.value))} placeholder="شماره تماس" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-vira-primary text-sm" />
                    <input value={driverCapacity} onChange={(e) => setDriverCapacity(toEnglishDigits(e.target.value))} placeholder="ظرفیت" type="number" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:border-vira-primary text-center text-sm" />
                    </div>
                    <div className="text-xs font-bold text-gray-500 mt-2">ایستگاه‌های مجاز:</div>
                    <div className="max-h-32 overflow-y-auto border border-gray-100 rounded-xl p-2 space-y-1 bg-gray-50">
                    {stations.map((station) => (
                        <label key={station.id} className="flex items-center gap-2 text-xs p-1 hover:bg-white rounded cursor-pointer">
                        <input type="checkbox" checked={selectedStations.includes(station.id)} onChange={() => {
                            setSelectedStations((prev) => (prev.includes(station.id) ? prev.filter((id) => id !== station.id) : [...prev, station.id]));
                        }} className="accent-vira-primary" />
                        {station.name}
                        </label>
                    ))}
                    </div>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-[11px] leading-6 text-amber-700 font-bold">
                  اگر راننده برای اسکن QR استفاده می‌شود، حتماً ایستگاه‌های مجاز او را دقیق انتخاب کنید.
                </div>
                <button className="w-full bg-vira-primary hover:bg-vira-secondary text-white rounded-xl p-3 font-bold shadow-lg shadow-vira-accent/50 transition-all">ثبت راننده</button>
            </form>
            </div>
          )
        )}

        {/* --- FINANCE TAB --- */}
        {activeTab === 'finance' && isTabAllowed('finance') && (
          isAnalyst ? (
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                <h3 className="font-black text-gray-800 mb-2">نمای تجمیعی امور مالی</h3>
                <p className="text-sm text-gray-500 leading-7 mb-4">برای تحلیل‌گر فقط شاخص‌های کلان، نمودارها و جمع‌بندی مالی نمایش داده می‌شود.</p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-emerald-50 rounded-xl p-4">
                    <span className="text-sm font-medium text-emerald-800">درآمد کل</span>
                    <div className="text-3xl font-black mt-2 text-emerald-600">{formatAmountFa(financeTotals.amount)} <span className="text-sm font-normal">تومان</span></div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
          // ... (Finance content unchanged) ...
          <div className="space-y-6">
             <div className="flex gap-2 border-b pb-4 overflow-x-auto">
                {(['student', 'driver', 'company', 'stats', 'settings'] as FinanceTab[]).map(ft => (
                  <button 
                    key={ft}
                    disabled={isAnalyst && ft === 'settings'}
                    onClick={() => {
                      if (isAnalyst && ft === 'settings') return;
                      setFinanceTab(ft);
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                      isAnalyst && ft === 'settings'
                        ? 'bg-gray-100 text-gray-300 border border-gray-100 cursor-not-allowed'
                        : financeTab === ft
                          ? 'bg-vira-primary text-white shadow-md'
                          : 'bg-white text-gray-600 border hover:bg-gray-50'
                    }`}
                  >
                    {ft === 'student' ? 'دانشجو' : ft === 'driver' ? 'رانندگان' : ft === 'company' ? 'شرکت' : ft === 'stats' ? 'آمار و نمودار' : 'تنظیمات'}
                  </button>
                ))}
             </div>
             {financeTab === 'settings' && (
                 <div className="bg-white border rounded-2xl p-6 shadow-sm max-w-md">
                     <h3 className="font-bold mb-4 text-gray-800">تنظیمات مالی سیستم</h3>
                     <div className="space-y-4">
                         <div>
                             <label className="block text-sm text-gray-500 mb-1">درصد کمیسیون شرکت</label>
                             <div className="flex gap-2">
                                 <input type="number" value={commission} onChange={e => setCommission(Number(e.target.value))} className="flex-1 bg-gray-50 border rounded-xl p-3 text-center font-bold outline-none focus:border-vira-primary" />
                                 <span className="self-center font-bold text-gray-600 dark:text-gray-400">%</span>
                             </div>
                             <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">این درصد از مبلغ هر بلیط کسر شده و به حساب شرکت واریز می‌شود. مابقی به راننده تعلق می‌گیرد.</p>
                         </div>
                         <div className="pt-2 border-t border-dashed">
                             <label className="block text-sm text-gray-500 mb-1">سقف شارژ هفتگی کیف پول</label>
                             <div className="flex gap-2 items-center">
                                 <input
                                   inputMode="numeric"
                                   value={weeklyWalletLimitInput}
                                   onChange={(e) => {
                                     const raw = toEnglishDigits(e.target.value).replace(/[^\d]/g, '').slice(0, 12);
                                     const normalized = raw ? addCommas(raw) : '0';
                                     setWeeklyWalletLimitInput(normalized);
                                     setWeeklyWalletLimit(Number(raw || 0));
                                   }}
                                   className="flex-1 bg-gray-50 border rounded-xl p-3 text-center font-bold outline-none focus:border-vira-primary"
                                   placeholder="مثال: 5,000,000"
                                 />
                                 <span className="self-center font-bold text-gray-600 dark:text-gray-400 whitespace-nowrap">تومان</span>
                             </div>
                             {weeklyWalletLimitInput && weeklyWalletLimitInput !== '0' && (
                               <div className="mt-2 text-[11px] text-blue-600 font-bold">{amountToPersianWordsToman(weeklyWalletLimitInput)}</div>
                             )}
                             <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 leading-6">
                               مقدار ۰ یعنی بدون محدودیت. این محدودیت فقط سمت سرور اعمال می‌شود و قابل دور زدن نیست.
                               {weeklyWalletLimitMeta.updatedAt && (
                                 <span className="block mt-1">
                                   آخرین تغییر: {new Date(weeklyWalletLimitMeta.updatedAt).toLocaleString('fa-IR')}
                                   {weeklyWalletLimitMeta.updatedBy ? ` (ادمین: ${weeklyWalletLimitMeta.updatedBy})` : ''}
                                 </span>
                               )}
                             </p>
                         </div>
                         <button onClick={handleUpdateFinanceSettings} disabled={isAnalyst} className={`w-full py-3 rounded-xl font-bold ${isAnalyst ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-vira-primary text-white hover:bg-vira-secondary'}`}>ذخیره تنظیمات</button>
                     </div>
                 </div>
             )}
             {(financeTab !== 'settings') && (financeTab !== 'stats') && (
                 <div className="flex flex-wrap gap-4 items-center bg-white p-4 rounded-xl shadow-sm border">
                     <JalaliDatePicker value={startDate} onChange={setStartDate} placeholder="تاریخ شروع" className="w-40" />
                     <JalaliDatePicker value={endDate} onChange={setEndDate} placeholder="تاریخ پایان" className="w-40" />
                     <button onClick={() => loadFinance(financeTab as any)} className="bg-vira-light text-vira-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-vira-accent/30">اعمال فیلتر</button>
                     <div className="mr-auto relative w-full md:w-64">
                        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="جستجو در کد پیگیری..." className="w-full bg-gray-50 border rounded-xl px-4 py-2 text-sm outline-none focus:border-vira-primary" />
                        <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400" size={16} />
                     </div>
                 </div>
             )}
             {financeTab === 'stats' && (
                <div className="bg-white border border-gray-200 rounded-3xl p-6 shadow-sm">
                   <div className="flex gap-4 mb-6">
                        <JalaliDatePicker value={startDate} onChange={setStartDate} placeholder="تاریخ شروع" className="w-40" />
                        <JalaliDatePicker value={endDate} onChange={setEndDate} placeholder="تاریخ پایان" className="w-40" />
                        <button onClick={() => loadFinance('stats')} className="bg-vira-light text-vira-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-vira-accent/30">بروزرسانی</button>
                   </div>
                   <div className="grid md:grid-cols-2 gap-6 mb-6">
                      <div className="bg-emerald-50 rounded-xl p-4">
                         <span className="text-sm font-medium text-emerald-800">درآمد کل (فروش بلیط)</span>
                         <div className="text-3xl font-black mt-2 text-emerald-600">{formatAmountFa(financeTotals.amount)} <span className="text-sm font-normal">تومان</span></div>
                      </div>
                   </div>
                   <div className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-xl p-3">
                     نمودار روند مالی در ابتدای صفحه و بخش «آنالیتیکس: امور مالی» نمایش داده می‌شود.
                   </div>
                </div>
             )}
             {(financeTab !== 'settings') && (financeTab !== 'stats') && (
                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                   <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                         <thead className="bg-gray-50 text-gray-600 font-bold border-b">
                            <tr>
                               <th className="p-3 text-right">تاریخ</th>
                               <th className="p-3 text-right">کد پیگیری</th>
                               <th className="p-3 text-right">نام</th>
                               <th className="p-3 text-right">شناسه</th>
                               <th className="p-3 text-right">مبلغ کل</th>
                               {financeTab === 'driver' && <th className="p-3 text-right text-emerald-600">سهم راننده</th>}
                               {(financeTab === 'driver' || financeTab === 'company') && <th className="p-3 text-right text-blue-600">سهم شرکت</th>}
                               <th className="p-3 text-right">توضیحات</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y">
                            {filteredFinance.map((row) => (
                               <tr key={row.id} className="hover:bg-gray-50">
                                  <td className="p-3">{row.date}</td>
                                  <td className="p-3 font-mono text-gray-500">{row.trackingNumber}</td>
                                  <td className="p-3 font-bold">{row.name}</td>
                                  <td className="p-3 text-gray-500">{row.identifier}</td>
                                  <td className="p-3 font-bold text-gray-800">{formatAmountFa(row.amount)} تومان</td>
                                  {financeTab === 'driver' && <td className="p-3 font-bold text-emerald-600">{formatAmountFa(row.driverShare || 0)} تومان</td>}
                                  {(financeTab === 'driver' || financeTab === 'company') && <td className="p-3 font-bold text-blue-600">{formatAmountFa(row.companyShare || 0)} تومان</td>}
                                  <td className="p-3 text-gray-500 text-xs">{row.description}</td>
                               </tr>
                            ))}
                            {filteredFinance.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-8 text-center text-gray-600 dark:text-gray-400">داده‌ای یافت نشد</td>
                                </tr>
                            )}
                         </tbody>
                      </table>
                   </div>
                </div>
             )}
          </div>
          )
        )}

        {selectedRouteReq && isTabAllowed('requests') && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => setSelectedRouteReq(null)} />
            <div className="relative w-full md:max-w-2xl bg-white rounded-t-3xl md:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="text-lg font-black text-gray-800">بررسی درخواست مسیر</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">شناسه: {selectedRouteReq.id}</div>
                </div>
                <button onClick={() => setSelectedRouteReq(null)} className="p-2 bg-gray-50 rounded-full text-gray-500 hover:bg-gray-100">
                  <Icons.X size={18} />
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500">راننده</label>
                  <select value={routeReqEdit.driverId} onChange={(e) => setRouteReqEdit(prev => ({ ...prev, driverId: e.target.value }))} className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl text-sm font-bold outline-none">
                    {drivers.filter(d => d.status === 'active').map(d => <option key={d.id} value={d.id}>{d.name} ({d.licensePlate})</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500">ساعت حرکت</label>
                  <input type="time" value={routeReqEdit.departureTime} onChange={(e) => setRouteReqEdit(prev => ({ ...prev, departureTime: e.target.value }))} className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl text-sm font-bold outline-none dir-ltr text-right" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500">مبدا</label>
                  <select value={routeReqEdit.originStationId} onChange={(e) => setRouteReqEdit(prev => ({ ...prev, originStationId: e.target.value }))} className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl text-sm font-bold outline-none">
                    {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500">مقصد</label>
                  <select value={routeReqEdit.destinationStationId} onChange={(e) => setRouteReqEdit(prev => ({ ...prev, destinationStationId: e.target.value }))} className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl text-sm font-bold outline-none">
                    {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-bold text-gray-500">قیمت (تومان)</label>
                  <input value={routeReqEdit.priceToman} onChange={(e) => setRouteReqEdit(prev => ({ ...prev, priceToman: addCommas(toEnglishDigits(e.target.value)) }))} className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl text-sm font-bold outline-none text-center" />
                  {routeReqEdit.priceToman && <div className="mt-2 text-[11px] text-blue-600 font-bold text-center">{amountToPersianWordsToman(routeReqEdit.priceToman)}</div>}
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-bold text-gray-500">توضیح ادمین (اختیاری)</label>
                  <input value={routeReqEdit.adminNote} onChange={(e) => setRouteReqEdit(prev => ({ ...prev, adminNote: e.target.value }))} className="w-full bg-gray-50 border border-gray-200 p-3 rounded-xl text-sm outline-none" placeholder="مثال: زمان حرکت اصلاح شد..." />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={handleRejectRouteReq} className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl p-3 font-bold">رد درخواست</button>
                <button onClick={handleApproveRouteReq} className="flex-[2] bg-vira-primary hover:bg-vira-secondary text-white rounded-xl p-3 font-bold shadow-lg shadow-vira-accent/50">تایید و ایجاد برنامه</button>
              </div>
            </div>
          </div>
        )}

        {docsDriver && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => setDocsDriver(null)} />
            <div className="relative w-full md:max-w-3xl bg-white rounded-t-3xl md:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="text-lg font-black text-gray-800">مدارک راننده</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{docsDriver.name} • {docsDriver.licensePlate}</div>
                </div>
                <button onClick={() => setDocsDriver(null)} className="p-2 bg-gray-50 rounded-full text-gray-500 hover:bg-gray-100">
                  <Icons.X size={18} />
                </button>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {docTypes.map(dt => {
                  const src = (docsDriver as any)?.documents?.[dt.key];
                  const isPdf = typeof src === 'string' && src.startsWith('data:application/pdf');
                  const isImg = typeof src === 'string' && src.startsWith('data:image/');
                  return (
                    <div key={dt.key} className="border border-gray-200 rounded-2xl overflow-hidden">
                      <div className="p-3 bg-gray-50 border-b font-bold text-sm text-gray-700">{dt.label}</div>
                      <div className="p-3">
                        {!src && <div className="text-center text-gray-600 dark:text-gray-400 text-sm py-10">فایلی ثبت نشده است</div>}
                        {isImg && <img src={src} alt={dt.label} className="w-full h-64 object-contain bg-white rounded-xl" />}
                        {isPdf && (
                          <object data={src} type="application/pdf" className="w-full h-64 rounded-xl bg-white">
                            <div className="text-center text-gray-600 dark:text-gray-400 text-sm py-10">پیش‌نمایش PDF در دسترس نیست</div>
                          </object>
                        )}
                        {!isImg && !isPdf && src && (
                          <a href={src} target="_blank" rel="noreferrer" className="text-sm font-bold text-blue-600">مشاهده فایل</a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {editingDriver && (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => setEditingDriver(null)} />
            <div className="relative w-full md:max-w-xl bg-white rounded-t-3xl md:rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="text-lg font-black text-gray-800">ویرایش راننده</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{editingDriver.name} • {editingDriver.licensePlate}</div>
                </div>
                <button onClick={() => setEditingDriver(null)} className="p-2 bg-gray-50 rounded-full text-gray-500 hover:bg-gray-100">
                  <Icons.X size={18} />
                </button>
              </div>

              <div className="space-y-3">
                <input value={editingDriverForm.name} onChange={(e) => setEditingDriverForm(p => ({ ...p, name: e.target.value }))} placeholder="نام و نام خانوادگی" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary" />
                <input value={editingDriverForm.username} onChange={(e) => setEditingDriverForm(p => ({ ...p, username: toEnglishDigits(e.target.value) }))} placeholder="نام کاربری" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary dir-ltr text-right" />
                <input value={editingDriverForm.password} onChange={(e) => setEditingDriverForm(p => ({ ...p, password: toEnglishDigits(e.target.value) }))} placeholder="رمز عبور جدید (اختیاری)" type="password" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary dir-ltr text-right" />
                <input value={editingDriverForm.licensePlate} onChange={(e) => setEditingDriverForm(p => ({ ...p, licensePlate: toEnglishDigits(e.target.value) }))} placeholder="شماره پلاک" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={editingDriverForm.phone} onChange={(e) => setEditingDriverForm(p => ({ ...p, phone: toEnglishDigits(e.target.value) }))} placeholder="شماره تماس" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary dir-ltr text-right" />
                  <input value={editingDriverForm.capacity} onChange={(e) => setEditingDriverForm(p => ({ ...p, capacity: toEnglishDigits(e.target.value) }))} placeholder="ظرفیت" type="number" className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-vira-primary text-center" />
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-bold text-gray-500">ایستگاه‌های مجاز:</div>
                  <div className="max-h-32 overflow-y-auto border border-gray-100 rounded-xl p-2 space-y-1 bg-gray-50">
                    {stations.map((station) => (
                      <label key={station.id} className="flex items-center gap-2 text-xs p-1 hover:bg-white rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingDriverStations.includes(station.id)}
                          onChange={() => {
                            setEditingDriverStations((prev) => (
                              prev.includes(station.id)
                                ? prev.filter((id) => id !== station.id)
                                : [...prev, station.id]
                            ));
                          }}
                          className="accent-vira-primary"
                        />
                        {station.name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setEditingDriver(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl p-3 font-bold">انصراف</button>
                <button onClick={handleSaveDriverEdit} className="flex-[2] bg-vira-primary hover:bg-vira-secondary text-white rounded-xl p-3 font-bold shadow-lg shadow-vira-accent/50">ذخیره</button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

export default AdminDashboardView;
