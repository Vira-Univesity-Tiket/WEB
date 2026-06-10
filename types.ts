
export enum ViewState {
  HOME = 'HOME',
  BUS = 'BUS',
  FOOD = 'FOOD',
  LIBRARY = 'LIBRARY',
  PROFILE = 'PROFILE',
  TICKETS = 'TICKETS',
  WALLET = 'WALLET',
  SUPPORT = 'SUPPORT',
  FEEDBACK = 'FEEDBACK',
  ADMIN_LOGIN = 'ADMIN_LOGIN',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD'
}

export enum BookingStage {
  IDLE = 'IDLE',
  SELECT_DESTINATION = 'SELECT_DESTINATION',
  SELECT_BUS = 'SELECT_BUS',
  CONFIRMATION = 'CONFIRMATION',
  TICKET_VIEW = 'TICKET_VIEW'
}

export enum AuthStage {
  SPLASH_START = 'SPLASH_START',
  SPLASH_CENTER = 'SPLASH_CENTER',
  AUTH_FORM = 'AUTH_FORM',
  LOGGED_IN = 'LOGGED_IN'
}

export type Language = 'fa' | 'en' | 'ar';

export interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
}

export interface UserProfile {
  name: string;
  studentId: string;
  nationalCode: string;
  province: string;
  city: string;
  balance: string;
  avatar?: string;
  language?: Language;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface BusOption {
  id: string;
  departureTime: string;
  arrivalTime: string;
  busNumber: string;
  capacityStatus: 'Empty' | 'Moderate' | 'Full';
  remainingSeats: number;
  price: number;
  originName?: string;
  destinationName?: string;
}

export interface ServiceItem {
  id: string;
  title: string;
  icon: string;
  isNew?: boolean;
}

export interface Ticket {
  id: string;
  origin: string;
  destination: string;
  date: string;
  time: string;
  busNumber: string;
  seatNumber: number;
  price: string;
  status: 'active' | 'expired' | 'cancelled';
  qrCode: string;
  validationCode?: string;
  feedbackRating?: number | null;
  feedbackComment?: string;
  feedbackStatus?: 'pending' | 'reviewing' | 'resolved';
  feedbackReviewedBy?: string;
  feedbackReviewedAt?: string | null;
}

export interface TicketFeedbackItem {
  id: string;
  ticketId: string;
  userName: string;
  studentId: string;
  origin: string;
  destination: string;
  departureTime: string;
  date: string;
  time: string;
  rating: number;
  comment: string;
  status: 'pending' | 'reviewing' | 'resolved';
  reviewedBy: string;
  reviewedAt: string | null;
  busNumber: string;
  price: string;
}

export interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: 'deposit' | 'withdraw';
  date: string;
  time: string;
  trackingNumber: string;
}

export interface AdminUser {
  id: number;
  name: string;
  studentId: string;
  nationalCode: string;
  balance: number;
  province?: string;
  city?: string;
  language?: Language;
  avatar?: string;
  status: 'active' | 'suspended';
  createdAt?: string;
  updatedAt?: string;
}

export type AdminRole = 'admin' | 'analyst';

export interface AdminAccount {
  id: number;
  username: string;
  role: AdminRole;
  status: 'active' | 'inactive';
  createdBy?: string;
  updatedBy?: string;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isActive: boolean;
}

export interface Driver {
  id: string;
  name: string;
  username?: string;
  licensePlate: string;
  phone: string;
  status: 'active' | 'inactive';
  capacity: number;
  assignedStations: string[];
  plateData?: any;
  documents?: any;
  nationalCode?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface DriverRequest {
  id: string;
  name: string;
  nationalCode: string;
  birthDate: string;
  phone: string;
  licensePlate: string;
  plateData: any;
  documents: {
    nationalCard: string;
    licenseCard: string;
    carCard: string;
  };
  username: string;
  status: 'pending' | 'rejected' | 'active' | 'inactive';
  createdAt: string;
}

export type DriverRouteRequestStatus = 'pending' | 'approved' | 'rejected';

export interface DriverRouteRequest {
  id: string;
  driverId: string;
  driverName?: string;
  licensePlate?: string;
  originStationId: string;
  destinationStationId: string;
  originName?: string;
  destinationName?: string;
  departureTime: string;
  price: number; // Toman
  status: DriverRouteRequestStatus;
  adminNote?: string;
  approvedScheduleId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusSchedule {
  id: string;
  driverId: string;
  originStationId: string;
  destinationStationId: string;
  departureTime: string;
  price: number;
  status: 'active' | 'inactive';
}

export interface FinanceRecord {
  id: string;
  type: 'student' | 'driver' | 'company';
  name: string; // Student Name or Driver Name
  identifier: string; // Student ID or License Plate
  amount: number;
  date: string;
  trackingNumber: string;
  description: string;
  companyShare?: number; // Only for driver/company view
  driverShare?: number; // Only for driver view
}

export interface SystemSettings {
  companyCommissionPercent: number;
  weeklyWalletTopupLimitToman?: number;
  weeklyWalletTopupLimitUpdatedAt?: string | null;
  weeklyWalletTopupLimitUpdatedBy?: string | null;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  status: 'active' | 'archived';
  audience?: 'student' | 'driver' | 'both';
  date: string;
}

export type IdeaStatus = 'submitted' | 'reviewing' | 'approved' | 'rejected' | 'done';

export interface UserIdea {
  id: string;
  title: string;
  description: string;
  category?: string;
  status: IdeaStatus;
  adminResponse?: string;
  adminNote?: string;
  reviewedBy?: string;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminIdea extends UserIdea {
  user: {
    id: string;
    name: string;
    studentId: string;
    nationalCode: string;
  };
}

export interface IdeaStatusHistoryItem {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actorRole: 'user' | 'admin';
  actorId: string | null;
  note: string | null;
  createdAt: string;
}

export type SupportTicketStatus = 'open' | 'in_progress' | 'answered' | 'closed';

export interface SupportTicketListItem {
  id: string;
  title: string;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt?: string;
  closedAt?: string | null;
  user?: { studentId: string; name: string };
}

export interface SupportTicketAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface SupportTicketMessage {
  id: string;
  senderRole: 'user' | 'admin';
  senderId?: string | null;
  message: string;
  createdAt: string;
  attachments: SupportTicketAttachment[];
}

export interface SupportTicketDetail {
  id: string;
  title: string;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt?: string;
  closedAt?: string | null;
  user: { studentId: string; name: string };
  messages: SupportTicketMessage[];
}
