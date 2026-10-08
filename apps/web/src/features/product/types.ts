export interface ProductItem {
  id: string; // Mã chốt đơn / closing code, e.g., "AO01", "DM02", "JN04", "PK03", "AT99", "DM05"
  sku: string;
  name: string;
  category: "Áo sơ mi" | "Đầm & Váy" | "Quần jean" | "Phụ kiện" | "Áo thun" | string;
  variantDetails: string;
  originalPrice?: number;
  livePrice: number;
  availableStock: number;
  reservedStock: number;
  status: "active" | "low_stock" | "out_of_stock" | "inactive";
  isBestSeller?: boolean;
  isPinned?: boolean;
  imageUrl: string;
}

export interface ProductKpiSummary {
  totalProducts: number;
  totalProductsNote: string;
  activeLiveProducts: number;
  activeLiveNote: string;
  lowStockCount: number;
  lowStockNote: string;
  inactiveCount: number;
  inactiveNote: string;
}

// Backward compatibility aliases
export type Product = ProductItem;
export type ProductMetric = {
  label: string;
  value: string | number;
  note: string;
  tone?: "neutral" | "success" | "warning" | "ai";
};
