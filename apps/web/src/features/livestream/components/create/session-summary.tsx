import { Package, Clock, FileText } from "lucide-react";
import type { LiveProductItem } from "../../types/livestream";

interface SessionSummaryProps {
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  products: LiveProductItem[];
}

export function SessionSummary({
  title,
  startDate,
  startTime,
  endDate,
  endTime,
  products,
}: SessionSummaryProps) {
  const formatDate = (isoDate: string) => {
    if (!isoDate) return "";
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y}`;
  };

  const getStartSummary = () => {
    if (!startDate && !startTime) return "Chưa thiết lập";
    const timePart = startTime || "--:--";
    const datePart = startDate ? formatDate(startDate) : "Chưa chọn ngày";
    return `${timePart}, ${datePart}`;
  };

  const getEndSummary = () => {
    if (!endDate && !endTime) return "Chưa thiết lập";
    const timePart = endTime || "--:--";
    const datePart = endDate ? formatDate(endDate) : "Chưa chọn ngày";
    return `${timePart}, ${datePart}`;
  };

  return (
    <section className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-xs">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-on-surface">
        <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
        <span>Tóm tắt phiên</span>
      </h3>

      <div className="space-y-3.5 text-xs">
        {/* 1. Tên phiên */}
        <div className="rounded-lg bg-surface-container-low/50 p-2.5">
          <span className="block font-medium text-outline">Tên phiên</span>
          <p className="mt-0.5 line-clamp-2 font-semibold text-on-surface">
            {title.trim() || <span className="italic text-outline">Chưa thiết lập</span>}
          </p>
        </div>

        {/* 2. Thời gian bắt đầu và kết thúc dự kiến */}
        <div className="flex items-start gap-2.5">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-outline" aria-hidden="true" />
          <div className="flex-1 space-y-1.5">
            <div>
              <span className="block font-medium text-outline">Bắt đầu dự kiến</span>
              <span className="font-semibold text-on-surface">{getStartSummary()}</span>
            </div>
            <div>
              <span className="block font-medium text-outline">Kết thúc dự kiến</span>
              <span className="font-semibold text-on-surface">{getEndSummary()}</span>
            </div>
          </div>
        </div>

        {/* 3. Số sản phẩm đã chọn */}
        <div className="flex items-start gap-2.5">
          <Package className="mt-0.5 h-4 w-4 shrink-0 text-outline" aria-hidden="true" />
          <div>
            <span className="block font-medium text-outline">Số sản phẩm đã chọn</span>
            <span className="font-semibold text-on-surface">
              {products.length > 0 ? (
                `${products.length} sản phẩm`
              ) : (
                <span className="text-outline">0 sản phẩm (Chưa chọn)</span>
              )}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
