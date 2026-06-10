
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

export interface MapVehicle {
  id: string;
  lat: number;
  lng: number;
  rotation: number;
  details?: any;
}

interface MapVisualProps {
  className?: string;
  vehicles?: MapVehicle[];
  onVehicleClick?: (vehicleId: string, details: any) => void;
}

export interface MapRef {
  locateUser: () => void;
  invalidateSize: () => void;
  drawRoute: (start: [number, number], end: [number, number]) => void;
}

interface Point {
  x: number;
  y: number;
}

const PADDING = 20;

const MapVisual = forwardRef<MapRef, MapVisualProps>(({ className = '', vehicles = [], onVehicleClick }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [userPoint, setUserPoint] = useState<[number, number] | null>(null);
  const [route, setRoute] = useState<{ start: [number, number]; end: [number, number] } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.max(1, entry.contentRect.width),
        height: Math.max(1, entry.contentRect.height)
      });
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const allGeoPoints = useMemo(() => {
    const points: [number, number][] = vehicles.map((v) => [v.lat, v.lng]);
    if (userPoint) points.push(userPoint);
    if (route) {
      points.push(route.start);
      points.push(route.end);
    }

    if (!points.length) {
      points.push([35.7113, 51.3911]);
    }

    return points;
  }, [route, userPoint, vehicles]);

  const bounds = useMemo(() => {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    for (const [lat, lng] of allGeoPoints) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    }

    const latPadding = Math.max(0.0008, (maxLat - minLat) * 0.35);
    const lngPadding = Math.max(0.0008, (maxLng - minLng) * 0.35);

    return {
      minLat: minLat - latPadding,
      maxLat: maxLat + latPadding,
      minLng: minLng - lngPadding,
      maxLng: maxLng + lngPadding
    };
  }, [allGeoPoints]);

  const toPoint = (lat: number, lng: number): Point => {
    const width = Math.max(1, size.width - PADDING * 2);
    const height = Math.max(1, size.height - PADDING * 2);

    const xRatio = (lng - bounds.minLng) / Math.max(0.000001, bounds.maxLng - bounds.minLng);
    const yRatio = (lat - bounds.minLat) / Math.max(0.000001, bounds.maxLat - bounds.minLat);

    return {
      x: PADDING + xRatio * width,
      y: size.height - (PADDING + yRatio * height)
    };
  };

  useImperativeHandle(ref, () => ({
    locateUser: () => {
      setUserPoint([35.7113, 51.3911]);
    },
    invalidateSize: () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    },
    drawRoute: (start, end) => {
      setRoute({ start, end });
    }
  }));

  const routeStart = route ? toPoint(route.start[0], route.start[1]) : null;
  const routeEnd = route ? toPoint(route.end[0], route.end[1]) : null;

  return (
    <div ref={containerRef} className={`relative overflow-hidden bg-gradient-to-br from-slate-200 via-slate-100 to-emerald-100 ${className}`}>
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${size.width} ${size.height}`} preserveAspectRatio="none">
        <defs>
          <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(148,163,184,0.2)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={size.width} height={size.height} fill="url(#grid)" />

        {routeStart && routeEnd && (
          <line
            x1={routeStart.x}
            y1={routeStart.y}
            x2={routeEnd.x}
            y2={routeEnd.y}
            stroke="#3674B5"
            strokeWidth="5"
            strokeDasharray="10 10"
            strokeLinecap="round"
          />
        )}
      </svg>

      {userPoint && (() => {
        const p = toPoint(userPoint[0], userPoint[1]);
        return (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-xl"
            style={{ left: p.x, top: p.y }}
          />
        );
      })()}

      {vehicles.map((vehicle) => {
        const p = toPoint(vehicle.lat, vehicle.lng);
        return (
          <button
            key={vehicle.id}
            type="button"
            onClick={() => onVehicleClick?.(vehicle.id, vehicle.details)}
            className="absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white border-2 border-vira-primary text-vira-primary shadow-md flex items-center justify-center"
            style={{ left: p.x, top: p.y, transform: `translate(-50%, -50%) rotate(${vehicle.rotation}deg)` }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L15 8H9L12 2Z" fill="currentColor" />
              <path d="M12 8V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        );
      })}
    </div>
  );
});

export default MapVisual;
