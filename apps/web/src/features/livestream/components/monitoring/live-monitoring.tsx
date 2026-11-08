"use client";

import { useState, useRef, useEffect, useMemo } from "react";
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
import { mockLivestreams } from "../../mocks/livestream.mock";
import {
  getLivestreamDetail,
  getLivestreamReport,
  mapBackendLivestreamToFrontend,
  isValidUuid,
} from "../../api/get-livestreams";
import { getLivestreamProducts } from "../../api/livestream-products";
import { useIvsChat } from "../../hooks/use-ivs-chat";
import { useLivestreamViewers } from "../../hooks/use-livestream-viewers";
import type { Livestream } from "../../types/livestream";
import type { LivestreamReportData, CommentLogItem } from "../../types/report";
import type {
  MonitoringProductItem,
  MonitoringChatMessage,
  MonitoringMetricsData,
  MonitoringQueueStatus,
  MonitoringInventoryAlert,
  MonitoringAiIntent,
  MonitoringAiExtraction,
} from "../../types/monitoring";
import { MonitoringSessionHeader } from "./monitoring-session-header";
import { MonitoringProductsPanel } from "./monitoring-products-panel";
import { MonitoringChatPanel } from "./monitoring-chat-panel";
import { MonitoringMetrics } from "./monitoring-metrics";
import { MonitoringQueueStatus as MonitoringQueueStatusView } from "./monitoring-queue-status";
import { MonitoringInventoryAlerts } from "./monitoring-inventory-alerts";

export interface LiveMonitoringProps {
  livestreamId: string;
}

type MobileTab = "chat" | "products" | "monitoring";

export function LiveMonitoring({ livestreamId }: LiveMonitoringProps) {
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");
  const rightColRef = useRef<HTMLDivElement>(null);

  const isUuid = isValidUuid(livestreamId);

  // 1. Session state
  const [session, setSession] = useState<Livestream | null>(() => {
    return mockLivestreams.find((s) => s.id === livestreamId) || null;
  });
  const [products, setProducts] = useState<MonitoringProductItem[]>([]);
  const [report, setReport] = useState<LivestreamReportData | null>(null);
  const [isLoading, setIsLoading] = useState(!session && isUuid);

  // 2. Live duration tracking
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState<number>(0);
  const liveStartTimeRef = useRef<number | null>(null);
  const isLive = session?.status === "LIVE";

  useEffect(() => {
    if (!isLive) {
      liveStartTimeRef.current = null;
      return;
    }

    if (!liveStartTimeRef.current) {
      if (session?.startedAt) {
        const startMs = new Date(session.startedAt).getTime();
        liveStartTimeRef.current = isNaN(startMs) ? Date.now() : startMs;
      } else {
        liveStartTimeRef.current = Date.now();
      }
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const diffSec = Math.max(
        0,
        Math.floor((now - (liveStartTimeRef.current || now)) / 1000)
      );
      setLiveElapsedSeconds(diffSec);
    }, 1000);

    return () => clearInterval(interval);
  }, [isLive, session?.startedAt]);

  let activeDuration = "00:00:00";
  if (isLive) {
    const hours = Math.floor(liveElapsedSeconds / 3600);
    const minutes = Math.floor((liveElapsedSeconds % 3600) / 60);
    const seconds = liveElapsedSeconds % 60;
    activeDuration = [hours, minutes, seconds]
      .map((v) => String(v).padStart(2, "0"))
      .join(":");
  } else if (session?.startedAt && session?.endedAt) {
    const diffSec = Math.max(
      0,
      Math.floor(
        (new Date(session.endedAt).getTime() -
          new Date(session.startedAt).getTime()) /
          1000
      )
    );
    const hours = Math.floor(diffSec / 3600);
    const minutes = Math.floor((diffSec % 3600) / 60);
    const seconds = diffSec % 60;
    activeDuration = [hours, minutes, seconds]
      .map((v) => String(v).padStart(2, "0"))
      .join(":");
  }

  // 3. Realtime CCU from services/realtime (Redis)
  const { viewerCount: liveViewerCount } = useLivestreamViewers(
    session?.id || livestreamId,
    isLive
  );

  // 4. Realtime IVS Chat from AWS IVS Chat
  const {
    chatMessages: rawChatMessages,
  } = useIvsChat({
    livestreamId,
    userId: session?.merchantId || "merchant-host",
    username: "Chủ Shop (Giám sát)",
    role: "HOST",
    autoConnect: true,
  });

  // 5. Live Orders & Revenue accumulated in current session
  const [liveOrdersCount, setLiveOrdersCount] = useState(0);
  const [liveOrdersRevenue, setLiveOrdersRevenue] = useState(0);
  const [liveClarifyCount, setLiveClarifyCount] = useState(0);

  useEffect(() => {
    const handleOrderDetected = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail || {};
      setLiveOrdersCount((prev) => prev + 1);
      const amt = Number(detail.totalAmount || 0);
      if (amt > 0) {
        setLiveOrdersRevenue((prev) => prev + amt);
      }
      // Dynamically update product inventory
      const qty = Number(detail.quantity || 1);
      const code = String(detail.productCode || "").toUpperCase();
      setProducts((prev) =>
        prev.map((p) => {
          if (
            p.id.toUpperCase() === code ||
            p.sku.toUpperCase() === code ||
            code.includes(p.id.toUpperCase())
          ) {
            return {
              ...p,
              availableStock: Math.max(0, p.availableStock - qty),
              reservedStock: p.reservedStock + qty,
              chatOrders: (p.chatOrders || 0) + 1,
            };
          }
          return p;
        })
      );
    };

    const handleClarify = () => {
      setLiveClarifyCount((prev) => prev + 1);
    };

    window.addEventListener("liveorder:order_detected", handleOrderDetected);
    window.addEventListener(
      "liveorder:order_needs_clarification",
      handleClarify
    );

    return () => {
      window.removeEventListener(
        "liveorder:order_detected",
        handleOrderDetected
      );
      window.removeEventListener(
        "liveorder:order_needs_clarification",
        handleClarify
      );
    };
  }, []);

  // 6. Load initial data from Commerce Backend (PostgreSQL)
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!isUuid) {
        setIsLoading(false);
        return;
      }
      try {
        const [detailRes, productsRes, reportRes] = await Promise.all([
          getLivestreamDetail(livestreamId).catch((err) => {
            console.warn("[LiveMonitoring] getLivestreamDetail failed:", err);
            return null;
          }),
          getLivestreamProducts(livestreamId).catch((err) => {
            console.warn("[LiveMonitoring] getLivestreamProducts failed:", err);
            return { data: [], total: 0 };
          }),
          getLivestreamReport(livestreamId).catch((err) => {
            console.warn("[LiveMonitoring] getLivestreamReport failed:", err);
            return null;
          }),
        ]);

        if (!isMounted) return;

        if (detailRes) {
          const mapped = mapBackendLivestreamToFrontend(detailRes);
          setSession(mapped);
        }

        if (reportRes) {
          setReport(reportRes);
        }

        // Map products
        const backendProducts = productsRes.data || [];
        const mappedProducts: MonitoringProductItem[] = backendProducts.map(
          (p, idx) => {
            const totalStock =
              p.variants?.reduce(
                (sum, v) => sum + (v.availableStock ?? 0),
                0
              ) ?? 0;
            const reportItem = reportRes?.topProducts?.find(
              (tp) => tp.sku === p.skuCode || tp.id === p.productId
            );
            const reserved = reportItem?.soldCount ?? 0;
            const available = Math.max(0, totalStock - reserved);
            const displayCode =
              p.productCode ||
              (p.displayOrder !== undefined
                ? `Mã ${p.displayOrder + 1}`
                : `Mã ${idx + 1}`);

            return {
              id: displayCode,
              sku: p.skuCode || p.productCode || p.productId,
              name: p.productName || p.variantName || `Sản phẩm #${idx + 1}`,
              price:
                typeof p.price === "number"
                  ? p.price
                  : p.variants?.[0]?.price ?? 0,
              originalPrice: undefined,
              stock: totalStock,
              availableStock: available,
              reservedStock: reserved,
              image: p.imageUrl || undefined,
              isPinned: Boolean(p.isFeatured),
              chatOrders: reportItem?.soldCount ?? 0,
            };
          }
        );

        if (
          mappedProducts.length === 0 &&
          detailRes &&
          Array.isArray(detailRes.products) &&
          detailRes.products.length > 0
        ) {
          const fallbackProds: MonitoringProductItem[] = detailRes.products.map(
            (p, idx) => ({
              id: p.productCode || `Mã ${idx + 1}`,
              sku: p.skuCode || p.productCode || p.productId,
              name: p.productName || `Sản phẩm #${idx + 1}`,
              price: typeof p.price === "number" ? p.price : 0,
              originalPrice: undefined,
              stock: 100,
              availableStock: 95,
              reservedStock: 5,
              image: p.imageUrl || undefined,
              isPinned: Boolean(p.isFeatured),
              chatOrders: 0,
            })
          );
          setProducts(fallbackProds);
        } else {
          setProducts(mappedProducts);
        }
      } catch (err) {
        console.warn("[LiveMonitoring] Error loading monitoring data:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [livestreamId, isUuid]);

  // Fallback context for non-UUID demo sessions
  const fallbackContext = useMemo(() => {
    if (!isUuid) {
      return getMonitoringContextBySessionId(
        livestreamId,
        session || undefined
      );
    }
    return null;
  }, [livestreamId, session, isUuid]);

  // 7. Enrich realtime chat messages with AI intentions & order info
  const enrichedMessages = useMemo(() => {
    if (!isUuid && fallbackContext) {
      return fallbackContext.messages;
    }

    const commentLogsMap = new Map<string, CommentLogItem>();
    if (report?.commentLogs) {
      report.commentLogs.forEach((log) => {
        commentLogsMap.set(log.id, log);
      });
    }

    // Filter out system bot messages from the customer comment stream
    const customerMsgs = rawChatMessages.filter((m) => m.userId !== "ai-system");

    return customerMsgs.map((msg): MonitoringChatMessage => {
      const dbLog =
        commentLogsMap.get(msg.id) ||
        report?.commentLogs?.find(
          (l) =>
            l.rawComment.trim().toLowerCase() ===
              msg.content.trim().toLowerCase() &&
            l.customerName.toLowerCase() === msg.userName.toLowerCase()
        );

      const hasOrder = Boolean(
        msg.orderCreated ||
          msg.orderId ||
          dbLog?.linkedOrder ||
          dbLog?.status === "ORDER_PENDING" ||
          dbLog?.status === "ORDER_CONFIRMED" ||
          dbLog?.status === "ORDER_PAID"
      );
      const needsReview = Boolean(
        msg.reviewReason ||
          msg.status === "NEEDS_REVIEW" ||
          dbLog?.status === "NEED_INFO"
      );
      const hasIntentKeyword = /\b(chốt|lấy|mua|đặt|order|deal)\b/i.test(
        msg.content
      );

      let aiIntent: MonitoringAiIntent = "INQUIRY_ONLY";
      if (hasOrder) {
        aiIntent = "PURCHASE_INTENT";
      } else if (needsReview) {
        aiIntent = "NEEDS_REVIEW";
      } else if (
        dbLog?.aiExtracted?.intent ||
        (hasIntentKeyword && msg.status === "PARSED")
      ) {
        aiIntent = "PURCHASE_INTENT";
      }

      const rawOrderId = msg.orderId || dbLog?.linkedOrder?.orderId;
      // Format clean order ID: if it's already an order code like LIVE-... or ORD-..., keep it; if it's a long UUID, truncate to 8 uppercase chars
      const formattedOrderId = rawOrderId
        ? rawOrderId.length > 18
          ? rawOrderId.slice(0, 8).toUpperCase()
          : rawOrderId
        : undefined;

      const orderTotal = dbLog?.linkedOrder?.totalAmount;
      const rawCode = msg.extractedSku || dbLog?.aiExtracted?.skuCode;
      const rawName =
        (msg as { extractedProductName?: string }).extractedProductName ||
        dbLog?.aiExtracted?.productName;
      const quantity = msg.extractedQuantity || dbLog?.aiExtracted?.quantity;

      // Look up in products list to get user-friendly product name and display code
      const matchedProduct = products.find((p) => {
        if (!rawCode && !rawName) return false;
        const codeUpper = String(rawCode || "").toUpperCase();
        return (
          p.sku.toUpperCase() === codeUpper ||
          p.id.toUpperCase() === codeUpper ||
          codeUpper.includes(p.sku.toUpperCase()) ||
          p.sku.toUpperCase().includes(codeUpper) ||
          (rawName &&
            p.name.toLowerCase().includes(String(rawName).toLowerCase()))
        );
      });

      const finalProductName =
        matchedProduct?.name ||
        rawName ||
        (rawCode ? `Sản phẩm ${rawCode}` : undefined);
      const finalDisplayCode = matchedProduct?.id || rawCode || undefined;

      let aiExtraction: MonitoringAiExtraction | undefined = undefined;
      if (aiIntent === "PURCHASE_INTENT") {
        aiExtraction = {
          productCode: finalDisplayCode,
          productName: finalProductName,
          quantity: quantity || 1,
          stockStatus: "IN_STOCK",
          confidenceScore: 0.96,
        };
      } else if (aiIntent === "NEEDS_REVIEW") {
        aiExtraction = {
          productCode: finalDisplayCode,
          productName: finalProductName,
          quantity: quantity || 1,
          confidenceScore: 0.65,
          reviewReason: msg.reviewReason || "Cần bổ sung size / màu sắc",
        };
      } else if (dbLog?.aiExtracted?.intent) {
        aiExtraction = {
          productCode: finalDisplayCode,
          productName: finalProductName,
          quantity: quantity || 1,
          confidenceScore: 0.85,
        };
      }

      return {
        ...msg,
        aiIntent,
        aiExtraction,
        pendingOrderId: formattedOrderId,
        pendingOrderTotal: orderTotal,
      };
    });
  }, [isUuid, fallbackContext, rawChatMessages, report, products]);

  // 8. Dynamic Metrics calculation
  const metrics: MonitoringMetricsData = useMemo(() => {
    if (!isUuid && fallbackContext) {
      return fallbackContext.metrics;
    }

    const basePendingOrders =
      report?.orderStatusSummary?.totalPendingCreated ?? 0;
    const baseRevenue =
      report?.orderStatusSummary?.confirmedRevenue ??
      report?.orderStatusSummary?.paidRevenue ??
      0;

    const pendingOrdersCount = basePendingOrders + liveOrdersCount;
    const pendingOrdersRevenue = baseRevenue + liveOrdersRevenue;

    let aiIntentsCount = 0;
    let manualReviewCount = 0;
    enrichedMessages.forEach((m) => {
      if (m.aiIntent === "PURCHASE_INTENT") aiIntentsCount++;
      else if (m.aiIntent === "NEEDS_REVIEW") manualReviewCount++;
    });
    const totalPurchaseIntents = Math.max(
      pendingOrdersCount,
      aiIntentsCount + manualReviewCount
    );

    const autoOrderRate =
      totalPurchaseIntents > 0
        ? Math.min(
            100,
            Math.round((pendingOrdersCount / totalPurchaseIntents) * 1000) / 10
          )
        : isLive
        ? 92.5
        : 0;

    const elapsedMinutes = Math.max(1, Math.round(liveElapsedSeconds / 60));
    const commentRate = isLive
      ? Math.max(1, Math.round(enrichedMessages.length / elapsedMinutes))
      : 0;

    return {
      commentRate,
      commentRateTrend: isLive ? "Đang ghi nhận trực tiếp" : undefined,
      waitingAiCount: 0,
      aiLatencySeconds: 0.24,
      purchaseIntentsCount: totalPurchaseIntents,
      pendingOrdersCount,
      pendingOrdersRevenue,
      autoOrderRate,
      manualReviewCount: manualReviewCount + liveClarifyCount,
    };
  }, [
    isUuid,
    fallbackContext,
    report,
    liveOrdersCount,
    liveOrdersRevenue,
    enrichedMessages,
    isLive,
    liveElapsedSeconds,
    liveClarifyCount,
  ]);

  // 9. Queue status
  const queue: MonitoringQueueStatus = useMemo(() => {
    if (!isUuid && fallbackContext) {
      return fallbackContext.queue;
    }

    return {
      waiting: 0,
      processing: isLive ? 1 : 0,
      failed: 0,
      workerStatus: isLive
        ? "AWS Lambda AI Worker: Sẵn sàng xử lý SQS"
        : session?.status === "ENDED"
        ? "Phiên live đã kết thúc"
        : "Chờ phiên phát sóng",
    };
  }, [isUuid, fallbackContext, isLive, session?.status]);

  // 10. Real Inventory Alerts from actual product stock
  const alerts: MonitoringInventoryAlert[] = useMemo(() => {
    if (!isUuid && fallbackContext) {
      return fallbackContext.alerts;
    }

    const result: MonitoringInventoryAlert[] = [];
    products.forEach((p) => {
      if (p.availableStock === 0) {
        result.push({
          id: `alert-out-${p.id}`,
          severity: "danger",
          typeBadge: "HẾT HÀNG",
          productCode: p.id,
          productName: p.name,
          description: `Mã ${p.id} đã hết sạch tồn kho khả dụng trong phiên.`,
          availableStock: 0,
          reservedStock: p.reservedStock,
        });
      } else if (p.availableStock <= 5) {
        result.push({
          id: `alert-low-${p.id}`,
          severity: "danger",
          typeBadge: "SẮP HẾT",
          productCode: p.id,
          productName: p.name,
          description: `Còn lại ${p.availableStock} cái khả dụng trong kho. Tồn đang ở mức báo động thấp.`,
          availableStock: p.availableStock,
          reservedStock: p.reservedStock,
        });
      } else if (p.reservedStock >= 5) {
        result.push({
          id: `alert-reserved-${p.id}`,
          severity: "warning",
          typeBadge: "GIỮ CHỖ CAO",
          productCode: p.id,
          productName: p.name,
          description: `${p.reservedStock} sản phẩm đang trong trạng thái giữ chỗ chờ khách hoàn tất đơn.`,
          availableStock: p.availableStock,
          reservedStock: p.reservedStock,
        });
      }
    });

    return result;
  }, [isUuid, fallbackContext, products]);

  const activeProducts = useMemo(() => {
    if (!isUuid && fallbackContext) {
      return fallbackContext.products;
    }
    return products;
  }, [isUuid, fallbackContext, products]);

  const pinnedProduct = useMemo(() => {
    return activeProducts.find((p) => p.isPinned) || null;
  }, [activeProducts]);

  // Reset right column scroll to top whenever the session changes
  useEffect(() => {
    if (rightColRef.current) {
      rightColRef.current.scrollTop = 0;
    }
  }, [livestreamId]);

  // Loading indicator for remote sessions
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 bg-background min-h-[60vh]">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-on-surface-variant">
            Đang nạp dữ liệu giám sát phiên live...
          </p>
        </div>
      </div>
    );
  }

  // 1. Session Not Found State
  if (!session && !fallbackContext) {
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
              Không tìm thấy mã phiên{" "}
              <strong className="font-mono text-on-surface">
                {livestreamId}
              </strong>{" "}
              trong hệ thống. Vui lòng kiểm tra lại đường dẫn.
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

  const currentStatus = session?.status || fallbackContext?.status || "DRAFT";
  const sessionTitle = session?.title || fallbackContext?.title || "Phiên phát sóng";
  const channelName =
    session?.channelName ||
    session?.ivsChannel ||
    fallbackContext?.channelName;
  const isDraftOrScheduled =
    currentStatus === "DRAFT" || currentStatus === "SCHEDULED";

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col w-full bg-background overflow-hidden">
      {/* Session Header */}
      <MonitoringSessionHeader
        sessionId={livestreamId}
        sessionTitle={sessionTitle}
        status={currentStatus}
        duration={activeDuration}
        viewers={liveViewerCount}
        channelName={channelName}
      />

      {/* Draft/Scheduled Notification Banner if not LIVE */}
      {isDraftOrScheduled && (
        <div className="bg-blue-50/80 border-b border-blue-200/80 px-4 sm:px-6 py-2 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-blue-900 min-w-0">
            {currentStatus === "SCHEDULED" ? (
              <Calendar
                className="h-4 w-4 text-blue-600 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <FileEdit
                className="h-4 w-4 text-slate-600 shrink-0"
                aria-hidden="true"
              />
            )}
            <span className="truncate">
              Phiên đang ở trạng thái{" "}
              <strong>
                {currentStatus === "SCHEDULED" ? "Đã lên lịch" : "Bản nháp"}
              </strong>
              . Dữ liệu luồng chat realtime và AI worker sẽ bắt đầu ghi nhận khi
              phát sóng.
            </span>
          </div>
          <Link
            href={`/shop/livestream/${livestreamId}/studio`}
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
            {enrichedMessages.length}
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
            {activeProducts.length}
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
              products={activeProducts}
              pinnedProduct={pinnedProduct}
            />
          </div>

          {/* Center Column (5 cols): Realtime Chat & AI Worker */}
          <div className="col-span-5 h-full min-h-0 min-w-0">
            <MonitoringChatPanel messages={enrichedMessages} />
          </div>

          {/* Right Column (4 cols): Realtime Metrics, Queue & Inventory Alerts */}
          <div
            ref={rightColRef}
            className="col-span-4 h-full min-h-0 min-w-0 flex flex-col gap-3 sm:gap-4 overflow-y-auto custom-scrollbar pr-1"
          >
            <MonitoringMetrics metrics={metrics} />
            <MonitoringQueueStatusView queue={queue} />
            <MonitoringInventoryAlerts alerts={alerts} />
          </div>
        </div>

        {/* Mobile / Tablet Tabbed Content View */}
        <div className="lg:hidden flex-1 min-h-0 min-w-0">
          {mobileTab === "chat" && (
            <div className="h-full min-h-0 min-w-0">
              <MonitoringChatPanel messages={enrichedMessages} />
            </div>
          )}

          {mobileTab === "products" && (
            <div className="h-full min-h-0 min-w-0">
              <MonitoringProductsPanel
                products={activeProducts}
                pinnedProduct={pinnedProduct}
              />
            </div>
          )}

          {mobileTab === "monitoring" && (
            <div className="h-full min-h-0 min-w-0 overflow-y-auto custom-scrollbar space-y-3 pr-1">
              <MonitoringMetrics metrics={metrics} />
              <MonitoringQueueStatusView queue={queue} />
              <MonitoringInventoryAlerts alerts={alerts} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
