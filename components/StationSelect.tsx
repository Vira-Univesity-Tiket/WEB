import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Station } from '../types';
import { Icons } from './Icons';
import { useDialogFocus } from '../hooks/useDialogFocus';

interface StationSelectProps {
  label: string;
  placeholder: string;
  value: string;
  stations: Station[];
  disabled?: boolean;
  error?: string;
  onChange: (stationId: string) => void;
}

const isMobileQuery = () => (typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)').matches : false);
const STATION_SELECT_OPEN_EVENT = 'vira:station-select-open';

const StationSelect: React.FC<StationSelectProps> = ({
  label,
  placeholder,
  value,
  stations,
  disabled,
  error,
  onChange
}) => {
  const [open, setOpen] = useState(false);
  const panelRef = useDialogFocus(open, () => setOpen(false), 'dialog');
  const [query, setQuery] = useState('');
  const [isMobile, setIsMobile] = useState(isMobileQuery());
  const [portalReady, setPortalReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const instanceIdRef = useRef(`station-select-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 640px)');
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open) return;
      if (isMobile) return;
      const target = e.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, isMobile]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ id?: string }>;
      if (custom?.detail?.id !== instanceIdRef.current) setOpen(false);
    };
    window.addEventListener(STATION_SELECT_OPEN_EVENT, handler as EventListener);
    return () => window.removeEventListener(STATION_SELECT_OPEN_EVENT, handler as EventListener);
  }, []);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const activeStations = useMemo(
    () => stations.filter((s) => s.isActive !== false),
    [stations]
  );

  const selected = useMemo(
    () => activeStations.find((s) => s.id === value) || null,
    [activeStations, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeStations;
    return activeStations.filter((s) => s.name.toLowerCase().includes(q));
  }, [activeStations, query]);

  const select = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  const activateOption = (id: string) => {
    select(id);
  };

  const Button = (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        window.dispatchEvent(new CustomEvent(STATION_SELECT_OPEN_EVENT, { detail: { id: instanceIdRef.current } }));
        setOpen((v) => !v);
      }}
      className={[
        'w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-3 text-sm transition-colors',
        'bg-gray-50 dark:bg-slate-800',
        error ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-slate-700',
        disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-100 dark:hover:bg-slate-700'
      ].join(' ')}
      id={instanceIdRef.current} aria-label={label} aria-haspopup="dialog"
      aria-expanded={open}
    >
      <span className={selected ? 'font-bold text-gray-800 dark:text-white' : 'text-gray-600 dark:text-gray-400 dark:text-gray-400'}>
        {selected ? selected.name : placeholder}
      </span>
      <span className="flex items-center gap-2 shrink-0 text-gray-600 dark:text-gray-400">
        {selected && <span className="text-[10px] px-2 py-1 rounded-lg bg-vira-light text-vira-primary dark:bg-blue-900/20 dark:text-blue-300">انتخاب‌شده</span>}
        <Icons.ChevronDown size={16} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </span>
    </button>
  );

  const Panel = (
    <div
      className={[
        isMobile
          ? 'fixed inset-0 z-[80] flex items-end'
          : 'absolute z-50 mt-2 w-full'
      ].join(' ')}
      role="presentation"
    >
      {isMobile && (
        <button
          type="button"
          aria-label="بستن لیست ایستگاه"
          className="absolute inset-0 z-0 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}
      <div
        className={[
          'w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-2xl relative',
          isMobile ? 'z-10 rounded-t-3xl p-4 max-h-[85vh] overflow-hidden' : 'rounded-2xl p-3'
        ].join(' ')}
        ref={panelRef} role="dialog"
        aria-label={label}
        aria-modal={isMobile ? 'true' : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isMobile && <div className="w-10 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full mx-auto mb-3" />}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-vira-light dark:bg-slate-800 flex items-center justify-center text-vira-primary dark:text-blue-400">
            <Icons.MapPin size={18} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-black text-gray-800 dark:text-white">{label}</div>
            <div className="text-[11px] text-gray-600 dark:text-gray-400">ایستگاه را انتخاب کنید؛ جست‌وجو اختیاری است.</div>
          </div>
          {isMobile && (
            <button
              type="button"
              aria-label="بستن فهرست ایستگاه‌ها" onClick={() => setOpen(false)}
              className="p-2 rounded-full bg-gray-50 dark:bg-slate-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700"
            >
              <Icons.X size={18} />
            </button>
          )}
        </div>

        <div className="relative mb-3">
          <input
            aria-label={`جستجوی ${label}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی ایستگاه..."
            className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-10 py-2.5 text-sm outline-none focus:border-vira-primary"
          />
          <Icons.Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 dark:text-gray-400" />
        </div>

        <div className={isMobile ? 'max-h-[55vh] overflow-y-auto pb-2' : 'max-h-64 overflow-y-auto'}>
          {filtered.length === 0 && (
            <div className="text-center text-gray-600 dark:text-gray-400 text-sm py-8">ایستگاهی یافت نشد</div>
          )}
          <div role="listbox" aria-label={label} className="space-y-2">
            {filtered.map((s) => {
              const isSelected = s.id === value;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  onClick={() => activateOption(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      activateOption(s.id);
                    }
                  }}
                  className={[
                    'w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl border text-right transition-colors cursor-pointer touch-manipulation',
                    isSelected
                      ? 'border-vira-primary bg-vira-light text-vira-primary dark:bg-blue-900/20 dark:text-blue-300'
                      : 'border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-gray-200'
                  ].join(' ')}
                >
                  <span className={(isSelected ? 'font-black' : 'font-bold') + ' pointer-events-none'}>{s.name}</span>
                  {isSelected ? (
                    <span className="w-8 h-8 rounded-full bg-vira-primary text-white flex items-center justify-center shrink-0 pointer-events-none">
                      <Icons.CheckCircle size={18} />
                    </span>
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 flex items-center justify-center shrink-0 pointer-events-none">
                      <Icons.ArrowRight size={16} className="rotate-180" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      <label htmlFor={instanceIdRef.current} className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 block">{label}</label>
      {Button}
      {error && <div className="text-xs text-red-700 dark:text-red-300 mt-1">{error}</div>}
      {open && (isMobile ? (portalReady ? createPortal(Panel, document.body) : null) : Panel)}
    </div>
  );
};

export default StationSelect;
