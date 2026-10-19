
import React, { useEffect, useState } from 'react';
import { Icons } from './Icons';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface RatingSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => Promise<void>;
}

const RatingSheet: React.FC<RatingSheetProps> = ({ isOpen, onClose, onSubmit }) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const dialog = useDialogFocus(isOpen, onClose);
  useEffect(() => { if (isOpen) { setRating(0); setComment(''); } }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}></div>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="rating-title" tabIndex={-1} className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl p-6 relative z-10 animate-in slide-in-from-bottom duration-300 shadow-2xl">
        <button type="button" aria-label="بستن نظر سفر" onClick={onClose} className="absolute top-3 left-3 p-2 rounded-full bg-gray-100 dark:bg-slate-800"><Icons.X size={18} /></button>
        <div className="w-12 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full mx-auto mb-6"></div>
        
        <div className="text-center mb-6">
           <h3 id="rating-title" className="text-xl font-bold text-gray-800 dark:text-white">سفر چطور بود؟</h3>
           <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">نظر شما به بهبود سرویس دانشگاه کمک می‌کند</p>
        </div>

        {/* Stars */}
        <div className="flex justify-center gap-2 mb-8" dir="ltr">
            {[1, 2, 3, 4, 5].map((star) => (
                <button 
                  key={star}
                  aria-label={`${star} از ۵ ستاره`}
                  aria-pressed={rating === star}
                  onClick={() => setRating(star)}
                  className="transition-transform active:scale-90 focus:outline-none"
                >
                    <Icons.Star 
                       size={42} 
                       className={`${rating >= star ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200 dark:text-slate-700'}`} 
                       strokeWidth={1.5}
                    />
                </button>
            ))}
        </div>

        {/* Comment Area */}
        <div className="mb-6 relative">
            <textarea
               aria-label="نظر سفر" maxLength={2000}
               className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl p-4 min-h-[100px] text-sm text-gray-800 dark:text-white outline-none focus:border-vira-primary focus:ring-1 focus:ring-vira-primary transition-all resize-none"
               placeholder="نظرتان را بنویسید (اختیاری)..."
               value={comment}
               onChange={(e) => setComment(e.target.value)}
            />
        </div>

        <button 
           onClick={async () => { if (submitting) return; setSubmitting(true); try { await onSubmit(rating, comment); } finally { setSubmitting(false); } }}
           disabled={rating === 0 || submitting} aria-busy={submitting}
           className="w-full bg-vira-primary text-white py-4 rounded-xl font-bold shadow-lg shadow-vira-accent/50 dark:shadow-none disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
        >
           ثبت نظر
        </button>
      </div>
    </div>
  );
};

export default RatingSheet;
