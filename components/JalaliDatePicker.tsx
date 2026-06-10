
import React, { useEffect, useRef, useState } from 'react';
import { Icons } from './Icons';
import { JALALI_MONTHS, getJalaliFirstWeekDay, getJalaliMonthLength, toJalaali } from '../utils/jalali';

interface JalaliDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const WEEK_DAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

const JalaliDatePicker: React.FC<JalaliDatePickerProps> = ({ value, onChange, placeholder = 'YYYY/MM/DD', className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calendar View State
  const [viewYear, setViewYear] = useState(1402);
  const [viewMonth, setViewMonth] = useState(1);

  // Initialize view from value or current date
  useEffect(() => {
    if (value && value.length === 10) {
      const parts = value.split('/');
      if (parts.length === 3) {
        setViewYear(parseInt(parts[0]));
        setViewMonth(parseInt(parts[1]));
        return;
      }
    }
    // Default to today
    const now = new Date();
    const j = toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    setViewYear(j.jy);
    setViewMonth(j.jm);
  }, [value, isOpen]); // Reset when opening if needed, or stick to last view

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9/]/g, '');
    if (val.length > 10) val = val.slice(0, 10);
    onChange(val);
  };

  const handleDayClick = (day: number) => {
    const mStr = String(viewMonth).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    onChange(`${viewYear}/${mStr}/${dStr}`);
    setIsOpen(false);
  };

  const changeMonth = (delta: number) => {
    let newM = viewMonth + delta;
    let newY = viewYear;
    if (newM > 12) {
      newM = 1;
      newY++;
    } else if (newM < 1) {
      newM = 12;
      newY--;
    }
    setViewMonth(newM);
    setViewYear(newY);
  };

  // Render Calendar Grid
  const renderCalendar = () => {
    const daysInMonth = getJalaliMonthLength(viewYear, viewMonth);
    const startDayOfWeek = getJalaliFirstWeekDay(viewYear, viewMonth); // 0=Sat, ... 6=Fri

    const days = [];
    // Empty slots for start of month
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="w-8 h-8"></div>);
    }
    // Actual days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${viewYear}/${String(viewMonth).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
      const isSelected = value === dateStr;
      
      days.push(
        <button
          key={d}
          onClick={() => handleDayClick(d)}
          className={`w-8 h-8 text-xs font-bold rounded-full flex items-center justify-center transition-colors ${
            isSelected 
              ? 'bg-blue-600 text-white' 
              : 'text-gray-700 hover:bg-blue-100'
          }`}
        >
          {d}
        </button>
      );
    }

    return days;
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative group">
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          placeholder={placeholder}
          maxLength={10}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm text-center outline-none focus:border-blue-500 dir-ltr font-mono"
          onClick={() => setIsOpen(true)}
        />
        <Icons.Calendar 
          size={18} 
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer hover:text-blue-500 transition-colors"
          onClick={() => setIsOpen(!isOpen)}
        />
      </div>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-4 w-64 animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-100 rounded-full text-gray-600">
              <Icons.ArrowRight size={16} />
            </button>
            <span className="text-sm font-bold text-gray-800">
              {JALALI_MONTHS[viewMonth - 1]} {viewYear}
            </span>
            <button onClick={() => changeMonth(1)} className="p-1 hover:bg-gray-100 rounded-full text-gray-600">
              <Icons.ArrowRight size={16} className="rotate-180" />
            </button>
          </div>

          {/* Week Days */}
          <div className="grid grid-cols-7 gap-1 mb-2 text-center">
            {WEEK_DAYS.map((d, i) => (
              <span key={i} className="text-[10px] text-gray-400 font-bold">{d}</span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 place-items-center">
            {renderCalendar()}
          </div>
          
          <div className="mt-3 pt-3 border-t flex justify-center">
             <button onClick={() => {
                 const now = new Date();
                 const j = toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
                 const dateStr = `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
                 onChange(dateStr);
                 setIsOpen(false);
             }} className="text-xs text-blue-600 font-bold hover:bg-blue-50 px-3 py-1 rounded-lg">
                 برو به امروز
             </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default JalaliDatePicker;
