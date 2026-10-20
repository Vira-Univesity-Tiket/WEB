import { useEffect, useRef } from 'react';

export const useDialogFocus = (open: boolean, onClose: () => void, initialFocus: 'first' | 'dialog' = 'first') => {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
    ) || []).filter(element => element.getClientRects().length > 0);
    (initialFocus === 'dialog' ? dialog : focusable()[0] || dialog)?.focus({ preventScroll: true });
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0]; const last = items[items.length - 1];
      if (!first) { event.preventDefault(); dialog?.focus(); return; }
      const active = document.activeElement;
      if (event.shiftKey && (active === dialog || active === first || !dialog?.contains(active))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (active === dialog || active === last || !dialog?.contains(active))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, [open, initialFocus]);
  return ref;
};
