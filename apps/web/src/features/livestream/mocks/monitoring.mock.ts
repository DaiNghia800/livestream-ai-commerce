import type {
  MonitoringChatMessage,
  MonitoringInventoryAlert,
  MonitoringMetricsData,
  MonitoringProductItem,
  MonitoringQueueStatus,
  MonitoringSessionContext,
} from "../types/monitoring";
import { mockLivestreams } from "./livestream.mock";
import { mockStudioChatMessages } from "./studio.mock";

/**
 * Danh sách tin nhắn phong phú với chi tiết trích xuất AI
 * Đồng bộ với dữ liệu chat hiện có của Broadcast Studio
 */
export const mockMonitoringChatMessages: MonitoringChatMessage[] = mockStudioChatMessages.map(
  (msg) => {
    if (msg.id === "msg-1") {
      return {
        ...msg,
        aiIntent: "PURCHASE_INTENT",
        pendingOrderId: msg.orderId || "ORD-8430",
        pendingOrderTotal: 289000,
        aiExtraction: {
          productCode: "AO01",
          productName: "Áo sơ mi Linen cổ cuban",
          quantity: 1,
          color: "Be",
          size: "M",
          stockStatus: "IN_STOCK",
          confidenceScore: 0.98,
        },
      };
    }
    if (msg.id === "msg-2") {
      return {
        ...msg,
        aiIntent: "PURCHASE_INTENT",
        pendingOrderId: msg.orderId || "ORD-8429",
        pendingOrderTotal: 634000,
        aiExtraction: {
          productCode: "AO01, QJ02",
          productName: "Áo sơ mi Linen + Quần Jean",
          quantity: 2,
          stockStatus: "IN_STOCK",
          confidenceScore: 0.95,
        },
      };
    }
    if (msg.id === "msg-3") {
      return {
        ...msg,
        aiIntent: "NEEDS_REVIEW",
        aiExtraction: {
          productCode: "AO01",
          productName: "Áo sơ mi Linen",
          quantity: 1,
          stockStatus: "IN_STOCK",
          confidenceScore: 0.72,
          reviewReason: "Thiếu phân loại màu",
        },
      };
    }
    if (msg.id === "msg-6") {
      return {
        ...msg,
        aiIntent: "PURCHASE_INTENT",
        pendingOrderId: msg.orderId || "ORD-8428",
        pendingOrderTotal: 798000,
        aiExtraction: {
          productCode: "DS03",
          productName: "Váy đầm Linen dáng suông",
          quantity: 2,
          size: "L",
          stockStatus: "LOW_STOCK",
          confidenceScore: 0.96,
        },
      };
    }
    if (msg.id === "msg-7") {
      return {
        ...msg,
        aiIntent: "NEEDS_REVIEW",
        aiExtraction: {
          confidenceScore: 0.45,
          reviewReason: "Chưa rõ mã SKU & SĐT",
        },
      };
    }
    if (msg.id === "msg-8") {
      return {
        ...msg,
        aiIntent: "INQUIRY_ONLY",
        aiExtraction: {
          productCode: "AO01",
          productName: "Áo sơ mi Linen",
          quantity: 2,
          confidenceScore: 0.88,
        },
      };
    }
    return {
      ...msg,
      aiIntent: "INQUIRY_ONLY",
    };
  },
);

/**
 * Trạng thái hàng đợi SQS xử lý tin nhắn
 */
export const defaultMonitoringQueueStatus: MonitoringQueueStatus = {
  waiting: 4,
  processing: 2,
  failed: 0,
  workerStatus: "Gemini AI Worker: Sẵn sàng xử lý",
};

/**
 * Khởi tạo dữ liệu giám sát tương ứng với từng phiên livestream
 */
export function getMonitoringContextBySessionId(
  livestreamId: string,
): MonitoringSessionContext | null {
  const session = mockLivestreams.find((s) => s.id === livestreamId);
  if (!session) return null;

  // 1. Đồng bộ sản phẩm từ session
  const products: MonitoringProductItem[] = (session.products || []).map((p, idx) => {
    // Phân bổ tồn giữ chỗ hợp lý dựa trên tồn kho thực tế
    const reserved = p.id === "AO01" ? 52 : p.stock < 30 ? Math.min(6, Math.floor(p.stock * 0.3)) : Math.floor(p.stock * 0.25);
    const available = Math.max(0, p.stock - reserved);

    return {
      id: p.id || `P-${idx + 1}`,
      sku: p.sku,
      name: p.name,
      price: p.price,
      originalPrice: p.originalPrice,
      stock: p.stock,
      availableStock: available,
      reservedStock: reserved,
      image: p.image,
      isPinned: Boolean(p.isPinned),
      chatOrders: p.chatOrders || 0,
    };
  });

  const pinnedProduct = products.find((p) => p.isPinned) || null;

  // 2. Cảnh báo tồn kho theo dữ liệu SKU thực tế của phiên
  const alerts: MonitoringInventoryAlert[] = [];
  products.forEach((p) => {
    if (p.availableStock <= 20 && p.availableStock > 0) {
      alerts.push({
        id: `alert-low-${p.id}`,
        severity: "danger",
        typeBadge: "SẮP HẾT",
        productCode: p.id,
        productName: p.name,
        description: `Còn lại ${p.availableStock} cái khả dụng trong kho. Tồn đang ở mức báo động thấp.`,
        availableStock: p.availableStock,
        reservedStock: p.reservedStock,
      });
    } else if (p.reservedStock >= 40) {
      alerts.push({
        id: `alert-reserved-${p.id}`,
        severity: "warning",
        typeBadge: "GIỮ CHỖ CAO",
        productCode: p.id,
        productName: p.name,
        description: `${p.reservedStock} sản phẩm đang trong trạng thái chờ khách xác nhận SĐT qua webhook.`,
        availableStock: p.availableStock,
        reservedStock: p.reservedStock,
      });
    }
  });

  // 3. Chỉ số KPI
  const isLive = session.status === "LIVE";
  const metrics: MonitoringMetricsData = {
    commentRate: session.chatRatePerMinute || (isLive ? 185 : 0),
    commentRateTrend: isLive ? "+24% so với phiên trước" : undefined,
    waitingAiCount: isLive ? 4 : 0,
    aiLatencySeconds: 0.18,
    purchaseIntentsCount: isLive ? 428 : 0,
    pendingOrdersCount: session.aiOrderCount || (isLive ? 392 : 0),
    pendingOrdersRevenue: session.revenue || 78400000,
    autoOrderRate: isLive ? 91.6 : 0,
    manualReviewCount: isLive ? 36 : 0,
  };

  return {
    sessionId: session.id,
    title: session.title,
    status: session.status,
    hostName: session.hostName,
    channelName: session.channelName || session.ivsChannel,
    duration: isLive ? session.subTimeDisplay?.replace("Đã live ", "") || "01:24:45" : undefined,
    viewers: isLive ? session.currentViewers || 2845 : undefined,
    pinnedProduct,
    products,
    messages: mockMonitoringChatMessages,
    metrics,
    queue: isLive ? defaultMonitoringQueueStatus : { waiting: 0, processing: 0, failed: 0, workerStatus: "Chờ phiên phát sóng" },
    alerts,
  };
}
