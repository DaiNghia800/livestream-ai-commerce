"use client";

import { AlertCircle, HelpCircle, Bot } from "lucide-react";
import type { MonitoringChatMessage as MonitoringChatMessageType } from "../../types/monitoring";

export interface MonitoringChatMessageProps {
  message: MonitoringChatMessageType;
}

export function MonitoringChatMessage({ message }: MonitoringChatMessageProps) {
  const { aiIntent, aiExtraction, pendingOrderId } = message;

  // Get initials for avatar
  const initials = message.userName
    ? message.userName
        .split(" ")
        .map((n: string) => n[0])
        .slice(-2)
        .join("")
        .toUpperCase()
    : "KH";

  // Obfuscate phone numbers in comment for privacy protection if any
  const maskedContent = message.content.replace(
    /(0\d{2,3})[\s.-]?(\d{3})[\s.-]?(\d{3,4})/,
    "$1***$3"
  );

  return (
    <div className="p-3 rounded-xl bg-white border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-all space-y-2.5">
      {/* Top row: Customer identity & AI Intent Badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-700 font-bold text-[11px] flex items-center justify-center border border-slate-200 shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <span className="text-xs font-headline-md font-bold text-slate-900 truncate block">
              {message.userName}
            </span>
            <span className="text-[10px] text-slate-400 block leading-none mt-0.5">
              {message.timestamp}
            </span>
          </div>
        </div>

        {/* AI Intent Badge */}
        {aiIntent === "PURCHASE_INTENT" && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
            <Bot className="h-3 w-3 text-indigo-600" aria-hidden="true" />
            <span>Ý định mua hàng</span>
          </span>
        )}

        {aiIntent === "NEEDS_REVIEW" && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
            <AlertCircle className="h-3 w-3 text-amber-600" aria-hidden="true" />
            <span>Cần xử lý</span>
          </span>
        )}

        {(!aiIntent || aiIntent === "INQUIRY_ONLY") && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
            <HelpCircle className="h-3 w-3 text-slate-400" aria-hidden="true" />
            <span>Hỏi đáp / Không phải đơn</span>
          </span>
        )}
      </div>

      {/* Customer Comment Bubble */}
      <p className="text-xs font-normal text-slate-800 bg-slate-50 border border-slate-100 px-3 py-2 rounded-lg leading-relaxed break-words">
        &ldquo;{maskedContent}&rdquo;
      </p>

      {/* AI Extraction & Order Status Card */}
      {aiExtraction ? (
        <div className="p-2.5 rounded-lg bg-indigo-50/40 border border-indigo-100/90 space-y-2">
          {/* AI Header & Stock Check */}
          <div className="flex items-center justify-between gap-1 text-[11px] flex-wrap">
            <span className="text-indigo-900 font-semibold flex items-center gap-1">
              <Bot className="h-3.5 w-3.5 text-indigo-600 shrink-0" aria-hidden="true" />
              <span>
                Gemini AI:{" "}
                {aiIntent === "PURCHASE_INTENT"
                  ? "Phân tích cú pháp hoàn tất"
                  : "Cần kiểm tra dữ liệu"}
              </span>
            </span>

            {aiExtraction.stockStatus === "IN_STOCK" && (
              <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded font-bold">
                Tồn kho: Đủ hàng
              </span>
            )}
            {aiExtraction.stockStatus === "LOW_STOCK" && (
              <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded font-bold">
                Tồn kho: Sắp hết
              </span>
            )}
            {aiExtraction.stockStatus === "OUT_OF_STOCK" && (
              <span className="text-[10px] text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.2 rounded font-bold">
                Tồn kho: Hết hàng
              </span>
            )}
          </div>

          {/* Extracted Attributes Pills */}
          <div className="text-[11px] text-slate-800 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {aiExtraction.productName && (
              <span>
                Sản phẩm:{" "}
                <strong className="text-slate-900 font-bold">
                  {aiExtraction.productName}
                </strong>
                {aiExtraction.productCode && (
                  <span className="text-indigo-600 font-mono ml-1 font-semibold">
                    ({aiExtraction.productCode})
                  </span>
                )}
              </span>
            )}
            {aiExtraction.quantity !== undefined && (
              <span>
                SL: <strong className="font-bold text-slate-900">{aiExtraction.quantity}</strong>
              </span>
            )}
            {aiExtraction.color && (
              <span>
                Màu: <strong className="font-bold text-slate-900">{aiExtraction.color}</strong>
              </span>
            )}
            {aiExtraction.size && (
              <span>
                Size: <strong className="font-bold text-slate-900">{aiExtraction.size}</strong>
              </span>
            )}
            {aiExtraction.reviewReason && (
              <span className="text-amber-800 font-semibold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                Lý do: {aiExtraction.reviewReason}
              </span>
            )}
          </div>

          {/* Pending Order Resolution */}
          <div className="pt-1.5 border-t border-indigo-100 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] text-slate-600 font-medium">Kết quả xử lý:</span>
            {pendingOrderId ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-full shadow-2xs">
                  Đã tạo đơn Pending #{pendingOrderId}
                </span>
                <span className="text-[10px] text-amber-800 font-medium">
                  (Chờ khách xác nhận)
                </span>
              </div>
            ) : aiIntent === "NEEDS_REVIEW" ? (
              <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                Chờ nhân viên hỗ trợ bổ sung thông tin
              </span>
            ) : (
              <span className="text-[10px] text-slate-500 italic">
                Chưa tạo đơn
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 pt-0.5">
          <span className="italic">
            AI không kích hoạt tạo đơn - Không có cú pháp mua hàng
          </span>
          <span className="text-slate-400 text-[10px]">Tự động bỏ qua</span>
        </div>
      )}
    </div>
  );
}
