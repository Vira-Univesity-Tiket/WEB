import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Icons } from './Icons';

interface Props { onScan: (value: string) => Promise<void>; onManual: () => void }
interface NativeDetector { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }

const TicketCameraScanner: React.FC<Props> = ({ onScan, onManual }) => {
  const video = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);

  useEffect(() => {
    if (paused || !visible) return;
    let cancelled = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout>;
    let detector: NativeDetector | undefined;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const decode = async () => {
      if (cancelled) return;
      const source = video.current;
      let value = '';
      if (source && source.readyState >= 2 && source.videoWidth && context) {
        if (detector) {
          try { value = (await detector.detect(source))[0]?.rawValue || ''; }
          catch { detector = undefined; }
        }
        if (!detector && !cancelled) {
          const scale = Math.min(1, 720 / source.videoWidth);
          canvas.width = Math.round(source.videoWidth * scale);
          canvas.height = Math.round(source.videoHeight * scale);
          context.drawImage(source, 0, 0, canvas.width, canvas.height);
          const frame = context.getImageData(0, 0, canvas.width, canvas.height);
          value = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'attemptBoth' })?.data || '';
        }
      }
      if (cancelled) return;
      if (value) {
        setPaused(true); setProcessing(true);
        try { await onScanRef.current(value); } finally { setProcessing(false); }
      } else { timer = setTimeout(() => { void decode(); }, 250); }
    };
    const start = async () => {
      setLoading(true); setError('');
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          throw new Error('برای استفاده از دوربین، صفحه را با HTTPS باز کنید یا کد دستی را وارد کنید.');
        }
        const native = (window as unknown as { BarcodeDetector?: { new (options: { formats: string[] }): NativeDetector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
        if (native) {
          try {
            const formats = native.getSupportedFormats ? await native.getSupportedFormats() : ['qr_code'];
            if (formats.includes('qr_code')) detector = new native({ formats: ['qr_code'] });
          } catch { /* Use the bundled decoder when native QR detection is unavailable. */ }
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        if (cancelled) return;
        setLoading(false);
        await decode();
      } catch (cause) {
        stream?.getTracks().forEach(track => track.stop());
        if (cancelled) return;
        const name = (cause as Error).name;
        setError(name === 'NotAllowedError' ? 'دسترسی به دوربین مسدود است. مجوز دوربین را در تنظیمات مرورگر فعال کنید یا کد دستی را وارد کنید.' :
          name === 'NotFoundError' ? 'دوربینی پیدا نشد؛ کد دستی بلیط را وارد کنید.' : (cause as Error).message || 'راه‌اندازی دوربین ناموفق بود؛ دوباره تلاش کنید.');
        setLoading(false);
      }
    };
    void start();
    return () => {
      cancelled = true; clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
      if (video.current) video.current.srcObject = null;
    };
  }, [paused, visible]);

  return <div className="relative w-full h-full flex flex-col">
    <div className="flex-1 relative min-h-0 overflow-hidden bg-black">
      <video ref={video} className="absolute inset-0 w-full h-full object-cover" muted playsInline autoPlay aria-label="دوربین اسکن بلیط" />
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 pointer-events-none">
        {paused ? <div className="text-white text-center space-y-4"><Icons.QrCode size={72} className="mx-auto" /><p>تصویر بلیط خوانده شد</p></div> : <>
        <div className="w-[min(72vw,280px)] aspect-square rounded-3xl border-4 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
        <p className="text-white text-sm mt-6 text-center">QR بلیط را داخل کادر نگه دارید</p></>}
      </div>
      {loading && !paused && <div role="status" className="absolute inset-0 flex items-center justify-center bg-black/70 text-white">راه‌اندازی دوربین…</div>}
      {error && <div role="alert" className="absolute inset-0 flex items-center justify-center bg-black/90 p-8 text-center text-white leading-8">{error}</div>}
    </div>
    <div className="bg-black p-5 pb-[max(24px,env(safe-area-inset-bottom))] space-y-3">
      {paused && <button type="button" disabled={processing} onClick={() => setPaused(false)} className="w-full bg-vira-primary text-white rounded-2xl py-4 font-bold">اسکن بلیط بعدی</button>}
      <button type="button" onClick={onManual} className="w-full border border-white/30 text-white rounded-2xl py-4 flex justify-center gap-2"><Icons.Key size={20} /> ورود کد ۴ رقمی</button>
    </div>
  </div>;
};
export default TicketCameraScanner;
