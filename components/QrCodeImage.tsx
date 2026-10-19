import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeImageProps {
  value: string;
  size?: number;
  className?: string;
}

const QrCodeImage: React.FC<QrCodeImageProps> = ({ value, size = 180, className = '' }) => {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    setSrc(''); setFailed(false);
    if (!value) { setFailed(true); return; }
    QRCode.toDataURL(value, {
      width: size,
      margin: 4,
      errorCorrectionLevel: 'H'
    })
      .then((dataUrl) => {
        if (isMounted) setSrc(dataUrl);
      })
      .catch(() => {
        if (isMounted) { setSrc(''); setFailed(true); }
      });

    return () => {
      isMounted = false;
    };
  }, [size, value]);

  if (!src) {
    return <div role="status" className={`flex items-center justify-center bg-white text-gray-600 text-center text-sm ${className}`} style={{ width: size, height: size }}>{failed ? 'ساخت QR ناموفق بود؛ از کد دستی استفاده کنید.' : 'در حال ساخت QR…'}</div>;
  }

  return <img src={src} alt="کد QR بلیط برای اسکن راننده" style={{ imageRendering: 'pixelated' }} className={className} width={size} height={size} />;
};

export default QrCodeImage;
