"use client";

import { useState } from "react";
import { Activity, BarChart2, Users, ShoppingBag } from "lucide-react";
import type { PerformanceChartPoint } from "../../types/report";

interface ReportPerformanceChartProps {
  data: PerformanceChartPoint[];
}

export function ReportPerformanceChart({ data }: ReportPerformanceChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/70 shadow-xs flex flex-col items-center justify-center min-h-[300px] text-center space-y-3">
        <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-on-surface">Chưa có dữ liệu biểu đồ</h3>
          <p className="text-xs text-on-surface-variant mt-1">
            Phiên này chưa ghi nhận số liệu mẫu người xem và tốc độ tạo đơn theo mốc thời gian.
          </p>
        </div>
      </div>
    );
  }

  // Calculate dynamic scales
  const maxCcu = Math.max(...data.map((d) => d.ccu), 100);
  const maxOrderRate = Math.max(...data.map((d) => d.orderRate), 10);

  // Round up max for neat Y-axis steps
  const yCcuMax = Math.ceil(maxCcu / 500) * 500;
  const yOrderMax = Math.ceil(maxOrderRate / 50) * 50;

  // SVG dimensions
  const svgWidth = 800;
  const svgHeight = 280;
  const padLeft = 55;
  const padRight = 55;
  const padTop = 30;
  const padBottom = 40;

  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  const getX = (index: number) => {
    if (data.length <= 1) return padLeft + plotWidth / 2;
    return padLeft + (index / (data.length - 1)) * plotWidth;
  };

  const getY_Ccu = (val: number) => {
    return padTop + plotHeight - (val / yCcuMax) * plotHeight;
  };

  // Build SVG path for CCU Line & Area
  const ccuPoints = data.map((d, i) => `${getX(i)},${getY_Ccu(d.ccu)}`);
  const ccuLinePath = `M ${ccuPoints.join(" L ")}`;
  const ccuAreaPath = `M ${getX(0)},${padTop + plotHeight} L ${ccuPoints.join(" L ")} L ${getX(data.length - 1)},${padTop + plotHeight} Z`;

  // Grid steps (0%, 25%, 50%, 75%, 100%)
  const steps = [0, 0.25, 0.5, 0.75, 1];

  const activePoint = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5 sm:p-6 border border-outline-variant/70 shadow-xs space-y-4">
      {/* Header & Legends */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm sm:text-base font-bold text-on-surface font-headline-md">
              Tương quan Người xem đồng thời (CCU) &amp; Tốc độ tạo đơn
            </h3>
          </div>
          <p className="text-xs text-on-surface-variant">
            Ghi nhận theo chu kỳ mỗi 15 phút trong suốt thời gian phát sóng
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-medium self-start sm:self-auto flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-6 rounded bg-indigo-600 inline-block" />
            <span className="text-on-surface">CCU (Người xem)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-3 rounded-xs bg-emerald-500 inline-block" />
            <span className="text-on-surface">Tốc độ đơn (Đơn/15p)</span>
          </div>
        </div>
      </div>

      {/* Interactive Tooltip Card if point active */}
      <div className="h-10 flex items-center">
        {activePoint ? (
          <div className="flex items-center gap-4 px-3 py-1.5 bg-surface-container-low border border-outline-variant/60 rounded-lg text-xs font-mono w-full justify-between">
            <div className="flex items-center gap-2 text-on-surface font-semibold font-sans">
              <span className="h-2 w-2 rounded-full bg-primary" />
              <span>Thời điểm: {activePoint.time}</span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-indigo-700 flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                <strong>{activePoint.ccu.toLocaleString("vi-VN")}</strong> người xem
              </span>
              <span className="text-emerald-700 flex items-center gap-1">
                <ShoppingBag className="h-3.5 w-3.5" />
                <strong>{activePoint.orderRate.toLocaleString("vi-VN")}</strong> đơn/15p
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-outline italic">
            * Rê chuột hoặc chạm vào các điểm mốc trên biểu đồ để xem chi tiết số liệu thời điểm.
          </p>
        )}
      </div>

      {/* SVG Chart Container */}
      <div className="w-full overflow-x-auto custom-scrollbar">
        <div className="min-w-[640px] w-full">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto select-none"
            role="img"
            aria-label="Biểu đồ tương quan người xem và tốc độ tạo đơn"
          >
            <defs>
              <linearGradient id="ccuGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid Lines & Y-Axis Labels */}
            {steps.map((pct) => {
              const y = padTop + plotHeight - pct * plotHeight;
              const ccuVal = Math.round(pct * yCcuMax);
              const orderVal = Math.round(pct * yOrderMax);

              return (
                <g key={pct}>
                  {/* Grid line */}
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={svgWidth - padRight}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray={pct === 0 ? "none" : "3,3"}
                    strokeWidth={pct === 0 ? 1.5 : 1}
                  />

                  {/* Left Label: CCU */}
                  <text
                    x={padLeft - 8}
                    y={y + 3}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="10"
                    fontFamily="var(--font-inter), sans-serif"
                    fontWeight="500"
                  >
                    {ccuVal >= 1000 ? `${(ccuVal / 1000).toFixed(1)}k` : ccuVal}
                  </text>

                  {/* Right Label: Order Rate */}
                  <text
                    x={svgWidth - padRight + 8}
                    y={y + 3}
                    textAnchor="start"
                    fill="#059669"
                    fontSize="10"
                    fontFamily="var(--font-inter), sans-serif"
                    fontWeight="600"
                  >
                    {orderVal}
                  </text>
                </g>
              );
            })}

            {/* Bars for Order Rate */}
            {data.map((d, idx) => {
              const xCenter = getX(idx);
              const barWidth = 14;
              const barHeight = (d.orderRate / yOrderMax) * plotHeight;
              const barY = padTop + plotHeight - barHeight;

              return (
                <rect
                  key={`bar-${d.time}`}
                  x={xCenter - barWidth / 2}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  rx="3"
                  className={`transition-opacity duration-150 ${
                    hoveredIdx === null || hoveredIdx === idx
                      ? "fill-emerald-500 opacity-80 hover:opacity-100"
                      : "fill-emerald-400 opacity-30"
                  }`}
                />
              );
            })}

            {/* CCU Area Gradient */}
            <path d={ccuAreaPath} fill="url(#ccuGradient)" />

            {/* CCU Line */}
            <path
              d={ccuLinePath}
              fill="none"
              stroke="#4338ca"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* CCU Points & Hover Overlay Columns */}
            {data.map((d, idx) => {
              const cx = getX(idx);
              const cy = getY_Ccu(d.ccu);
              const isHovered = hoveredIdx === idx;

              return (
                <g key={`point-${d.time}`}>
                  {/* Point Circle */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHovered ? "5" : "3.5"}
                    className={`transition-all duration-150 ${
                      isHovered
                        ? "fill-white stroke-indigo-600 stroke-[3]"
                        : "fill-indigo-600 stroke-white stroke-[1.5]"
                    }`}
                  />

                  {/* Active Vertical Guide line */}
                  {isHovered && (
                    <line
                      x1={cx}
                      y1={padTop}
                      x2={cx}
                      y2={padTop + plotHeight}
                      stroke="#4f46e5"
                      strokeWidth="1.5"
                      strokeDasharray="2,2"
                      opacity="0.8"
                    />
                  )}

                  {/* X-Axis Time Label */}
                  <text
                    x={cx}
                    y={svgHeight - 12}
                    textAnchor="middle"
                    fill={isHovered ? "#3525cd" : "#64748b"}
                    fontWeight={isHovered ? "bold" : "500"}
                    fontSize="10"
                    fontFamily="var(--font-inter), sans-serif"
                  >
                    {d.time}
                  </text>

                  {/* Invisible Hitbox for Mouse Events */}
                  <rect
                    x={cx - (plotWidth / (data.length - 1)) / 2}
                    y={padTop}
                    width={plotWidth / (data.length - 1)}
                    height={plotHeight + 30}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
