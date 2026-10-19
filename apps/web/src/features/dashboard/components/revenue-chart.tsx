// Hourly Revenue & Orders Chart (SVG-based)
import type { HourlyData } from "../types";

interface RevenueChartProps {
  data: HourlyData[];
}

export function RevenueChart({ data }: RevenueChartProps) {
  // Chart area dimensions (matching HTML reference)
  const viewW = 600;
  const viewH = 220;
  const padLeft = 40;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 25;
  const chartW = viewW - padLeft - padRight;
  const chartH = viewH - padTop - padBottom;

  const maxRevenue = Math.max(...data.map((d) => d.revenue));

  // X positions for each data point
  const xPositions = data.map(
    (_, i) => padLeft + (i / (data.length - 1)) * chartW,
  );

  // Y position from revenue value (higher value = lower y)
  function yFromRevenue(value: number) {
    return padTop + (1 - value / maxRevenue) * chartH;
  }

  // Bar heights (orders scaled)
  const maxOrders = Math.max(...data.map((d) => d.orders));
  const barWidth = 22;

  const linePoints = xPositions
    .map((x, i) => `${x},${yFromRevenue(data[i].revenue)}`)
    .join(" ");

  const areaPoints = [
    ...xPositions.map((x, i) => `${x},${yFromRevenue(data[i].revenue)}`),
    `${xPositions[xPositions.length - 1]},${viewH - padBottom}`,
    `${xPositions[0]},${viewH - padBottom}`,
  ].join(" ");

  const gridY = [
    { label: "100M", y: padTop },
    { label: "75M", y: padTop + chartH * 0.25 },
    { label: "50M", y: padTop + chartH * 0.5 },
    { label: "25M", y: padTop + chartH * 0.75 },
  ];

  return (
    <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl p-5 border border-outline-variant/60 shadow-sm flex flex-col justify-between">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="text-headline-md font-headline-md text-on-surface">
            Doanh thu &amp; Lượng đơn theo giờ
          </h3>
          <p className="text-body-sm font-body-sm text-on-surface-variant mt-0.5">
            Phân tích nhịp độ chốt đơn phiên Live từ 18:00 đến 23:00
          </p>
        </div>
        <div className="flex items-center gap-3 text-label-sm font-label-sm">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-primary" />
            <span className="text-on-surface-variant">Doanh thu (triệu ₫)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-secondary-container" />
            <span className="text-on-surface-variant">Số lượng đơn</span>
          </div>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative w-full h-64 mt-2">
        <svg
          viewBox={`0 0 ${viewW} ${viewH}`}
          className="w-full h-full"
          preserveAspectRatio="none"
          aria-label="Biểu đồ doanh thu và lượng đơn theo giờ"
          role="img"
        >
          <defs>
            <linearGradient id="dashboardAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {gridY.map(({ y }) => (
            <line
              key={y}
              x1={padLeft}
              x2={viewW - padRight}
              y1={y}
              y2={y}
              stroke="#E2E8F0"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          ))}
          <line
            x1={padLeft}
            x2={viewW - padRight}
            y1={viewH - padBottom}
            y2={viewH - padBottom}
            stroke="#CBD5E1"
            strokeWidth="1"
          />

          {/* Y-axis labels */}
          {gridY.map(({ label, y }) => (
            <text
              key={label}
              x={padLeft - 8}
              y={y + 4}
              textAnchor="end"
              fill="#94A3B8"
              fontSize="10"
              fontFamily="Inter"
            >
              {label}
            </text>
          ))}

          {/* Bars (orders) */}
          {data.map((d, i) => {
            const barHeight = (d.orders / maxOrders) * chartH;
            const barX = xPositions[i] - barWidth / 2;
            const barY = viewH - padBottom - barHeight;
            return (
              <rect
                key={d.hour}
                x={barX}
                y={barY}
                width={barWidth}
                height={barHeight}
                rx="3"
                fill="#8a4cfc"
                opacity={d.isPeak ? 0.6 : 0.4}
              />
            );
          })}

          {/* Area fill */}
          <polygon fill="url(#dashboardAreaGradient)" points={areaPoints} />

          {/* Revenue line */}
          <polyline
            points={linePoints}
            fill="none"
            stroke="#3525cd"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Node circles */}
          {data.map((d, i) => (
            <circle
              key={d.hour}
              cx={xPositions[i]}
              cy={yFromRevenue(d.revenue)}
              r={d.isPeak ? 6 : 4}
              fill="#3525cd"
              stroke="#ffffff"
              strokeWidth={d.isPeak ? 2.5 : 2}
            />
          ))}

          {/* X-axis labels */}
          {data.map((d, i) => (
            <text
              key={d.hour}
              x={xPositions[i]}
              y={viewH - 8}
              textAnchor="middle"
              fill={d.isPeak ? "#3525cd" : "#64748B"}
              fontSize="11"
              fontFamily="Inter"
              fontWeight={d.isPeak ? "bold" : "normal"}
            >
              {d.label}
            </text>
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-outline-variant/30 text-body-sm font-body-sm text-on-surface-variant">
        <span>
          Phiên cao điểm ghi nhận:{" "}
          <strong className="text-on-surface">364 đơn/giờ</strong> tại khung giờ 20:15
        </span>
        <span className="text-primary font-semibold hover:underline cursor-pointer flex items-center gap-1">
          Xem báo cáo chi tiết{" "}
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </span>
      </div>
    </div>
  );
}
