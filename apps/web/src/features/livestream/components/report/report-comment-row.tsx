import { MessageSquare, Sparkles, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import type { CommentLogItem, CommentProcessingStatus } from "../../types/report";

interface ReportCommentRowProps {
  item: CommentLogItem;
}

export function ReportCommentRow({ item }: ReportCommentRowProps) {
  const getStatusBadge = (status: CommentProcessingStatus) => {
    switch (status) {
      case "ORDER_PAID":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="h-3 w-3" />
            <span>Đã thanh toán</span>
          </span>
        );
      case "ORDER_CONFIRMED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3 w-3" />
            <span>Đã xác nhận</span>
          </span>
        );
      case "ORDER_PENDING":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="h-3 w-3" />
            <span>Đơn Pending</span>
          </span>
        );
      case "NEED_INFO":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <AlertCircle className="h-3 w-3" />
            <span>Cần thêm thông tin</span>
          </span>
        );
      case "OUT_OF_STOCK":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
            <XCircle className="h-3 w-3" />
            <span>Hết tồn kho</span>
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <XCircle className="h-3 w-3" />
            <span>Đã hủy</span>
          </span>
        );
      case "NOT_INTENT":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
            <span>Không phải ý định</span>
          </span>
        );
    }
  };

  return (
    <tr className="border-b border-outline-variant/40 hover:bg-surface-container-low/60 transition-colors text-xs">
      {/* 1. Timestamp */}
      <td className="py-3 px-3.5 font-mono text-outline whitespace-nowrap align-top">
        {item.timestamp}
      </td>

      {/* 2. Customer */}
      <td className="py-3 px-3.5 align-top">
        <div className="space-y-0.5">
          <strong className="text-on-surface font-semibold block">{item.customerName}</strong>
          <span className="text-[11px] font-mono text-on-surface-variant block">
            {item.customerPhoneMasked}
          </span>
        </div>
      </td>

      {/* 3. Raw Comment */}
      <td className="py-3 px-3.5 align-top max-w-xs">
        <div className="flex items-start gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-outline shrink-0 mt-0.5" />
          <p className="text-on-surface leading-relaxed break-words font-medium">
            &ldquo;{item.rawComment}&rdquo;
          </p>
        </div>
      </td>

      {/* 4. AI Extracted */}
      <td className="py-3 px-3.5 align-top">
        {item.aiExtracted.intent ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[11px] text-indigo-700 font-semibold">
              <Sparkles className="h-3 w-3 shrink-0" />
              <span>Ý định mua hàng</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {item.aiExtracted.skuCode && (
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-semibold text-[10px]">
                  SKU: {item.aiExtracted.skuCode}
                </span>
              )}
              {item.aiExtracted.size && (
                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px]">
                  Size {item.aiExtracted.size}
                </span>
              )}
              {item.aiExtracted.color && (
                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px]">
                  Màu {item.aiExtracted.color}
                </span>
              )}
              {item.aiExtracted.quantity && (
                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px]">
                  SL: {item.aiExtracted.quantity}
                </span>
              )}
            </div>
          </div>
        ) : (
          <span className="text-[11px] text-outline italic">Không phát hiện ý định mua</span>
        )}
      </td>

      {/* 5. Linked Order */}
      <td className="py-3 px-3.5 align-top whitespace-nowrap">
        {item.linkedOrder ? (
          <div className="space-y-0.5">
            <span className="font-mono font-bold text-primary block">
              {item.linkedOrder.orderId}
            </span>
            <span className="text-[11px] font-mono text-on-surface block">
              {item.linkedOrder.totalAmount.toLocaleString("vi-VN")} đ
            </span>
            <span className="text-[10px] text-outline font-medium block">
              {item.linkedOrder.paymentMethod} •{" "}
              {item.linkedOrder.paymentStatus === "PAID" ? "Đã TT" : "Chờ TT"}
            </span>
          </div>
        ) : (
          <span className="text-outline text-[11px]">—</span>
        )}
      </td>

      {/* 6. Processing Status */}
      <td className="py-3 px-3.5 align-top whitespace-nowrap">
        <div className="space-y-1">
          {getStatusBadge(item.status)}
          {item.statusNote && (
            <p className="text-[10px] text-outline max-w-[180px] truncate" title={item.statusNote}>
              {item.statusNote}
            </p>
          )}
        </div>
      </td>
    </tr>
  );
}
