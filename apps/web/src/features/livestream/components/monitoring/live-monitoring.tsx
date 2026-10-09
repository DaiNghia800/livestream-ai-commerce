"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  FileEdit,
  Layers,
  MessageSquare,
  Package,
  Radio,
} from "lucide-react";
import { getMonitoringContextBySessionId } from "../../mocks/monitoring.mock";
import { MonitoringSessionHeader } from "./monitoring-session-header";
import { MonitoringProductsPanel } from "./monitoring-products-panel";
import { MonitoringChatPanel } from "./monitoring-chat-panel";
import { MonitoringMetrics } from "./monitoring-metrics";
import { MonitoringQueueStatus } from "./monitoring-queue-status";
import { MonitoringInventoryAlerts } from "./monitoring-inventory-alerts";

export interface LiveMonitoringProps {
  livestreamId: string;
}

type MobileTab = "chat" | "products" | "monitoring";

export function LiveMonitoring({ livestreamId }: LiveMonitoringProps) {
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const rightColRef = useRef<HTMLDivElement>(null);

  const context = getMonitoringContextBySessionId(livestreamId);

  // Reset right column scroll to top whenever the session changes
  useEffect(() => {
    if (rightColRef.current) {
      rightColRef.current.scrollTop = 0;
    }
  }, [livestreamId]);

  // 1. Session Not Found State
  if (!context) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-background min-h-[60vh]">
        <div className="max-w-md w-full bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 text-center shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto border border-red-200">
            <AlertCircle className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-headline-md font-bold text-on-surface">
              Phiên livestream không tồn tại
            </h2>
            <p className="text-xs text-on-surface-variant">
              Không tìm thấy mã phiên <strong className="font-mono text-on-surface">{livestreamId}</strong> trong hệ thống. Vui lòng kiểm tra lại đường dẫn.
            </p>
          </div>
          <Link
            href="/shop/livestream"
            className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-primary text-on-primary font-semibold text-xs shadow-sm hover:bg-primary/90 transition"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Quay về danh sách phiên</span>
          </Link>
        </div>
      </div>
    );
  }

  const { status, products, pinnedProduct, messages, metrics, queue, alerts } = context;

  // 2. Draft / Scheduled Non-Live Alert State
  const isDraftOrScheduled = status === "DRAFT" || status === "SCHEDULED";

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col w-full bg-background overflow-hidden">
      {/* Session Header */}
      <MonitoringSessionHeader
        sessionId={context.sessionId}
        sessionTitle={context.title}
        status={context.status}
        duration={context.duration}
        viewers={context.viewers}
        channelName={context.channelName}
      />

      {/* Draft/Scheduled Notification Banner if not LIVE */}
      {isDraftOrScheduled && (
        <div className="bg-blue-50/80 border-b border-blue-200/80 px-4 sm:px-6 py-2 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-blue-900 min-w-0">
            {status === "SCHEDULED" ? (
              <Calendar className="h-4 w-4 text-blue-600 shrink-0" aria-hidden="true" />
            ) : (
              <FileEdit className="h-4 w-4 text-slate-600 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">
              Phiên đang ở trạng thái <strong>{status === "SCHEDULED" ? "Đã lên lịch" : "Bản nháp"}</strong>. Dữ liệu luồng chat realtime và AI worker sẽ bắt đầu ghi nhận khi phát sóng.
            </span>
          </div>
          <Link
            href={`/shop/livestream/${context.sessionId}/studio`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold text-[11px] hover:bg-blue-700 transition shrink-0"
          >
            <Radio className="h-3 w-3" aria-hidden="true" />
            <span>Vào Studio</span>
          </Link>
        </div>
      )}

      {/* Mobile Tab Switcher (< lg) */}
      <div className="lg:hidden flex items-center border-b border-slate-200 bg-white shrink-0 px-2">
        <button
          type="button"
          onClick={() => setMobileTab("chat")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold border-b-2 transition ${
            mobileTab === "chat"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Tin nhắn &amp; AI</span>
          <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.2 rounded-full border border-indigo-100">
            {messages.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab("products")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold border-b-2 transition ${
            mobileTab === "products"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Package className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Sản phẩm</span>
          <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-1.5 py-0.2 rounded-full border border-slate-200">
            {products.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab("monitoring")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold border-b-2 transition ${
            mobileTab === "monitoring"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Giám sát</span>
          {alerts.length > 0 && (
            <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 font-bold px-1.5 py-0.2 rounded-full">
              {alerts.length}
            </span>
          )}
        </button>
      </div>

      {/* Main Content Workspace Canvas */}
      <main className="flex-1 min-h-0 min-w-0 p-3 sm:p-4 bg-slate-50/60 overflow-hidden flex flex-col">
        {/* Desktop View: 3-column Canvas (Stitch ratio 3/5/4) */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-3 sm:gap-4 flex-1 min-h-0 min-w-0">
          {/* Left Column (3 cols): Products Panel */}
          <div className="col-span-3 h-full min-h-0 min-w-0">
            <MonitoringProductsPanel
              products={products}
              pinnedProduct={pinnedProduct}
            />
          </div>

          {/* Center Column (5 cols): Realtime Chat & AI Worker */}
          <div className="col-span-5 h-full min-h-0 min-w-0">
            <MonitoringChatPanel messages={messages} />
          </div>

          {/* Right Column (4 cols): Realtime Metrics, Queue & Inventory Alerts */}
          <div
            ref={rightColRef}
            className="col-span-4 h-full min-h-0 min-w-0 flex flex-col gap-3 sm:gap-4 overflow-y-auto custom-scrollbar pr-1"
          >
            <MonitoringMetrics metrics={metrics} />
            <MonitoringQueueStatus queue={queue} />
            <MonitoringInventoryAlerts alerts={alerts} />
          </div>
        </div>

        {/* Mobile / Tablet Tabbed Content View */}
        <div className="lg:hidden flex-1 min-h-0 min-w-0">
          {mobileTab === "chat" && (
            <div className="h-full min-h-0 min-w-0">
              <MonitoringChatPanel messages={messages} />
            </div>
          )}

          {mobileTab === "products" && (
            <div className="h-full min-h-0 min-w-0">
              <MonitoringProductsPanel
                products={products}
                pinnedProduct={pinnedProduct}
              />
            </div>
          )}

          {mobileTab === "monitoring" && (
            <div className="h-full min-h-0 min-w-0 overflow-y-auto custom-scrollbar space-y-3 pr-1">
              <MonitoringMetrics metrics={metrics} />
              <MonitoringQueueStatus queue={queue} />
              <MonitoringInventoryAlerts alerts={alerts} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
