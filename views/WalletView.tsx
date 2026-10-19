
import React, { useEffect, useState } from 'react';
import { Icons } from '../components/Icons';
import { Transaction, UserProfile } from '../types';
import { getWalletTransactions, getWalletTopupStatus, initiateTopupWallet, getCurrentUserAPI } from '../services/apiService';
import { addCommas, amountToPersianWordsToman, formatAmountFa, removeCommas, toEnglishDigits } from '../utils/numberUtils';

interface WalletViewProps {
  userProfile: UserProfile;
  onBack: () => void;
  transactions: Transaction[];
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const WalletView: React.FC<WalletViewProps> = ({ userProfile, onBack, transactions, showToast }) => {
  const [showTopUpSheet, setShowTopUpSheet] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [loadingTopup, setLoadingTopup] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [topupPolling, setTopupPolling] = useState(false);
  
  const [liveTransactions, setLiveTransactions] = useState<Transaction[]>(transactions);
  const [liveBalance, setLiveBalance] = useState(userProfile.balance);

  useEffect(() => {
    setLiveTransactions(transactions);
  }, [transactions]);

  useEffect(() => {
    setLiveBalance(userProfile.balance);
  }, [userProfile.balance]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const txId = url.searchParams.get('topupTransactionId');
    const statusFromUrl = url.searchParams.get('topupStatus');
    if (!txId) return;

    let active = true;
    const cleanUrl = () => {
      if (!active) return;
      url.searchParams.delete('topupTransactionId');
      url.searchParams.delete('topupStatus');
      url.searchParams.delete('topupReferenceId');
      url.searchParams.delete('topupMessage');
      window.history.replaceState({}, '', url.toString());
    };

    const handleResolvedStatus = async () => {
      try {
        const statusData = await getWalletTopupStatus(txId);
        if (!active) return;
        if (statusData.status === 'success') {
          showToast(statusData.message || 'پرداخت با موفقیت تایید شد', 'success');
          await refreshWallet();
          cleanUrl();
          return;
        }
        if (statusData.status === 'pending') {
          setTopupPolling(true);
          const started = Date.now();
          const maxMs = 40_000;
          while (Date.now() - started < maxMs) {
            await new Promise((resolve) => setTimeout(resolve, 2500));
            if (!active) return;
            const next = await getWalletTopupStatus(txId);
            if (!active) return;
            if (next.status !== 'pending') {
              setTopupPolling(false);
              showToast(next.message || (next.status === 'success' ? 'پرداخت تایید شد' : 'پرداخت ناموفق بود'), next.status === 'success' ? 'success' : 'error');
              if (next.status === 'success') await refreshWallet();
              cleanUrl();
              return;
            }
          }
          setTopupPolling(false);
          showToast('وضعیت پرداخت هنوز نهایی نشده است. کمی بعد دوباره بررسی کنید.', 'info');
          cleanUrl();
          return;
        }

        showToast(statusData.message || 'پرداخت ناموفق بود', 'error');
        cleanUrl();
      } catch (error: any) {
        if (active) showToast(error?.message || 'خطا در دریافت وضعیت پرداخت', 'error');
        cleanUrl();
      }
    };

    void handleResolvedStatus();
    return () => { active = false; };
  }, []);

  const balanceDisplay = liveBalance;

  const refreshWallet = async () => {
    setIsRefreshing(true);
    try {
      const [profile, txs] = await Promise.all([
        getCurrentUserAPI(),
        getWalletTransactions(userProfile.studentId)
      ]);
      setLiveBalance(profile.balance);
      setLiveTransactions(txs);
      showToast('موجودی بروز شد', 'info');
    } catch {
      showToast('خطا در بروزرسانی', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = toEnglishDigits(e.target.value).replace(/,/g, '').replace(/\D/g, '');
    setTopUpAmount(addCommas(raw));
  };

  const handleTopUpSubmit = async () => {
    if (!topUpAmount) return;
    setLoadingTopup(true);
    const amount = removeCommas(topUpAmount);
    
    try {
      const initiated = await initiateTopupWallet(amount);
      setTopUpAmount('');
      setShowTopUpSheet(false);
      if (!initiated?.paymentUrl) {
        throw new Error('لینک پرداخت معتبر دریافت نشد');
      }
      window.location.href = initiated.paymentUrl;
    } catch (error: any) {
      showToast(error?.message || 'شارژ ناموفق بود', 'error');
    } finally {
      setLoadingTopup(false);
    }
  };

  const toggleTxExpand = (id: string) => {
    setExpandedTxId(expandedTxId === id ? null : id);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-slate-950 font-sans transition-colors duration-200">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 p-4 flex items-center justify-between shadow-sm sticky top-0 z-10 border-b dark:border-slate-800 flex-none">
        <div className="flex items-center gap-3">
          <button aria-label="بازگشت به خانه" onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <Icons.ArrowRight size={24} className="text-gray-700 dark:text-gray-200" />
          </button>
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">کیف پول</h2>
        </div>
        <button aria-label="بروزرسانی کیف پول" onClick={refreshWallet} className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors ${isRefreshing ? 'animate-spin' : ''}`}>
           <Icons.Activity size={20} className="text-gray-700 dark:text-gray-200" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-24">
         {/* Balance Card */}
         <div className="bg-gradient-to-br from-gray-900 to-gray-800 dark:from-slate-800 dark:to-slate-900 rounded-3xl p-6 text-white shadow-xl shadow-gray-300 dark:shadow-none mb-6 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-40 h-40 bg-white opacity-5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
             
             <div className="relative z-10">
                <span className="text-sm opacity-80 font-medium">موجودی فعلی</span>
                <div className="text-3xl font-black mt-2 tracking-tight flex items-center gap-2">
                   {balanceDisplay}
                </div>
                
                <div className="mt-8 flex gap-3">
                   <button 
                     onClick={() => setShowTopUpSheet(true)}
                     className="flex-1 bg-white text-gray-900 py-3 rounded-xl font-bold text-sm hover:bg-gray-100 active:scale-95 transition-all flex items-center justify-center gap-2"
                   >
                      <Icons.PlusSquare size={18} />
                      افزایش موجودی
                   </button>
                </div>
             </div>
         </div>

         {/* Transactions List */}
         <h3 className="font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
            <Icons.Activity size={18} className="text-vira-primary" />
            تراکنش‌های اخیر
         </h3>

         <div className="space-y-3 pb-10">
            {liveTransactions.length === 0 ? (
               <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800">
                  <div className="w-12 h-12 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-600 dark:text-gray-400">
                     <Icons.Wallet size={24} />
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">هنوز تراکنشی ثبت نشده است</p>
               </div>
            ) : (
               liveTransactions.map((tx) => (
                  <div 
                    key={tx.id} 
                    onClick={() => toggleTxExpand(tx.id)}
                    className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm transition-all"
                  >
                     <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                           <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.type === 'deposit' ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 dark:text-red-400'}`}>
                              {tx.type === 'deposit' ? <Icons.ArrowDownLeft size={20} /> : <Icons.ArrowUpRight size={20} />}
                           </div>
                           <div>
                              <div className="font-bold text-sm text-gray-800 dark:text-white">{tx.title}</div>
                              <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-1">{tx.date} | {tx.time}</div>
                           </div>
                        </div>
                        <div className="text-left">
                           <div className={`font-bold text-sm ${tx.type === 'deposit' ? 'text-green-600 dark:text-green-400' : 'text-gray-800 dark:text-white'}`}>
                              {tx.type === 'deposit' ? '+' : '-'}{formatAmountFa(tx.amount)}
                           </div>
                           <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-1">تومان</div>
                        </div>
                     </div>
                     
                     {/* Expanded Details */}
                     {expandedTxId === tx.id && (
                        <div className="mt-4 pt-4 border-t border-dashed border-gray-100 dark:border-slate-800 grid grid-cols-2 gap-4 animate-in slide-in-from-top-2">
                           <div>
                              <span className="block text-[10px] text-gray-600 dark:text-gray-400">کد پیگیری</span>
                              <span className="block text-xs font-bold text-gray-700 dark:text-gray-300 font-mono mt-1">{tx.trackingNumber}</span>
                           </div>
                           <div>
                              <span className="block text-[10px] text-gray-600 dark:text-gray-400">وضعیت</span>
                              <span className="block text-xs font-bold text-green-600 dark:text-green-400 mt-1">موفق</span>
                           </div>
                        </div>
                     )}
                  </div>
               ))
            )}
         </div>
      </div>

      {/* Top Up Sheet */}
      {showTopUpSheet && (
         <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="absolute inset-0" onClick={() => setShowTopUpSheet(false)}></div>
            <div className="w-full bg-white dark:bg-slate-900 rounded-t-3xl p-6 relative z-10 animate-in slide-in-from-bottom shadow-2xl">
               <div className="w-12 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full mx-auto mb-6"></div>
               <h3 className="font-bold text-lg text-gray-800 dark:text-white mb-6">افزایش موجودی</h3>
               
               <div className="space-y-4">
                  <div className="bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-4 flex flex-col items-center">
                     <span className="text-xs text-gray-500 dark:text-gray-400 mb-2">مبلغ مورد نظر را وارد کنید</span>
                     <div className="flex items-center gap-2 w-full justify-center">
                        <input 
                           type="text" 
                           inputMode="numeric"
                           className="bg-transparent text-3xl font-black text-center outline-none w-full text-gray-800 dark:text-white placeholder:text-gray-300"
                           placeholder="0"
                           value={topUpAmount}
                           onChange={handleAmountChange}
                           autoFocus
                        />
                        <span className="text-sm font-bold text-gray-600 dark:text-gray-400 whitespace-nowrap">تومان</span>
                     </div>
                     {topUpAmount && (
                        <span className="text-xs text-blue-700 dark:text-blue-300 font-bold mt-2">{amountToPersianWordsToman(topUpAmount)}</span>
                     )}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                     {['10,000', '20,000', '50,000'].map(amt => (
                        <button 
                           key={amt}
                           onClick={() => setTopUpAmount(amt)}
                           className="bg-gray-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 border border-gray-200 dark:border-slate-700 rounded-xl py-2 text-xs font-bold text-gray-600 dark:text-gray-300 transition-colors"
                        >
                           {amt}
                        </button>
                     ))}
                  </div>

                  <button 
                     onClick={handleTopUpSubmit}
                     disabled={!topUpAmount || loadingTopup || topupPolling}
                     className="w-full bg-vira-primary text-white py-4 rounded-xl font-bold shadow-lg shadow-vira-accent/50 dark:shadow-none active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 mt-4 flex items-center justify-center gap-2"
                  >
                     {loadingTopup || topupPolling ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                     ) : (
                        <>
                           <Icons.CreditCard size={20} />
                           پرداخت آنلاین
                        </>
                     )}
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default WalletView;
