import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeImageProps {
  value: string;
  size?: number;
  className?: string;
}

const QrCodeImage: React.FC<QrCodeImageProps> = ({ value, size = 180, className = '' }) => {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let isMounted = true;

    QRCode.toDataURL(value || 'EMPTY', {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M'
    })
      .then((dataUrl) => {
        if (isMounted) setSrc(dataUrl);
      })
      .catch(() => {
        if (isMounted) setSrc('');
      });

    return () => {
      isMounted = false;
    };
  }, [size, value]);

  if (!src) {
    return <div className={`bg-gray-200 ${className}`} style={{ width: size, height: size }} />;
  }

  return <img src={src} alt="Ticket QR" className={className} width={size} height={size} />;
};

export default QrCodeImage;
