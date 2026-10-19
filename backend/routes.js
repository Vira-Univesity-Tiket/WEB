
import express from 'express';
import { handleAdminLogin, handleLogin, handleRegister, handleUpdateProfile, handleCurrentUser } from './controllers/authController.js';
import { handleGetUsers, handleTopUpUser, handleUpdateUser, handleDeleteUser, handleToggleUserStatus } from './controllers/adminController.js';
import { handleGetTickets, handleReserveTicket } from './controllers/ticketController.js';
import { handleTicketFeedback, handleListTicketFeedback, handleReviewTicketFeedback } from './controllers/ticketFeedbackController.js';
import { handleGetBusSchedule, handleChat } from './controllers/tripController.js';
import { handleGetTransactions, handleTopUpDeprecated, handleTopUpInitiate, handleTopUpCallback, handleTopUpStatus, handleSupportTicket } from './controllers/walletController.js';
import { handleHealth } from './controllers/healthController.js';
import {
  handleCreateSupportTicket,
  handleListSupportTickets,
  handleGetSupportTicket,
  handleAddSupportTicketMessage,
  handleAdminListSupportTickets,
  handleAdminSetSupportTicketStatus,
  handleDownloadSupportAttachment,
  handleDownloadSupportTicketTxt
} from './controllers/supportTicketController.js';
import {
  handleCreateDriver,
  handleUpdateDriver,
  handleDeleteDriver,
  handleToggleDriverStatus,
  handleGetDrivers,
  
  handleCreateStation,
  handleUpdateStation,
  handleDeleteStation,
  handleToggleStationStatus,
  handleGetStations,

  handleCreateSchedule,
  handleUpdateSchedule,
  handleDeleteSchedule,
  handleToggleScheduleStatus,
  handleGetSchedules,

  handleGetPendingDrivers,
  handleGetDriverRequestHistory,
  handleApproveDriver,
  handleRejectDriver,
  handleGetDriverExportData // NEW
} from './controllers/adminOpsController.js';
import {
  handleDriverLogin,
  handleDriverDashboard,
  handleDriverRecentScans,
  handleDriverScanByCode,
  handleDriverScanByQr,
  handleDriverSummary,
  handleDriverRegister
} from './controllers/driverController.js';
import {
  handleDriverCreateRouteRequest,
  handleDriverListRouteRequests,
  handleAdminListRouteRequests,
  handleAdminApproveRouteRequest,
  handleAdminRejectRouteRequest
} from './controllers/driverRouteRequestController.js';
import { handleGetFinanceData, handleGetSettings, handleUpdateSettings } from './controllers/adminFinanceController.js';
import {
  handleGetActiveNotification,
  handleGetNotifications,
  handleCreateNotification,
  handleUpdateNotification,
  handleToggleNotificationStatus,
  handleDeleteNotification
} from './controllers/notificationController.js';
import {
  handleAdminGetIdeaDetail,
  handleAdminListIdeas,
  handleAdminUpdateIdea,
  handleCreateIdea,
  handleDeleteMyIdea,
  handleGetMyNotifications,
  handleListMyIdeas,
  handleMarkNotificationRead,
  handleUpdateMyIdea
} from './controllers/ideaController.js';
import {
  handleAnalystLoginLogs,
  handleCreateAnalyst,
  handleListAnalysts,
  handleResetAnalystPassword,
  handleToggleAnalystStatus,
  handleUpdateAnalyst
} from './controllers/adminAccountController.js';
import { handleGetLegalContent, handleUpsertLegalContent } from './controllers/legalController.js';
import { authenticate as authenticateToken, createRateLimiter, enforceReadOnlyRole, optionalAuth, requireRole } from './security.js';
import { requireActiveAccount } from './accountAccess.js';

const router = express.Router();
const authenticate = [authenticateToken, requireActiveAccount];
const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 40, keyPrefix: 'auth' });
const writeLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 120, keyPrefix: 'write', keyResolver: req => req.auth ? `${req.auth.role}:${req.auth.sub}` : req.ip });
const financeLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 20, keyPrefix: 'finance', keyResolver: req => req.auth ? `${req.auth.role}:${req.auth.sub}` : req.ip });
const ideaLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 12, keyPrefix: 'idea' });
const paymentInitLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  keyPrefix: 'payment-init',
  keyResolver: (req) => req.auth?.studentId || req.auth?.sub || req.ip
});
const paymentCallbackLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyPrefix: 'payment-callback',
  keyResolver: (req) => req.query?.Authority || req.body?.Authority || req.query?.authority || req.body?.authority || req.ip
});

// Auth
router.post('/auth/login', authLimiter, handleLogin);
router.post('/auth/register', authLimiter, handleRegister);
router.get('/auth/me', authenticate, requireRole('user'), handleCurrentUser);
router.post('/auth/update-profile', authenticate, requireRole('user'), handleUpdateProfile);
router.post('/admin/login', authLimiter, handleAdminLogin);
router.use('/admin', authenticate, requireRole('admin', 'analyst'), enforceReadOnlyRole('analyst'));

// Common
router.get('/', handleHealth);
router.get('/health', handleHealth);
router.post('/bus/schedule', handleGetBusSchedule);
router.get('/stations', handleGetStations);
router.post('/support/chat', handleChat);
router.get('/notifications/active', optionalAuth, handleGetActiveNotification); // Public notification (role-aware)
router.get('/legal', handleGetLegalContent);
router.get('/notifications/inbox', authenticate, requireRole('user'), handleGetMyNotifications);
router.put('/notifications/inbox/:id/read', authenticate, requireRole('user'), writeLimiter, handleMarkNotificationRead);

// Ideas / Feedback (User)
router.post('/ideas', authenticate, requireRole('user'), ideaLimiter, handleCreateIdea);
router.get('/ideas/mine', authenticate, requireRole('user'), handleListMyIdeas);
router.put('/ideas/:id', authenticate, requireRole('user'), ideaLimiter, handleUpdateMyIdea);
router.delete('/ideas/:id', authenticate, requireRole('user'), ideaLimiter, handleDeleteMyIdea);

// Wallet & Tickets (User)
router.get('/wallet/transactions', authenticate, requireRole('user'), handleGetTransactions);
router.get('/wallet/topup/callback', paymentCallbackLimiter, handleTopUpCallback);
router.post('/wallet/topup/callback', paymentCallbackLimiter, handleTopUpCallback);
router.post('/wallet/topup/initiate', authenticate, requireRole('user'), paymentInitLimiter, handleTopUpInitiate);
router.get('/wallet/topup/status/:transactionId', authenticate, requireRole('user'), financeLimiter, handleTopUpStatus);
router.post('/wallet/topup', authenticate, requireRole('user'), financeLimiter, handleTopUpDeprecated);
router.post('/support/ticket', authenticate, handleSupportTicket);
router.post('/support/tickets', authenticate, requireRole('user'), writeLimiter, handleCreateSupportTicket);
router.get('/support/tickets', authenticate, requireRole('user'), handleListSupportTickets);
router.get('/support/tickets/:ticketId', authenticate, requireRole('user', 'admin'), handleGetSupportTicket);
router.post('/support/tickets/:ticketId/messages', authenticate, requireRole('user', 'admin'), writeLimiter, handleAddSupportTicketMessage);
router.get('/support/tickets/:ticketId/txt', authenticate, requireRole('user', 'admin'), handleDownloadSupportTicketTxt);
router.get('/support/attachments/:attachmentId/download', authenticate, requireRole('user', 'admin'), handleDownloadSupportAttachment);
router.get('/tickets', authenticate, requireRole('user'), handleGetTickets);
router.post('/tickets/reserve', authenticate, requireRole('user'), writeLimiter, handleReserveTicket);
router.post('/tickets/:ticketId/feedback', authenticate, requireRole('user'), writeLimiter, handleTicketFeedback);

// --- Admin Users ---
router.get('/admin/users', handleGetUsers);
router.get('/admin/tickets/feedback', handleListTicketFeedback);
router.post('/admin/tickets/:ticketId/feedback/status', requireRole('admin'), writeLimiter, handleReviewTicketFeedback);
router.post('/admin/topup', requireRole('admin'), financeLimiter, handleTopUpUser);
router.put('/admin/users/:userId', requireRole('admin'), writeLimiter, handleUpdateUser);
router.put('/admin/users/:userId/status', requireRole('admin'), writeLimiter, handleToggleUserStatus);
router.delete('/admin/users/:userId', requireRole('admin'), writeLimiter, handleDeleteUser);
router.get('/admin/analysts', handleListAnalysts);
router.post('/admin/analysts', requireRole('admin'), writeLimiter, handleCreateAnalyst);
router.put('/admin/analysts/:id', requireRole('admin'), writeLimiter, handleUpdateAnalyst);
router.put('/admin/analysts/:id/status', requireRole('admin'), writeLimiter, handleToggleAnalystStatus);
router.put('/admin/analysts/:id/reset-password', requireRole('admin'), writeLimiter, handleResetAnalystPassword);
router.get('/admin/analysts/:id/login-logs', handleAnalystLoginLogs);

// --- Admin Stations ---
router.get('/admin/stations', handleGetStations);
router.post('/admin/stations', requireRole('admin'), writeLimiter, handleCreateStation);
router.put('/admin/stations/:stationId', requireRole('admin'), writeLimiter, handleUpdateStation);
router.put('/admin/stations/:stationId/status', requireRole('admin'), writeLimiter, handleToggleStationStatus);
router.delete('/admin/stations/:stationId', requireRole('admin'), writeLimiter, handleDeleteStation);

// --- Admin Drivers ---
router.get('/admin/drivers', handleGetDrivers);
router.post('/admin/drivers', requireRole('admin'), writeLimiter, handleCreateDriver);
router.put('/admin/drivers/:driverId', requireRole('admin'), writeLimiter, handleUpdateDriver);
router.put('/admin/drivers/:driverId/status', requireRole('admin'), writeLimiter, handleToggleDriverStatus);
router.delete('/admin/drivers/:driverId', requireRole('admin'), writeLimiter, handleDeleteDriver);
router.get('/admin/drivers/:driverId/export', handleGetDriverExportData); // New export route

// --- Admin Driver Requests ---
router.get('/admin/driver-requests', handleGetPendingDrivers);
router.get('/admin/driver-requests/history', handleGetDriverRequestHistory); // New endpoint for history
router.post('/admin/driver-requests/:driverId/approve', requireRole('admin'), writeLimiter, handleApproveDriver);
router.post('/admin/driver-requests/:driverId/reject', requireRole('admin'), writeLimiter, handleRejectDriver);

// --- Admin Schedules ---
router.get('/admin/schedules', handleGetSchedules);
router.post('/admin/schedules', requireRole('admin'), writeLimiter, handleCreateSchedule);
router.put('/admin/schedules/:scheduleId', requireRole('admin'), writeLimiter, handleUpdateSchedule);
router.put('/admin/schedules/:scheduleId/status', requireRole('admin'), writeLimiter, handleToggleScheduleStatus);
router.delete('/admin/schedules/:scheduleId', requireRole('admin'), writeLimiter, handleDeleteSchedule);

// --- Admin Service Program (Driver Route Requests) ---
router.get('/admin/route-requests', handleAdminListRouteRequests);
router.post('/admin/route-requests/:requestId/approve', requireRole('admin'), writeLimiter, handleAdminApproveRouteRequest);
router.post('/admin/route-requests/:requestId/reject', requireRole('admin'), writeLimiter, handleAdminRejectRouteRequest);

// --- Admin Notifications ---
router.get('/admin/notifications', handleGetNotifications);
router.get('/admin/legal', handleGetLegalContent);
router.put('/admin/legal', requireRole('admin'), writeLimiter, handleUpsertLegalContent);
router.post('/admin/notifications', requireRole('admin'), writeLimiter, handleCreateNotification);
router.put('/admin/notifications/:id', requireRole('admin'), writeLimiter, handleUpdateNotification);
router.put('/admin/notifications/:id/status', requireRole('admin'), writeLimiter, handleToggleNotificationStatus);
router.delete('/admin/notifications/:id', requireRole('admin'), writeLimiter, handleDeleteNotification);

// --- Admin Finance ---
router.get('/admin/finance', handleGetFinanceData);
router.get('/admin/settings', handleGetSettings);
router.post('/admin/settings', requireRole('admin'), writeLimiter, handleUpdateSettings);

// --- Admin Support Tickets ---
router.get('/admin/support/tickets', handleAdminListSupportTickets);
router.get('/admin/support/tickets/:ticketId', handleGetSupportTicket);
router.post('/admin/support/tickets/:ticketId/status', requireRole('admin'), writeLimiter, handleAdminSetSupportTicketStatus);
router.post('/admin/support/tickets/:ticketId/messages', requireRole('admin'), writeLimiter, handleAddSupportTicketMessage);
router.get('/admin/support/tickets/:ticketId/txt', handleDownloadSupportTicketTxt);
router.get('/admin/support/attachments/:attachmentId/download', handleDownloadSupportAttachment);

// --- Admin Ideas / Feedback ---
router.get('/admin/ideas', handleAdminListIdeas);
router.get('/admin/ideas/:id', handleAdminGetIdeaDetail);
router.put('/admin/ideas/:id', requireRole('admin'), writeLimiter, handleAdminUpdateIdea);

// --- Driver App ---
router.post('/driver/register', authLimiter, handleDriverRegister);
router.post('/driver/login', authLimiter, handleDriverLogin);
router.post('/driver/scan/qr', authenticate, requireRole('driver'), writeLimiter, handleDriverScanByQr);
router.post('/driver/scan/code', authenticate, requireRole('driver'), writeLimiter, handleDriverScanByCode);
router.get('/driver/:driverId/summary', authenticate, requireRole('driver'), handleDriverSummary);
router.get('/driver/:driverId/recent-scans', authenticate, requireRole('driver'), handleDriverRecentScans);
router.get('/driver/:driverId/dashboard', authenticate, requireRole('driver'), handleDriverDashboard);
router.post('/driver/route-requests', authenticate, requireRole('driver'), writeLimiter, handleDriverCreateRouteRequest);
router.get('/driver/route-requests', authenticate, requireRole('driver'), handleDriverListRouteRequests);

router.get('/test', (req, res) => {
  res.json({ message: 'API Router is working correctly!' });
});

export default router;
