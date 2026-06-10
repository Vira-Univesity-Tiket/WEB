
import React from 'react';

interface CarMarkerIconProps {
  size?: number;
  color?: string;
  rotate?: number;
  className?: string;
}

const CarMarkerIcon: React.FC<CarMarkerIconProps> = ({
  size = 32,
  color = '#64748b', // Slate-500 default stroke
  rotate = 0,
  className = ''
}) => {
  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        transform: `rotate(${rotate}deg)`,
        transition: 'transform 0.3s ease-in-out', // Smooth rotation animation
        transformOrigin: 'center center'
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ filter: 'drop-shadow(0px 2px 2px rgba(0,0,0,0.2))' }}
      >
        {/* Car Body - Top Down View Pointing Up (North) */}
        <path
          d="M14.5 4.5L16 10V18C16 19.65 14.65 21 13 21H11C9.35 21 8 19.65 8 18V10L9.5 4.5C9.8 3.6 10.6 3 11.5 3H12.5C13.4 3 14.2 3.6 14.5 4.5Z"
          fill="white"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Windshield Line */}
        <path
          d="M8.5 10H15.5"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Rear Window Detail */}
        <path
          d="M10 17H14"
          stroke={color}
          strokeWidth="1.5"
          strokeOpacity="0.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

export default CarMarkerIcon;
