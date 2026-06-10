import { ServiceItem, UserProfile, Ticket, Transaction } from './types';

export const UNIVERSITY_SERVICES: ServiceItem[] = [
  { id: 'bus', title: 'سرویس دانشگاه', icon: 'bus', isNew: false },
  { id: 'tickets', title: 'بلیط ها', icon: 'ticket', isNew: false },
  { id: 'wallet', title: 'کیف پول', icon: 'wallet', isNew: false },
  { id: 'support', title: 'پشتیبانی', icon: 'support', isNew: true },
  { id: 'feedback', title: 'ثبت ایده و نظرات', icon: 'feedback', isNew: true }
];

export const DEFAULT_USER_PROFILE: UserProfile = {
  name: '',
  studentId: '',
  nationalCode: '',
  province: '',
  city: '',
  balance: '0 ریال',
  language: 'fa',
  avatar: ''
};

export const INITIAL_CHAT_MESSAGE = 'سلام. چگونه می توانم کمک کنم؟';

export const MOCK_TICKETS: Ticket[] = [];

export const MOCK_TRANSACTIONS: Transaction[] = [];
