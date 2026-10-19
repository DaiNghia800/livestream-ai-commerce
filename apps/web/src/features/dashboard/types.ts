// Dashboard feature types

export type OrderStatus = "paid" | "confirmed" | "pending" | "ready_to_ship";
export type PaymentMethod = "VNPay QR" | "COD" | "Chuyển khoản";

export interface LivestreamOrder {
  id: string;
  customer: string;
  customerInitials: string;
  customerColor: string;
  phone: string;
  product: string;
  productDetail: string;
  quantity: number;
  total: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  timeAgo: string;
}

export interface KpiMetric {
  label: string;
  value: string | number;
  badge?: string;
  badgeTone?: "live" | "success" | "warning" | "error" | "primary";
  note?: string;
  noteIcon?: string;
  noteTone?: "default" | "success" | "warning" | "error";
  icon?: string;
  iconBg?: string;
}

export interface FunnelStage {
  label: string;
  count: number;
  percent: number;
  barPercent: number;
  color: string;
  textColor: string;
  dotColor: string;
}

export interface HourlyData {
  hour: string;
  label: string;
  revenue: number;
  orders: number;
  isPeak?: boolean;
}
