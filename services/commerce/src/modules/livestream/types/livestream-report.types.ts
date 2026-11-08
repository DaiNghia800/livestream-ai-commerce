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
  ccu: number;
  orderRate: number;
}

export interface FunnelStage {
  id: string;
  name: string;
  count: number;
  percentageOfTotal: number;
  conversionFromPrevious: number;
  dropOffCount: number;
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

export interface AiInsightItem {
  id: string;
  type: "golden_hour" | "leakage" | "recommendation";
  title: string;
  highlight: string;
  description: string;
  badge: string;
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
  totalPendingCreated: number;
  confirmedOrders: number;
  paidOrders: number;
  codOrders: number;
  currentlyPending: number;
  cancelledOrders: number;
  expiredOrders: number;
  confirmedRevenue: number;
  paidRevenue: number;
  cancellationReasons?: {
    reason: string;
    count: number;
    percentage: number;
  }[];
}

export interface LivestreamReportResponse {
  sessionId: string;
  sessionTitle: string;
  recordingUrl?: string;
  recordingDuration?: string;
  startedAt: string;
  endedAt: string;
  durationDisplay: string;
  kpis: ReportKpiItem[];
  performanceData: PerformanceChartPoint[];
  funnelData: ConversionFunnelData;
  topProducts: TopProductReportItem[];
  orderStatusSummary: OrderStatusSummaryData;
  aiInsights?: AiInsightItem[];
  commentLogs: CommentLogItem[];
}

