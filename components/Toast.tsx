
import React, { useEffect, useState, useRef } from 'react';
import { Icons } from './Icons';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
  onClose: () => void;
  duration?: number;
}

const Toast: React.FC<ToastProps> = ({ message, type, visible, onClose, duration = 3000 }) => {
  const [show, setShow] = useState(false);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (visible) {
      setShow(true);
      let fadeTimer: ReturnType<typeof setTimeout>;
      const timer = setTimeout(() => {
        setShow(false);
        // Wait for animation to finish before calling onClose
        fadeTimer = setTimeout(() => closeRef.current(), 300);
      }, duration);
      return () => { clearTimeout(timer); clearTimeout(fadeTimer); };
    } else {
      setShow(false);
    }
  }, [visible, message, type, duration]);

  if (!visible && !show) return null;

  const getStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-700 text-white shadow-green-200/50';
      case 'error':
        return 'bg-red-700 text-white shadow-red-200/50';
      default:
        return 'bg-gray-800 text-white shadow-gray-200/50';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success': return <Icons.CheckCircle size={20} />;
      case 'error': return <Icons.AlertCircle size={20} />;
      default: return <Icons.Info size={20} />;
    }
  };

  return (
    <div 
      className={`fixed top-4 left-0 right-0 z-[100] flex justify-center px-4 transition-all duration-300 ease-in-out pointer-events-none ${
        show ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
    >
      <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg min-w-[280px] max-w-sm ${getStyles()}`}>
        <div className="shrink-0">
            {getIcon()}
        </div>
        <p role={type === 'error' ? 'alert' : 'status'} aria-live={type === 'error' ? 'assertive' : 'polite'} className="text-sm font-bold flex-1 text-right">{message}</p>
      </div>
    </div>
  );
};

export default Toast;
