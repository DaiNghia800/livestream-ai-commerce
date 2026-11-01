import type { LiveProductItem, LivestreamStatus } from "./livestream";
import type { StudioChatMessage } from "./studio";

/**
 * Sản phẩm trong phiên theo dõi Live Monitoring
 * Bổ sung số lượng tồn giữ chỗ (reservedStock) bên cạnh tồn khả dụng
 */
export interface MonitoringProductItem extends LiveProductItem {
  availableStock: number;
  reservedStock: number;
}

/**
 * Trạng thái phân tích AI cho từng tin nhắn
 */
export type MonitoringAiIntent = "PURCHASE_INTENT" | "NEEDS_REVIEW" | "INQUIRY_ONLY";

/**
 * Chi tiết phân tích nhận diện cú pháp của Gemini AI Worker
 */
export interface MonitoringAiExtraction {
  productCode?: string;
  productName?: string;
  quantity?: number;
  color?: string;
  size?: string;
  stockStatus?: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  confidenceScore?: number;
  reviewReason?: string;
}

/**
 * Tin nhắn trong stream Live Monitoring
 */
export interface MonitoringChatMessage extends StudioChatMessage {
  aiIntent?: MonitoringAiIntent;
  aiExtraction?: MonitoringAiExtraction;
  pendingOrderId?: string;
  pendingOrderTotal?: number;
}

/**
 * Các chỉ số KPI thời gian thực của phiên Live
 */
export interface MonitoringMetricsData {
  commentRate: number; // bình luận / phút
  commentRateTrend?: string; // +24% so với phiên trước
  waitingAiCount: number; // tin nhắn đang chờ xử lý trong queue
  aiLatencySeconds: number; // độ trễ xử lý ước tính (giây)
  purchaseIntentsCount: number; // số lượt ý định mua hàng phát hiện
  pendingOrdersCount: number; // số đơn Pending đã tạo tự động
  pendingOrdersRevenue: number; // tổng giá trị các đơn Pending
  autoOrderRate: number; // tỷ lệ chốt đơn tự động (ví dụ 91.6%)
  manualReviewCount: number; // số đơn cần duyệt tay
}

/**
 * Trạng thái hàng đợi SQS xử lý tin nhắn
 */
export interface MonitoringQueueStatus {
  waiting: number;
  processing: number;
  failed: number;
  workerStatus: string;
}

/**
 * Phân loại cảnh báo tồn kho thời gian thực
 */
export type MonitoringAlertSeverity = "danger" | "warning" | "info";

export interface MonitoringInventoryAlert {
  id: string;
  severity: MonitoringAlertSeverity;
  typeBadge: string; // "SẮP HẾT" | "GIỮ CHỖ CAO" | "HẾT HÀNG"
  productCode: string;
  productName: string;
  description: string;
  availableStock: number;
  reservedStock?: number;
}

/**
 * Trạng thái phiên tổng thể cung cấp cho LiveMonitoring
 */
export interface MonitoringSessionContext {
  sessionId: string;
  title: string;
  status: LivestreamStatus;
  hostName?: string;
  channelName?: string;
  duration?: string;
  viewers?: number;
  pinnedProduct: MonitoringProductItem | null;
  products: MonitoringProductItem[];
  messages: MonitoringChatMessage[];
  metrics: MonitoringMetricsData;
  queue: MonitoringQueueStatus;
  alerts: MonitoringInventoryAlert[];
}
