
import React, { Suspense, lazy, useEffect } from 'react';
import { ViewState, BookingStage, AuthStage } from './types';
import { useSnappLogic } from './hooks/useSnappLogic';
import AuthView from './views/AuthView';
import RatingSheet from './components/RatingSheet';
import Toast from './components/Toast';

const HomeView = lazy(() => import('./views/HomeView'));
const BusBookingView = lazy(() => import('./views/BusBookingView'));
const ProfileView = lazy(() => import('./views/ProfileView'));
const TicketsView = lazy(() => import('./views/TicketsView'));
const WalletView = lazy(() => import('./views/WalletView'));
const SupportView = lazy(() => import('./views/SupportView'));
const FeedbackView = lazy(() => import('./views/FeedbackView'));
const AdminLoginView = lazy(() => import('./views/AdminLoginView'));
const AdminDashboardView = lazy(() => import('./views/AdminDashboardView'));
const DriverAppView = lazy(() => import('./views/DriverAppView'));

const PageLoader = () => (
  <div role="status" aria-label="در حال بارگذاری صفحه" className="flex items-center justify-center h-full min-h-[40dvh] bg-gray-100">
    <div className="w-10 h-10 border-4 border-vira-primary border-t-transparent rounded-full animate-spin"></div>
  </div>
);

const App: React.FC = () => {
  const { state, refs, actions } = useSnappLogic();
  const isDriverRoute =
    typeof window !== 'undefined' &&
    (window.location.pathname.startsWith('/driver') || window.location.pathname.startsWith('/deriver'));
  const isDataAnalysisRoute =
    typeof window !== 'undefined' &&
    window.location.pathname.startsWith('/dataanalysis');

  // Update Document Title based on Role/View
  useEffect(() => {
    if (isDriverRoute) {
      document.title = "Vira - Driver";
    } else if (state.view === ViewState.ADMIN_DASHBOARD || state.view === ViewState.ADMIN_LOGIN) {
      document.title = isDataAnalysisRoute ? "Vira - Data Analysis" : "Vira - Admin";
    } else {
      document.title = "Vira - User";
    }
  }, [state.view, isDriverRoute, isDataAnalysisRoute]);

  if (isDriverRoute) {
    return (
      <Suspense fallback={<PageLoader />}>
        <DriverAppView />
      </Suspense>
    );
  }

  if (state.view === ViewState.ADMIN_LOGIN) {
    return (
      <Suspense fallback={<PageLoader />}>
        <AdminLoginView onLogin={actions.handleAdminLogin} />
        <Toast message={state.toast.message} type={state.toast.type} visible={state.toast.visible} onClose={actions.closeToast} />
      </Suspense>
    );
  }

  if (state.view === ViewState.ADMIN_DASHBOARD) {
    return (
      <Suspense fallback={<PageLoader />}>
        <AdminDashboardView onLogout={actions.handleLogout} role={state.adminRole} />
        <Toast message={state.toast.message} type={state.toast.type} visible={state.toast.visible} onClose={actions.closeToast} />
      </Suspense>
    );
  }

  if (state.authStage !== AuthStage.LOGGED_IN) {
    return (
      <>
        <AuthView authStage={state.authStage} onLogin={actions.handleLogin} onRegister={actions.handleRegister} />
        <Toast message={state.toast.message} type={state.toast.type} visible={state.toast.visible} onClose={actions.closeToast} />
      </>
    );
  }

  return (
    <div className={`h-full w-full flex flex-col overflow-hidden relative ${state.isDarkMode ? 'dark' : ''}`}>
      <div className="flex-1 overflow-hidden relative bg-gray-50 dark:bg-slate-950">
        <Suspense fallback={<PageLoader />}>
          {state.view === ViewState.HOME && (
            <HomeView
              userProfile={state.userProfile}
              onServiceClick={actions.goToService}
              onOpenChat={() => actions.setChatOpen(true)}
              onProfileClick={actions.goToProfile}
              notification={state.activeNotification}
            />
          )}

          {state.view === ViewState.BUS && (
            <BusBookingView
              bookingStage={state.bookingStage}
              origin={state.origin}
              destination={state.destination}
              busOptions={state.busOptions}
              selectedBus={state.selectedBus}
              loading={state.loadingSchedule}
              bookingPending={state.bookingPending}
              mapRef={refs.mapRef}
              onBack={actions.goHome}
              onLocate={actions.locateUser}
              onStationChange={actions.updateStation}
              onSelectBus={actions.selectBus}
              onReset={actions.resetBooking}
              onConfirm={actions.confirmBooking}
              onRefresh={actions.refreshSchedule}
              onProfile={actions.goToProfile}
              onFinishTrip={actions.initiateRating}
              ticketId={state.issuedTicket?.id}
              currentTicket={state.issuedTicket || undefined}
              stations={state.stations}
            />
          )}

          {state.view === ViewState.PROFILE && (
            <ProfileView
              userProfile={state.userProfile}
              onBack={actions.goHome}
              onSave={actions.updateProfile}
              onLogout={actions.handleLogout}
              isDarkMode={state.isDarkMode}
              onToggleTheme={actions.toggleTheme}
              showToast={actions.showToast}
            />
          )}

          {state.view === ViewState.TICKETS && (
            <TicketsView tickets={state.tickets} onBack={actions.goHome} onFinishTrip={actions.initiateRating} showToast={actions.showToast} />
          )}

          {state.view === ViewState.WALLET && (
            <WalletView userProfile={state.userProfile} transactions={state.transactions} onBack={actions.goHome} showToast={actions.showToast} />
          )}

          {state.view === ViewState.FEEDBACK && (
            <FeedbackView onBack={actions.goHome} showToast={actions.showToast} />
          )}

          {state.view === ViewState.SUPPORT && <SupportView onBack={actions.goHome} />}
        </Suspense>

        <RatingSheet isOpen={!!state.ratingTicketId} onClose={actions.cancelRating} onSubmit={actions.submitRating} />

        <Toast message={state.toast.message} type={state.toast.type} visible={state.toast.visible} onClose={actions.closeToast} />
      </div>

      {state.chatOpen && (
        <div className="absolute inset-0 z-50 bg-white dark:bg-slate-900 flex flex-col">
          <div className="p-4 border-b dark:border-slate-800 flex items-center justify-between">
            <div className="flex flex-col">
                <h3 className="font-bold text-gray-800 dark:text-white">راهنمای خودکار</h3>
                <span className="text-[10px] text-gray-500 font-bold flex items-center gap-1">پاسخ‌گوی خودکار</span>
            </div>
            <button aria-label="بستن گفتگو" onClick={() => actions.setChatOpen(false)} className="p-2 bg-gray-100 dark:bg-slate-800 rounded-full">
              <span className="text-xl">&times;</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-slate-950">
            {state.messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] p-3 rounded-2xl text-sm leading-6 ${
                    msg.role === 'user'
                      ? 'bg-vira-primary text-white rounded-br-none'
                      : 'bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-slate-700 rounded-bl-none shadow-sm'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {state.isTyping && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-bl-none shadow-sm border border-gray-200 dark:border-slate-700">
                    <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                    </div>
                </div>
              </div>
            )}
            <div ref={refs.chatEndRef}></div>
          </div>
          <div className="p-4 bg-white dark:bg-slate-900 border-t dark:border-slate-800">
            <div className="flex gap-2">
              <input
                className="flex-1 bg-gray-100 dark:bg-slate-800 rounded-xl px-4 py-3 text-sm outline-none text-gray-800 dark:text-white"
                aria-label="پیام به راهنمای خودکار" placeholder="پیام خود را بنویسید..."
                value={state.inputMsg}
                onChange={(e) => actions.setInputMsg(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && actions.sendMessage()}
              />
              <button onClick={actions.sendMessage} className="bg-vira-primary text-white p-3 rounded-xl shadow-lg shadow-green-100 dark:shadow-none active:scale-95 transition-transform">
                ارسال
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
