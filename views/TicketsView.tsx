
import React, { useState } from 'react';
import { Icons } from '../components/Icons';
import QrCodeImage from '../components/QrCodeImage';
import { Ticket } from '../types';
import QRCode from 'qrcode';

interface TicketsViewProps {
  onBack: () => void;
  tickets: Ticket[];
  onFinishTrip: (ticketId: string) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const TicketsView: React.FC<TicketsViewProps> = ({ onBack, tickets, onFinishTrip, showToast }) => {
  const [activeTab, setActiveTab] = useState<'active' | 'expired'>('active');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const activeTickets = tickets.filter((t) => t.status === 'active');
  const expiredTickets = tickets.filter((t) => t.status !== 'active');

  const handleDownload = async () => {
    if (!selectedTicket) return;
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 500;
        canvas.height = 750;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // White Bg
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 500, 750);

        // Blue Header
        ctx.fillStyle = '#3674B5';
        ctx.fillRect(0, 0, 500, 100);
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 30px "Tahoma", "Arial"'; 
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('بلیط سرویس دانشگاه', 250, 50);

        // Info Box Border
        ctx.strokeStyle = '#eeeeee';
        ctx.lineWidth = 2;
        ctx.strokeRect(20, 120, 460, 610);

        // Route Info
        ctx.fillStyle = '#000';
        ctx.font = 'bold 24px "Tahoma", "Arial"';
        // Simple RTL approximation for canvas
        const routeText = `${selectedTicket.origin} به ${selectedTicket.destination}`;
        ctx.fillText(routeText, 250, 160);

        // Ticket Details
        ctx.font = '20px "Tahoma", "Arial"';
        const startY = 220;
        const lineHeight = 40;

        // Draw Labels (Right aligned visually)
        ctx.fillStyle = '#666';
        ctx.textAlign = 'right';
        ctx.fillText('تاریخ:', 450, startY);
        ctx.fillText('ساعت:', 450, startY + lineHeight);
        ctx.fillText('صندلی:', 450, startY + lineHeight * 2);
        ctx.fillText('قیمت:', 450, startY + lineHeight * 3);

        // Draw Values (Left aligned visually)
        ctx.fillStyle = '#000';
        ctx.textAlign = 'left';
        ctx.fillText(selectedTicket.date, 50, startY);
        ctx.fillText(selectedTicket.time, 50, startY + lineHeight);
        ctx.fillText(selectedTicket.seatNumber.toString(), 50, startY + lineHeight * 2);
        ctx.fillText(selectedTicket.price, 50, startY + lineHeight * 3);

        // Validation Code
        if (selectedTicket.validationCode) {
            ctx.fillStyle = '#3674B5';
            ctx.font = 'bold 50px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(selectedTicket.validationCode, 250, 420);
        }

        // QR Code
        // Use high error correction level for better scanning
        const qrData = await QRCode.toDataURL(selectedTicket.qrCode, { width: 220, margin: 1, errorCorrectionLevel: 'H' });
        const img = new Image();
        img.src = qrData;
        await new Promise(r => img.onload = r);
        ctx.drawImage(img, 140, 460);

        // Footer
        ctx.fillStyle = '#aaaaaa';
        ctx.font = '14px "Tahoma", "Arial"';
        ctx.textAlign = 'center';
        ctx.fillText(`شماره بلیط: ${selectedTicket.id}`, 250, 710);

        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `ticket-${selectedTicket.id}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('تصویر بلیط ذخیره شد', 'success');
    } catch (e) {
        console.error(e);
        showToast('خطا در دانلود بلیط', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-slate-950 font-sans">
      <div className="bg-white dark:bg-slate-900 p-4 flex items-center gap-3 shadow-sm sticky top-0 z-10 border-b dark:border-slate-800 flex-none">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800">
          <Icons.ArrowRight size={24} className="text-gray-700 dark:text-gray-200" />
        </button>
        <h2 className="text-lg font-bold text-gray-800 dark:text-white">بلیط های من</h2>
      </div>

      <div className="bg-white dark:bg-slate-900 px-4 pt-2 flex border-b border-gray-200 dark:border-slate-800 flex-none">
        <button onClick={() => setActiveTab('active')} className={`flex-1 pb-3 text-sm font-bold border-b-2 ${activeTab === 'active' ? 'text-vira-primary border-vira-primary' : 'text-gray-400 border-transparent'}`}>فعال</button>
        <button onClick={() => setActiveTab('expired')} className={`flex-1 pb-3 text-sm font-bold border-b-2 ${activeTab === 'expired' ? 'text-gray-700 dark:text-gray-300 border-gray-700 dark:border-gray-500' : 'text-gray-400 border-transparent'}`}>منقضی</button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        {activeTab === 'active' ? (
          <div className="space-y-4 pb-20">
            {activeTickets.length === 0 && <div className="text-center text-gray-400 mt-10 text-sm">بلیط فعالی ندارید.</div>}
            {activeTickets.map((ticket) => {
              return (
              <div key={ticket.id} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden relative transition-all duration-300">
                <div className="absolute top-0 left-0 h-full w-1.5 bg-vira-primary"></div>
                <div className="p-4">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold text-gray-400">شماره بلیط: {ticket.id}</span>
                    <span className="text-[10px] bg-vira-light text-vira-primary px-2 py-0.5 rounded-full font-bold">فعال</span>
                  </div>

                  <div className="mb-4">
                    <div className="text-sm font-bold text-gray-800 dark:text-white">{ticket.origin} → {ticket.destination}</div>
                    <div className="text-xs text-gray-500 mt-1">{ticket.date} | {ticket.time}</div>
                    <div className="text-xs text-gray-500">صندلی {ticket.seatNumber} | {ticket.price}</div>
                    {ticket.validationCode && <div className="text-xs text-blue-500 mt-1">کد ۴ رقمی: {ticket.validationCode}</div>}
                  </div>

                  <div className="flex gap-2 mb-3">
                    <button onClick={() => setSelectedTicket(ticket)} className="flex-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-slate-700">
                      <Icons.QrCode size={16} />
                      QR
                    </button>
                    <button onClick={() => onFinishTrip(ticket.id)} className="flex-1 bg-vira-primary text-white py-2.5 rounded-xl text-sm font-bold shadow-md shadow-vira-accent/30 hover:bg-vira-secondary">پایان سفر</button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-dashed border-gray-100 dark:border-slate-800 text-[11px]">
                    <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-3">
                      <div className="text-gray-400 font-bold">مسیر</div>
                      <div className="text-gray-800 dark:text-white font-bold mt-1">{ticket.origin} → {ticket.destination}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-3">
                      <div className="text-gray-400 font-bold">زمان</div>
                      <div className="text-gray-800 dark:text-white font-bold mt-1">{ticket.date} | {ticket.time}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-3">
                      <div className="text-gray-400 font-bold">صندلی</div>
                      <div className="text-gray-800 dark:text-white font-bold mt-1">شماره {ticket.seatNumber}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-3">
                      <div className="text-gray-400 font-bold">قیمت</div>
                      <div className="text-gray-800 dark:text-white font-bold mt-1">{ticket.price}</div>
                    </div>
                  </div>

                </div>
              </div>
            )})}
          </div>
        ) : (
          <div className="space-y-3 pb-20">
            {expiredTickets.map((ticket) => (
              <div key={ticket.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 flex justify-between items-center opacity-70">
                <div>
                  <div className="text-xs font-bold text-gray-700 dark:text-gray-300">{ticket.origin} → {ticket.destination}</div>
                  <span className="text-[10px] text-gray-400">{ticket.date} | {ticket.price}</span>
                </div>
                <div className="text-xs bg-gray-100 dark:bg-slate-900 text-gray-500 px-2 py-1 rounded">منقضی</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 relative">
            <button onClick={() => setSelectedTicket(null)} className="absolute top-4 right-4 bg-gray-100 dark:bg-slate-800 p-2 rounded-full text-gray-500">
              <Icons.X size={18} />
            </button>

            <div className="flex flex-col items-center mt-4">
              <h3 className="font-bold text-lg text-gray-800 dark:text-white">اسکن بلیط</h3>
              <span className="text-xs text-gray-400 mt-1">این کد را به راننده نشان دهید</span>

              <div className="my-8 p-4 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-2xl bg-white shadow-sm w-full flex justify-center">
                <QrCodeImage value={selectedTicket.qrCode} size={200} className="w-44 h-44 object-contain" />
              </div>

              <div className="w-full bg-gray-50 dark:bg-slate-800 p-4 rounded-xl mb-3 flex justify-between items-center">
                <span className="text-xs text-gray-500 dark:text-gray-400">شناسه QR</span>
                <span className="font-mono text-xs text-gray-800 dark:text-white">{selectedTicket.qrCode}</span>
              </div>

              {selectedTicket.validationCode && (
                <div className="w-full bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl mb-6 flex justify-between items-center">
                  <span className="text-xs text-blue-600 dark:text-blue-300">کد ۴ رقمی</span>
                  <span className="font-mono text-lg tracking-[4px] text-blue-700 dark:text-blue-200">{selectedTicket.validationCode}</span>
                </div>
              )}

              <button onClick={handleDownload} className="w-full bg-blue-500 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                  <Icons.Download size={18} />
                  دانلود تصویر بلیط
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketsView;
