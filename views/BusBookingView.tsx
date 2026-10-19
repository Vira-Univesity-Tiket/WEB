
import React, { useState } from 'react';
import { Icons } from '../components/Icons';
import { MapRef } from '../components/MapVisual';
import { BusOption, BookingStage, Station, Ticket } from '../types';
import QrCodeImage from '../components/QrCodeImage';
import StationSelect from '../components/StationSelect';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { formatAmountFa, amountToPersianWordsToman } from '../utils/numberUtils';

interface BusBookingViewProps {
  bookingStage: BookingStage;
  origin: string;
  destination: string;
  busOptions: BusOption[];
  selectedBus: BusOption | null;
  loading: boolean;
  bookingPending?: boolean;
  mapRef: React.RefObject<MapRef>;
  onBack: () => void;
  onLocate: () => void;
  onStationChange: (stationId: string, type: 'origin' | 'destination') => void;
  onSelectBus: (bus: BusOption) => void;
  onReset: () => void;
  onConfirm: (count: number) => void;
  onRefresh: () => void;
  onProfile: () => void;
  onFinishTrip: (ticketId: string) => void;
  ticketId?: string;
  currentTicket?: Ticket;
  stations?: Station[];
}

const BusBookingView: React.FC<BusBookingViewProps> = ({
  bookingStage, origin, destination, busOptions, selectedBus, loading, bookingPending = false,
  onBack, onStationChange, onSelectBus, onReset, onConfirm, onRefresh, onProfile, onFinishTrip, ticketId, currentTicket, stations = []
}) => {
  const [ticketCount, setTicketCount] = useState(1);
  const confirmDialog = useDialogFocus(bookingStage === BookingStage.CONFIRMATION, () => { if (!bookingPending) onReset(); });
  const ticketDialog = useDialogFocus(bookingStage === BookingStage.TICKET_VIEW, onBack);

  const getStationName = (id: string) => stations.find(s => s.id === id)?.name || id;
  const getRouteLabel = (bus: BusOption) => `${bus.originName || getStationName(origin)} → ${bus.destinationName || getStationName(destination)}`;

  const handleIncrement = () => setTicketCount(prev => Math.min(prev + 1, 6, selectedBus?.remainingSeats || 1));
  const handleDecrement = () => setTicketCount(prev => Math.max(prev - 1, 1));

  const formatTimeRange = (time: string) => {
    if (!time) return '';
    if (time.includes(':')) {
         const [h, m] = time.split(':').map(Number);
         const endH = m + 15 >= 60 ? (h + 1) % 24 : h;
         const endM = (m + 15) % 60;
         const endStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
         return `${time} - ${endStr}`;
    }
    return time;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-slate-950 relative overflow-hidden font-sans">
      
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 p-4 flex items-center justify-between shadow-sm border-b dark:border-slate-800 flex-none">
        <div className="flex items-center gap-3">
            <button aria-label="بازگشت به خانه" onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
              <Icons.ArrowRight size={24} className="text-gray-700 dark:text-gray-200" />
            </button>
            <h2 className="text-lg font-bold text-gray-800 dark:text-white">رزرو سرویس</h2>
        </div>
        <button aria-label="حساب کاربری" onClick={onProfile} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <Icons.User size={24} className="text-gray-700 dark:text-gray-200" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        
        {/* Route Selection Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-800 mb-6 relative">
             <div className="flex justify-between items-center mb-4">
                 <h3 className="font-bold text-gray-800 dark:text-white text-sm">انتخاب مسیر</h3>
                 {/* REFRESH BUTTON - Left side opposite title */}
                 <button 
                    onClick={onRefresh}
                    className="bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 p-2 rounded-full text-gray-600 dark:text-gray-300 transition-all active:scale-90"
                    title="بروزرسانی لیست سرویس‌ها"
                 >
                    <Icons.RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                 </button>
             </div>
             
             <div className="flex flex-col gap-4 relative">
                <div className="absolute right-[21px] top-[40px] h-[calc(100%-80px)] w-0.5 bg-gray-200 dark:bg-slate-700 border-l-2 border-dotted z-0 pointer-events-none"></div>

                <div className="relative z-10">
                   <div className="flex items-center gap-3">
                       <div className="w-4 h-4 bg-white dark:bg-slate-900 border-4 border-vira-secondary rounded-full shrink-0 shadow-sm"></div>
                       <div className="relative flex-1">
                           <StationSelect
                             label="مبدا حرکت"
                             placeholder="انتخاب ایستگاه مبدا..."
                             value={origin}
                             stations={stations}
                             onChange={(id) => onStationChange(id, 'origin')}
                           />
                       </div>
                   </div>
                </div>

                <div className="relative z-10">
                   <div className="flex items-center gap-3">
                       <div className="w-4 h-4 bg-white dark:bg-slate-900 border-4 border-red-500 rounded-full shrink-0 shadow-sm"></div>
                       <div className="relative flex-1">
                           <StationSelect
                             label="مقصد نهایی"
                             placeholder="انتخاب ایستگاه مقصد..."
                             value={destination}
                             stations={stations}
                             onChange={(id) => onStationChange(id, 'destination')}
                           />
                       </div>
                   </div>
                </div>
             </div>
        </div>

        {/* Results List */}
        {origin && destination && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-center mb-3 px-1">
                    <h3 className="font-bold text-gray-800 dark:text-white text-sm">سرویس‌های موجود</h3>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-lg font-bold">برنامه امروز</span>
                    </div>
                </div>
                
                {loading ? (
                    <div className="py-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm">
                        <div className="inline-block w-8 h-8 border-4 border-vira-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                        <p className="text-xs text-gray-500 font-bold">در حال جستجوی سرویس...</p>
                    </div>
                ) : busOptions.length === 0 ? (
                    <div className="py-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm">
                        <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-600 dark:text-gray-400">
                            <Icons.Bus size={32} />
                        </div>
                        <p className="text-sm font-bold text-gray-600 dark:text-gray-300">سرویسی یافت نشد</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">لطفا زمان یا مسیر دیگری را امتحان کنید.</p>
                    </div>
                ) : (
                    <div className="space-y-3 pb-20">
                        {busOptions.map((bus) => {
                            const routeLabel = getRouteLabel(bus);
                            return (
                                <div 
                                    key={bus.id} 
                                    role="button" tabIndex={bus.remainingSeats > 0 ? 0 : -1} aria-disabled={bus.remainingSeats === 0} onKeyDown={(event) => { if (bus.remainingSeats > 0 && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setTicketCount(1); onSelectBus(bus); } }} onClick={() => { if (bus.remainingSeats > 0) { setTicketCount(1); onSelectBus(bus); } }}
                                    className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm hover:border-vira-primary hover:shadow-md transition-all cursor-pointer group"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-xl bg-vira-light dark:bg-slate-800 flex items-center justify-center text-vira-primary dark:text-blue-400 group-hover:bg-vira-primary group-hover:text-white transition-colors shadow-sm">
                                                <Icons.Bus size={24} />
                                            </div>
                                            <div>
                                                <div className="font-black text-gray-800 dark:text-white text-base">{routeLabel}</div>
                                                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">
                                                    <Icons.Clock size={12} />
                                                    <span>حرکت: <span className="text-gray-800 dark:text-white font-bold px-1">{bus.departureTime}</span></span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-lg font-black text-vira-primary dark:text-blue-400">{bus.price ? formatAmountFa(bus.price) : '0'}</span>
                                            <span className="text-[10px] text-gray-600 dark:text-gray-400 font-bold">تومان</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center pt-3 border-t border-dashed border-gray-100 dark:border-slate-800">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-md font-bold">مقصد: {bus.destinationName || getStationName(destination)}</span>
                                            <span className={`text-[10px] px-2 py-1 rounded-md font-bold ${bus.remainingSeats < 5 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                                {bus.remainingSeats} صندلی خالی
                                            </span>
                                            <span className="text-[10px] text-gray-600 dark:text-gray-400">رسیدن: {bus.arrivalTime}</span>
                                        </div>
                                        <button disabled={bus.remainingSeats === 0} className="text-xs bg-gray-50 dark:bg-slate-800 group-hover:bg-vira-primary group-hover:text-white text-gray-600 dark:text-gray-300 px-4 py-1.5 rounded-lg font-bold transition-colors">
                                            انتخاب بلیط
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        )}
      </div>

      {/* Confirmation Popup */}
      {bookingStage === BookingStage.CONFIRMATION && selectedBus && (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="absolute inset-0" onClick={() => { if (!bookingPending) onReset(); }}></div>
           <div ref={confirmDialog} role="dialog" aria-modal="true" aria-label="تأیید خرید بلیط" tabIndex={-1} className="w-full max-h-[90dvh] overflow-y-auto bg-white dark:bg-slate-900 rounded-t-3xl p-5 relative z-40 shadow-2xl animate-in slide-in-from-bottom duration-300">
              <div className="w-12 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full mx-auto mb-6"></div>
              <div className="flex justify-between items-center mb-6">
                 <h3 className="font-bold text-lg text-gray-800 dark:text-white">تایید نهایی و پرداخت</h3>
                 <button aria-label="بستن تأیید خرید" disabled={bookingPending} onClick={onReset} className="p-2 bg-gray-50 dark:bg-slate-800 rounded-full text-gray-500"><Icons.X size={20} /></button>
              </div>
              <div className="bg-gray-50 dark:bg-slate-800 rounded-2xl p-4 border border-gray-100 dark:border-slate-700 mb-6">
                 <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">مبدا</span>
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{getStationName(origin)}</span>
                 </div>
                 <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">مقصد</span>
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{getStationName(destination)}</span>
                 </div>
                 <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-3">
                       <div className="text-[10px] text-gray-600 dark:text-gray-400">ساعت حرکت</div>
                       <div className="font-bold text-sm text-gray-800 dark:text-white mt-1">{selectedBus.departureTime}</div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-3">
                       <div className="text-[10px] text-gray-600 dark:text-gray-400">ساعت رسیدن</div>
                       <div className="font-bold text-sm text-gray-800 dark:text-white mt-1">{selectedBus.arrivalTime}</div>
                    </div>
                 </div>
              </div>
              {/* Quantity Selector */}
              <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-800 p-3 rounded-2xl border border-gray-100 dark:border-slate-700 mb-6">
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300 px-2">تعداد بلیط</span>
                  <div className="flex items-center gap-4 bg-white dark:bg-slate-900 rounded-xl p-1 border border-gray-200 dark:border-slate-700">
                      <button aria-label="کاهش تعداد بلیط" disabled={bookingPending || ticketCount <= 1} onClick={handleDecrement} className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700 font-bold">-</button>
                      <span className="font-black text-lg w-4 text-center">{ticketCount}</span>
                      <button aria-label="افزایش تعداد بلیط" disabled={bookingPending || ticketCount >= Math.min(6, selectedBus.remainingSeats)} onClick={handleIncrement} className="w-8 h-8 flex items-center justify-center rounded-lg bg-vira-primary text-white hover:bg-vira-secondary font-bold">+</button>
                  </div>
              </div>
              <div className="flex items-center justify-between mb-6 px-2">
                 <span className="font-bold text-gray-600 dark:text-gray-300">مبلغ قابل پرداخت</span>
                 <div className="flex items-center gap-1">
                    <span className="text-xl font-black text-gray-900 dark:text-white">{formatAmountFa(selectedBus.price * ticketCount)}</span>
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-400">تومان</span>
                 </div>
              </div>
              <div className="text-[11px] text-blue-600 font-bold mb-4 px-2">{amountToPersianWordsToman(selectedBus.price * ticketCount)}</div>
              <div className="flex items-center gap-3">
                 <div className="flex-1 text-xs text-gray-600 dark:text-gray-400 leading-5">با تایید این مرحله، مبلغ از کیف پول شما کسر خواهد شد.</div>
                 <button disabled={bookingPending} aria-busy={bookingPending} onClick={() => onConfirm(ticketCount)} className="flex-[2] bg-vira-primary text-white py-3.5 rounded-xl font-bold shadow-lg shadow-vira-accent/50 dark:shadow-none active:scale-95 transition-transform flex justify-center items-center gap-2">
                    <Icons.Wallet size={18} />
                    {bookingPending ? 'در حال صدور بلیط…' : 'ثبت بلیط'}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Ticket View Overlay */}
      {bookingStage === BookingStage.TICKET_VIEW && selectedBus && (
        <div className="absolute inset-0 z-30 bg-gray-50/95 dark:bg-slate-900/95 backdrop-blur-sm p-5 flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-200">
           <div ref={ticketDialog} role="dialog" aria-modal="true" aria-label="بلیط صادرشده" tabIndex={-1} className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 pb-4 relative overflow-hidden border dark:border-slate-700 max-h-[90vh] overflow-y-auto">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-vira-primary to-vira-secondary"></div>
              <div className="text-center mb-6 mt-2">
                 <div className="w-16 h-16 bg-vira-light dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-3 text-vira-primary dark:text-blue-400"><Icons.Ticket size={32} /></div>
                 <h2 className="text-xl font-black text-gray-800 dark:text-white">بلیط رزرو شد</h2>
              </div>
              <div className="space-y-4">
                 <div className="flex justify-between items-center bg-gray-50 dark:bg-slate-700 p-3 rounded-lg">
                    <div className="flex flex-col">
                       <span className="text-[10px] text-gray-600 dark:text-gray-400 dark:text-gray-300">مبدا</span>
                       <span className="font-bold text-xs dark:text-white">{getStationName(origin)}</span>
                    </div>
                    <Icons.ArrowRight className="text-gray-300 rotate-180" size={16} />
                    <div className="flex flex-col text-left">
                       <span className="text-[10px] text-gray-600 dark:text-gray-400 dark:text-gray-300">مقصد</span>
                       <span className="font-bold text-xs dark:text-white">{getStationName(destination)}</span>
                    </div>
                 </div>
                 <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="border rounded-lg p-2 dark:border-slate-600">
                       <span className="block text-[10px] text-gray-600 dark:text-gray-400">حرکت</span>
                       <span className="font-bold text-sm text-gray-800 dark:text-white" dir="ltr">{selectedBus.departureTime}</span>
                    </div>
                    <div className="border rounded-lg p-2 border-vira-primary/30 bg-vira-light dark:bg-blue-900/10">
                       <span className="block text-[10px] text-vira-primary dark:text-blue-400">رسیدن</span>
                       <span className="font-bold text-sm text-vira-primary dark:text-blue-400" dir="ltr">{selectedBus.arrivalTime}</span>
                    </div>
                    <div className="border rounded-lg p-2 dark:border-slate-600">
                       <span className="block text-[10px] text-gray-600 dark:text-gray-400">قیمت</span>
                       <span className="font-bold text-sm text-gray-800 dark:text-white">{formatAmountFa(selectedBus.price)}</span>
                    </div>
                 </div>
                 <div className="flex flex-col items-center gap-2 mt-4 pt-4 border-t border-dashed dark:border-slate-600">
                    <div className="p-4 bg-white rounded-xl border-2 border-gray-900">
                        {/* Encode the same unique purchase token shown in the ticket list. */}
                        <QrCodeImage value={currentTicket?.qrCode || ''} size={220} className="max-w-full object-contain" />
                    </div>
                    <span dir="ltr" className="text-2xl font-black text-black dark:text-white tracking-widest mt-2">{currentTicket?.validationCode || '----'}</span>
                 </div>
                 {(currentTicket?.passengerCount || 1) > 1 && <p className="text-sm text-gray-600 dark:text-gray-300 text-center">این QR برای {currentTicket?.passengerCount} مسافر است.</p>}
              </div>
              
              <div className="mt-6 flex flex-col gap-3">
                 {currentTicket?.boardedAt ? <button onClick={() => ticketId && onFinishTrip(ticketId)} className="w-full py-3 rounded-xl bg-vira-primary text-white font-bold">ثبت نظر سفر</button> : <p className="rounded-xl bg-blue-50 dark:bg-slate-700 text-blue-800 dark:text-blue-100 text-sm text-center leading-7 p-3">این QR را به راننده نشان دهید.<br />بلیط برای روز صدور معتبر است.</p>}

                 <div className="flex gap-3">
                     <button aria-label="بازگشت به خانه" onClick={onBack} className="flex-1 py-3 rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-200 text-sm font-bold hover:bg-gray-200 dark:hover:bg-slate-600">بازگشت</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default BusBookingView;
