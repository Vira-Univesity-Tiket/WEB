import React, { useMemo, useRef, useState } from 'react';
import { Icons } from './Icons';

export type AnalyticsChartKind = 'pie' | 'line' | 'technical';

export interface AnalyticsPoint {
  label: string;
  value: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

export interface AnalyticsChart {
  id: string;
  title: string;
  kind: AnalyticsChartKind;
  points: AnalyticsPoint[];
}

interface AdminAnalyticsPanelProps {
  sectionLabel: string;
  charts: AnalyticsChart[];
  updatedAt: string;
  allowExport?: boolean;
}

interface ChartTooltip {
  chartId: string;
  x: number;
  y: number;
  title: string;
  value: number;
  detail?: string;
}

const CHART_COLORS = ['#0F766E', '#0284C7', '#6366F1', '#F97316', '#EF4444', '#14B8A6', '#22C55E', '#A855F7'];
const MAX_VISIBLE_POINTS = 12;
const SVG_WIDTH = 800;
const SVG_HEIGHT = 400;
const PERSIAN_FONT_STACK = '"IRANSans", "Vazirmatn", "Segoe UI", Tahoma, sans-serif';

const sanitizeFileName = (value: string) => String(value || 'chart').replace(/[^\w\-]+/g, '_');

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const toCsvLine = (cells: Array<string | number>) => cells.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',');

const describeArcPath = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
};

const toFaNum = (value: number) => Math.round(Number(value || 0)).toLocaleString('fa-IR');

const compactLabel = (value: string, max = 12) => {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
};

const asFinitePoints = (points: AnalyticsPoint[]) =>
  (Array.isArray(points) ? points : [])
    .map((point) => ({ ...point, value: Number(point.value || 0) }))
    .filter((point) => Number.isFinite(point.value));

const withVisibleSampling = (points: AnalyticsPoint[], maxVisible = MAX_VISIBLE_POINTS) => {
  if (points.length <= maxVisible) return points;
  const step = Math.max(1, Math.ceil(points.length / maxVisible));
  const sampled = points.filter((_point, index) => index % step === 0);
  const last = points[points.length - 1];
  if (!sampled.length || sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
};

const AdminAnalyticsPanel: React.FC<AdminAnalyticsPanelProps> = ({ sectionLabel, charts, updatedAt, allowExport = true }) => {
  const svgRefs = useRef<Record<string, SVGSVGElement | null>>({});
  const [tooltip, setTooltip] = useState<ChartTooltip | null>(null);

  const validCharts = useMemo(
    () =>
      charts
        .map((chart) => ({
          ...chart,
          points: asFinitePoints(chart.points)
        }))
        .filter((chart) => chart.points.length > 0 && chart.points.some((p) => Number(p.value) > 0)),
    [charts]
  );

  const uniqueCharts = useMemo(() => {
    const seen = new Set<string>();
    return validCharts.filter((chart) => {
      const signature = JSON.stringify({
        kind: chart.kind,
        title: chart.title,
        points: chart.points.map((point) => [point.label, Number(point.value || 0)])
      });
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }, [validCharts]);

  const chartViews = useMemo(
    () =>
      uniqueCharts.map((chart) => ({
        ...chart,
        visiblePoints: chart.kind === 'pie' ? chart.points : withVisibleSampling(chart.points),
        total: chart.points.reduce((sum, point) => sum + Math.max(0, Number(point.value || 0)), 0),
        peak: Math.max(...chart.points.map((point) => Number(point.value || 0)), 0)
      })),
    [uniqueCharts]
  );

  const exportChartCsv = (chart: AnalyticsChart) => {
    if (!chart.points.length) return;
    const rows: string[] = [];
    if (chart.kind === 'technical') {
      rows.push(toCsvLine(['Label', 'Open', 'High', 'Low', 'Close', 'Value']));
      chart.points.forEach((p) => {
        const close = Number(p.close ?? p.value ?? 0);
        const open = Number(p.open ?? close);
        const high = Number(p.high ?? Math.max(open, close));
        const low = Number(p.low ?? Math.min(open, close));
        rows.push(toCsvLine([p.label, open, high, low, close, Number(p.value || 0)]));
      });
    } else {
      rows.push(toCsvLine(['Label', 'Value']));
      chart.points.forEach((p) => rows.push(toCsvLine([p.label, Number(p.value || 0)])));
    }
    const csv = `\uFEFF${rows.join('\n')}`;
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${sanitizeFileName(sectionLabel)}_${sanitizeFileName(chart.title)}.csv`);
  };

  const exportAllChartsCsv = () => {
    if (!uniqueCharts.length) return;
    const lines: string[] = [];
    lines.push(toCsvLine([`Section: ${sectionLabel}`]));
    lines.push(toCsvLine([`Exported At: ${updatedAt}`]));
    lines.push('');
    uniqueCharts.forEach((chart) => {
      lines.push(toCsvLine([chart.title, chart.kind]));
      if (chart.kind === 'technical') {
        lines.push(toCsvLine(['Label', 'Open', 'High', 'Low', 'Close', 'Value']));
        chart.points.forEach((p) => {
          const close = Number(p.close ?? p.value ?? 0);
          const open = Number(p.open ?? close);
          const high = Number(p.high ?? Math.max(open, close));
          const low = Number(p.low ?? Math.min(open, close));
          lines.push(toCsvLine([p.label, open, high, low, close, Number(p.value || 0)]));
        });
      } else {
        lines.push(toCsvLine(['Label', 'Value']));
        chart.points.forEach((p) => lines.push(toCsvLine([p.label, Number(p.value || 0)])));
      }
      lines.push('');
    });
    const csv = `\uFEFF${lines.join('\n')}`;
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${sanitizeFileName(sectionLabel)}_all_charts.csv`);
  };

  const exportChartPng = async (chart: AnalyticsChart) => {
    const svg = svgRefs.current[chart.id];
    if (!svg) return;
    const viewBox = svg.viewBox.baseVal;
    const width = Math.max(1, Math.round(viewBox?.width || svg.clientWidth || SVG_WIDTH));
    const height = Math.max(1, Math.round(viewBox?.height || svg.clientHeight || SVG_HEIGHT));
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = width * 2;
            canvas.height = height * 2;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('canvas_not_supported'));
              return;
            }
            ctx.scale(2, 2);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((pngBlob) => {
              if (!pngBlob) {
                reject(new Error('png_export_failed'));
                return;
              }
              downloadBlob(pngBlob, `${sanitizeFileName(sectionLabel)}_${sanitizeFileName(chart.title)}.png`);
              resolve();
            }, 'image/png');
          } catch (error) {
            reject(error as Error);
          }
        };
        img.onerror = () => reject(new Error('image_load_failed'));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const exportAllChartsPng = async () => {
    for (const chart of uniqueCharts) {
      await exportChartPng(chart);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  };

  const showTooltip = (
    event: React.MouseEvent<SVGCircleElement | SVGRectElement | SVGPathElement>,
    chartId: string,
    title: string,
    value: number,
    detail?: string
  ) => {
    const container = (event.currentTarget as Element).closest('[data-chart-surface]');
    if (!container) return;
    const rect = (container as HTMLElement).getBoundingClientRect();
    const x = Math.min(Math.max(16, event.clientX - rect.left), Math.max(16, rect.width - 16));
    const y = Math.min(Math.max(16, event.clientY - rect.top), Math.max(16, rect.height - 16));
    setTooltip({ chartId, x, y, title, value, detail });
  };

  const renderTooltip = (chartId: string) => {
    if (!tooltip || tooltip.chartId !== chartId) return null;
    return (
      <div
        className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-2xl border border-gray-200 bg-white/96 px-4 py-3 text-base shadow-xl backdrop-blur"
        style={{ left: tooltip.x, top: tooltip.y - 6, fontFamily: PERSIAN_FONT_STACK }}
      >
        <div className="font-black text-gray-900 text-lg">{tooltip.title}</div>
        <div className="text-gray-700 text-lg mt-0.5">{toFaNum(tooltip.value)}</div>
        {tooltip.detail ? <div className="text-gray-500 mt-1 text-sm font-bold">{tooltip.detail}</div> : null}
      </div>
    );
  };

  const renderLegend = (points: AnalyticsPoint[]) => {
    if (!points.length) return null;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        {points.slice(0, 8).map((point, index) => (
        <div key={`${point.label}-${index}`} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5 text-lg border border-gray-100">
          <div className="inline-flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
            <span className="text-gray-700 truncate">{point.label}</span>
          </div>
          <span className="font-black text-gray-900 text-base">{toFaNum(point.value)}</span>
        </div>
      ))}
      </div>
    );
  };

  const renderPieChart = (chart: AnalyticsChart, points: AnalyticsPoint[]) => {
    const width = SVG_WIDTH;
    const height = SVG_HEIGHT;
    const cx = width / 2;
    const cy = 144;
    const radius = 106;
    const total = points.reduce((sum, point) => sum + Math.max(0, Number(point.value || 0)), 0);
    let cursor = -Math.PI / 2;

    return (
        <svg
        ref={(el) => {
          svgRefs.current[chart.id] = el;
        }}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[420px]"
        style={{ fontFamily: PERSIAN_FONT_STACK }}
      >
        <defs>
          <filter id={`shadow-${chart.id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#0f172a" floodOpacity="0.08" />
          </filter>
        </defs>
        <rect x="0" y="0" width={width} height={height} fill="#ffffff" rx="18" />
        {total > 0
          ? points.map((point, index) => {
              const value = Math.max(0, Number(point.value || 0));
              const span = (value / total) * Math.PI * 2;
              const start = cursor;
              const end = cursor + span;
              cursor = end;
              if (!span) return null;
              return (
                <path
                  key={`${point.label}-${index}`}
                  d={describeArcPath(cx, cy, radius, start, end)}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                  filter={`url(#shadow-${chart.id})`}
                  onMouseMove={(event) => showTooltip(event, chart.id, point.label, value, `${Math.round((value / total) * 100)}٪`)}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })
          : null}
        <circle cx={cx} cy={cy} r="72" fill="#ffffff" stroke="#E2E8F0" strokeWidth="1" />
        <text x={cx} y={cy - 10} textAnchor="middle" fontSize="22" fill="#64748B" fontWeight="800">
          مجموع
        </text>
        <text x={cx} y={cy + 36} textAnchor="middle" fontSize="50" fill="#0F172A" fontWeight="900">
          {toFaNum(total)}
        </text>
      </svg>
    );
  };

  const renderLineChart = (chart: AnalyticsChart, points: AnalyticsPoint[]) => {
    const width = SVG_WIDTH;
    const height = SVG_HEIGHT;
    const padding = { top: 28, right: 24, bottom: 62, left: 60 };
    const maxValue = Math.max(1, ...points.map((point) => Number(point.value || 0)));
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const stepX = points.length > 1 ? innerWidth / (points.length - 1) : innerWidth;

    const plot = points.map((point, index) => {
      const x = padding.left + index * stepX;
      const y = padding.top + innerHeight - (Math.max(0, Number(point.value || 0)) / maxValue) * innerHeight;
      return { ...point, x, y };
    });

    const pathLine = plot.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    const areaPath = `${pathLine} L ${padding.left + innerWidth} ${padding.top + innerHeight} L ${padding.left} ${padding.top + innerHeight} Z`;
    const visibleLabelEvery = Math.max(1, Math.ceil(points.length / 6));

    return (
      <svg
        ref={(el) => {
          svgRefs.current[chart.id] = el;
        }}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[420px]"
        style={{ fontFamily: PERSIAN_FONT_STACK }}
      >
        <defs>
          <linearGradient id={`line-fill-${chart.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={width} height={height} fill="#ffffff" rx="18" />
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const y = padding.top + innerHeight - step * innerHeight;
          const label = Math.round(maxValue * step);
          return (
            <g key={`grid-${step}`}>
              <line x1={padding.left} y1={y} x2={padding.left + innerWidth} y2={y} stroke="#EEF2F7" />
              <text x={padding.left - 10} y={y + 5} textAnchor="end" fontSize="18" fill="#64748B" fontWeight="700">
                {toFaNum(label)}
              </text>
            </g>
          );
        })}
        <path d={areaPath} fill={`url(#line-fill-${chart.id})`} />
        <path d={pathLine} fill="none" stroke="#0284C7" strokeWidth="3" strokeLinecap="round" />
        {plot.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r="5"
              fill="#ffffff"
              stroke="#0284C7"
              strokeWidth="2"
              onMouseMove={(event) => showTooltip(event, chart.id, point.label, point.value)}
              onMouseLeave={() => setTooltip(null)}
            />
            {(index % visibleLabelEvery === 0 || index === plot.length - 1) && (
                <text x={point.x} y={padding.top + innerHeight + 30} textAnchor="middle" fontSize="16" fill="#64748B" fontWeight="700">
                  {compactLabel(point.label, 10)}
                </text>
            )}
          </g>
        ))}
      </svg>
    );
  };

  const renderTechnicalChart = (chart: AnalyticsChart, points: AnalyticsPoint[]) => {
    const width = SVG_WIDTH;
    const height = SVG_HEIGHT;
    const padding = { top: 28, right: 24, bottom: 62, left: 60 };
    const candles = points.map((point) => {
      const close = Number(point.close ?? point.value ?? 0);
      const open = Number(point.open ?? close);
      const high = Number(point.high ?? Math.max(open, close));
      const low = Number(point.low ?? Math.min(open, close));
      return { ...point, open, high, low, close };
    });

    const maxValue = Math.max(1, ...candles.map((candle) => candle.high));
    const minValue = Math.min(...candles.map((candle) => candle.low), 0);
    const range = Math.max(1, maxValue - minValue);
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const slotWidth = candles.length > 0 ? innerWidth / candles.length : innerWidth;
    const yScale = (value: number) => padding.top + innerHeight - ((value - minValue) / range) * innerHeight;
    const visibleLabelEvery = Math.max(1, Math.ceil(candles.length / 6));

    return (
      <svg
        ref={(el) => {
          svgRefs.current[chart.id] = el;
        }}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[420px]"
        style={{ fontFamily: PERSIAN_FONT_STACK }}
      >
        <rect x="0" y="0" width={width} height={height} fill="#ffffff" rx="18" />
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const value = minValue + step * range;
          const y = yScale(value);
          return (
            <g key={`technical-grid-${step}`}>
              <line x1={padding.left} y1={y} x2={padding.left + innerWidth} y2={y} stroke="#EEF2F7" />
              <text x={padding.left - 10} y={y + 5} textAnchor="end" fontSize="18" fill="#64748B" fontWeight="700">
                {toFaNum(value)}
              </text>
            </g>
          );
        })}
        {candles.map((candle, index) => {
          const x = padding.left + index * slotWidth + slotWidth / 2;
          const bodyW = Math.max(9, slotWidth * 0.48);
          const yOpen = yScale(candle.open);
          const yClose = yScale(candle.close);
          const yHigh = yScale(candle.high);
          const yLow = yScale(candle.low);
          const bodyY = Math.min(yOpen, yClose);
          const bodyH = Math.max(1, Math.abs(yClose - yOpen));
          const gain = candle.close >= candle.open;
          const stroke = gain ? '#16A34A' : '#DC2626';
          const fill = gain ? '#86EFAC' : '#FCA5A5';

          return (
            <g key={`${candle.label}-${index}`}>
              <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={stroke} strokeWidth="2" />
              <rect
                x={x - bodyW / 2}
                y={bodyY}
                width={bodyW}
                height={bodyH}
                fill={fill}
                stroke={stroke}
                rx="2"
                onMouseMove={(event) =>
                  showTooltip(
                    event,
                    chart.id,
                    candle.label,
                    candle.close,
                    `Open ${toFaNum(candle.open)} | High ${toFaNum(candle.high)} | Low ${toFaNum(candle.low)}`
                  )
                }
                onMouseLeave={() => setTooltip(null)}
              />
              {(index % visibleLabelEvery === 0 || index === candles.length - 1) && (
                <text x={x} y={padding.top + innerHeight + 30} textAnchor="middle" fontSize="16" fill="#64748B" fontWeight="700">
                  {compactLabel(candle.label, 10)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <section className="mb-6 rounded-[28px] border border-gray-200 bg-gradient-to-b from-white to-slate-50 p-4 sm:p-5 lg:p-6 shadow-sm" style={{ fontFamily: PERSIAN_FONT_STACK }}>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-2xl sm:text-3xl font-black text-gray-900">{sectionLabel}</h3>
          <div className="mt-1 text-sm sm:text-base text-gray-500 font-bold">آخرین بروزرسانی: {updatedAt}</div>
        </div>
        {allowExport && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportAllChartsPng}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-base font-bold text-blue-700 hover:bg-blue-100"
            >
              <Icons.Camera size={14} />
              خروجی عکس همه
            </button>
            <button
              onClick={exportAllChartsCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-base font-bold text-emerald-700 hover:bg-emerald-100"
            >
              <Icons.Download size={14} />
              خروجی اکسل همه
            </button>
          </div>
        )}
      </div>

      {chartViews.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-base text-gray-500 font-bold">برای این بخش داده کافی جهت نمایش نمودار وجود ندارد.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3 auto-rows-fr">
          {chartViews.map((chart) => {
            const points = chart.visiblePoints;
            return (
              <article key={chart.id} className="h-full rounded-[26px] border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-lg sm:text-xl font-black text-gray-900">{chart.title}</h4>
                    <div className="mt-1 text-sm sm:text-base text-gray-500 font-bold">
                      مجموع: <span className="font-bold text-gray-700">{toFaNum(chart.total)}</span>
                      <span className="mx-1">|</span>
                      بیشینه: <span className="font-bold text-gray-700">{toFaNum(chart.peak)}</span>
                    </div>
                  </div>
                  {allowExport && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => exportChartPng(chart)}
                        className="rounded-xl border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-100"
                        title="خروجی عکس"
                      >
                        <Icons.Camera size={14} />
                      </button>
                      <button
                        onClick={() => exportChartCsv(chart)}
                        className="rounded-xl border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-100"
                        title="خروجی اکسل"
                      >
                        <Icons.Download size={14} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="relative" data-chart-surface>
                  {chart.kind === 'pie' && renderPieChart(chart, points)}
                  {chart.kind === 'line' && renderLineChart(chart, points)}
                  {chart.kind === 'technical' && renderTechnicalChart(chart, points)}
                  {renderTooltip(chart.id)}
                </div>

                {renderLegend(points)}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default AdminAnalyticsPanel;
