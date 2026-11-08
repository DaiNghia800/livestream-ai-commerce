"use client";

import { Sparkles, TrendingUp, AlertTriangle, Lightbulb } from "lucide-react";

export interface AiInsightItem {
  id: string;
  type: "golden_hour" | "leakage" | "recommendation";
  title: string;
  highlight: string;
  description: string;
  badge: string;
}

interface ReportAiInsightsProps {
  insights?: AiInsightItem[];
}

const DEFAULT_INSIGHTS: AiInsightItem[] = [
  {
    id: "insight-1",
    type: "golden_hour",
    title: "Khoảnh khắc vàng bùng nổ đơn",
    highlight: "20:30 – 21:00 (Chiếm 62% doanh thu)",
    description:
      "Tốc độ chốt đơn đạt đỉnh 4.8 đơn/phút khi shop kích hoạt deal Flash Sale. Mắt xem đồng thời đạt đỉnh cao nhất phiên.",
    badge: "Đỉnh điểm doanh thu",
  },
  {
    id: "insight-2",
    type: "leakage",
    title: "Cảnh báo thất thoát doanh thu",
    highlight: "24 đơn bị rớt vì Hết tồn kho",
    description:
      "Sản phẩm chủ lực cháy hàng chỉ sau 20 phút mở bán, khiến shop ước tính bỏ lỡ khoảng 6.800.000 đ doanh thu tiềm năng.",
    badge: "Cần khắc phục",
  },
  {
    id: "insight-3",
    type: "recommendation",
    title: "Đề xuất cho phiên phát sóng tới",
    highlight: "Tăng 40% tồn kho mã Best-seller",
    description:
      "Nên chuẩn bị thêm ít nhất 40–50 chiếc cho các mã size M/L và phân bổ deal Flash Sale vào giữa phiên để giữ chân mắt xem lâu hơn.",
    badge: "Chiến lược phiên sau",
  },
];

export function ReportAiInsights({ insights = DEFAULT_INSIGHTS }: ReportAiInsightsProps) {
  const getCardStyle = (type: AiInsightItem["type"]) => {
    switch (type) {
      case "golden_hour":
        return {
          icon: <TrendingUp className="h-4 w-4 text-emerald-600" />,
          bg: "bg-emerald-50/60 border-emerald-200/80 hover:bg-emerald-50",
          badgeBg: "bg-emerald-100 text-emerald-800 border-emerald-300",
        };
      case "leakage":
        return {
          icon: <AlertTriangle className="h-4 w-4 text-rose-600" />,
          bg: "bg-rose-50/60 border-rose-200/80 hover:bg-rose-50",
          badgeBg: "bg-rose-100 text-rose-800 border-rose-300",
        };
      case "recommendation":
      default:
        return {
          icon: <Lightbulb className="h-4 w-4 text-purple-600" />,
          bg: "bg-purple-50/60 border-purple-200/80 hover:bg-purple-50",
          badgeBg: "bg-purple-100 text-purple-800 border-purple-300",
        };
    }
  };

  return (
    <section
      aria-label="Khuyến nghị chiến lược từ Trợ lý AI"
      className="bg-gradient-to-br from-purple-500/5 via-primary/5 to-transparent rounded-2xl p-5 sm:p-6 border border-primary/20 shadow-xs space-y-4"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-on-surface font-headline-md flex items-center gap-2">
              Khuyến Nghị Chiến Lược Từ Trợ Lý AI
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary text-white">
                LiveOrder AI
              </span>
            </h3>
            <p className="text-xs text-on-surface-variant">
              Tự động phân tích từ dữ liệu hành vi người xem và tỷ lệ chốt đơn thực tế của phiên
            </p>
          </div>
        </div>
      </div>

      {/* 3 Insight Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {insights.map((item) => {
          const style = getCardStyle(item.type);
          return (
            <div
              key={item.id}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-2.5 ${style.bg}`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 font-semibold text-xs text-on-surface">
                    {style.icon}
                    <span>{item.title}</span>
                  </div>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${style.badgeBg}`}
                  >
                    {item.badge}
                  </span>
                </div>
                <div className="text-xs sm:text-sm font-bold text-on-surface mb-1">
                  {item.highlight}
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

