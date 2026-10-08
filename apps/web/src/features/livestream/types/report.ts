export type CommentProcessingStatus =
  | "NOT_INTENT"
  | "INTENT_DETECTED"
  | "NEED_INFO"
  | "OUT_OF_STOCK"
  | "ORDER_PENDING"
  | "ORDER_CONFIRMED"
  | "ORDER_PAID"
  | "CANCELLED";

export interface ReportKpiItem {
  id: string;
  label: string;
  value: string;
  subValue?: string;
  note?: string;
  badge?: {
    text: string;
    variant: "success" | "warning" | "info" | "neutral";
  };
  iconKey: "clock" | "eye" | "message" | "sparkles" | "checkCircle" | "dollar" | "trending";
}

export interface PerformanceChartPoint {
  time: string; // e.g. "19:00", "19:15"
  ccu: number; // Concurrent viewers
  orderRate: number; // Đơn tạo trong mốc 15 phút
}

export interface FunnelStage {
  id: string;
  name: string;
  count: number;
  percentageOfTotal: number; // % so với giai đoạn 1 (bình luận)
  conversionFromPrevious: number; // % chuyển đổi từ giai đoạn liền trước
  dropOffCount: number; // Số lượng rơi rụng
}

export interface FunnelDropOffReason {
  reason: string;
  count: number;
  percentage: number;
}

export interface ConversionFunnelData {
  stages: FunnelStage[];
  dropOffReasons?: FunnelDropOffReason[];
  summaryNote: string;
}

export interface TopProductReportItem {
  id: string;
  rank: number;
  sku: string;
  name: string;
  image?: string;
  price: number;
  soldCount: number;
  revenue: number;
  remainingStock: number;
  status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
}

export interface InfrastructureMetric {
  id: string;
  service: "IVS" | "GEMINI" | "SQS" | "WEBHOOK";
  title: string;
  subtitle: string;
  statusLabel: string;
  statusType: "healthy" | "info" | "neutral";
  items: { label: string; value: string }[];
}

export interface CommentLogItem {
  id: string;
  timestamp: string;
  customerName: string;
  customerPhoneMasked: string;
  rawComment: string;
  aiExtracted: {
    intent: boolean;
    skuCode?: string;
    productName?: string;
    quantity?: number;
    color?: string;
    size?: string;
    phoneExtracted?: string;
    addressExtracted?: string;
  };
  linkedOrder?: {
    orderId: string;
    totalAmount: number;
    paymentMethod: "COD" | "BANK_TRANSFER" | "MOMO" | "VNPAY";
    paymentStatus: "PENDING" | "PAID";
  };
  status: CommentProcessingStatus;
  statusNote?: string;
}

export interface OrderStatusSummaryData {
  totalPendingCreated: number; // Tổng đơn Pending đã tạo tự động trong phiên (lũy kế)
  confirmedOrders: number; // Đơn đã được khách xác nhận
  paidOrders: number; // Đơn đã thanh toán online (chuyển khoản, MoMo, VNPay)
  codOrders: number; // Đơn chọn COD (chờ thu tiền khi giao)
  currentlyPending: number; // Đơn hiện vẫn đang Pending tại thời điểm chốt phiên
  cancelledOrders: number; // Đơn bị hủy (khách đổi ý, chọn nhầm...)
  expiredOrders: number; // Đơn Pending hết hạn giữ chỗ
  confirmedRevenue: number; // Tổng giá trị đơn đã xác nhận (VNĐ)
  paidRevenue: number; // Doanh thu thực thu đã thanh toán (VNĐ)
  cancellationReasons?: {
    reason: string;
    count: number;
    percentage: number;
  }[];
}

export interface LivestreamReportData {
  sessionId: string;
  sessionTitle: string;
  recordingUrl?: string; // VOD playback URL if available
  recordingDuration?: string;
  startedAt: string;
  endedAt: string;
  durationDisplay: string;
  
  // 7 KPIs
  kpis: ReportKpiItem[];
  
  // CCU & Order creation chart
  performanceData: PerformanceChartPoint[];
  
  // 4 stages conversion funnel
  funnelData: ConversionFunnelData;
  
  // Top selling products
  topProducts: TopProductReportItem[];
  
  // Order status lifecycle summary (thay thế card hạ tầng cloud)
  orderStatusSummary: OrderStatusSummaryData;

  // AI & Cloud infrastructure stats (optional for technical reference)
  infrastructure?: InfrastructureMetric[];
  
  // Comment logs
  commentLogs: CommentLogItem[];
}
