export type InventoryStockStatus = "in_stock" | "low" | "out";

export type InventoryMovementType = "adjustment" | "reserve" | "release" | "consume";

export interface InventoryItem {
  skuId: string;
  skuCode: string;
  variantName: string;
  skuStatus: "active" | "archived" | "discontinued";
  productId: string;
  productCode: string;
  productName: string;
  categoryId: number | null;
  categoryName: string | null;
  imageUrl: string | null;
  price: string;
  onHandQuantity: number;
  heldQuantity: number;
  availableQuantity: number;
  lowStockThreshold: number;
  stockStatus: InventoryStockStatus;
  updatedAt: string | null;
}

export interface InventorySummary {
  skuCount: number;
  totalOnHand: number;
  totalHeld: number;
  totalAvailable: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export interface InventoryPage {
  data: InventoryItem[];
  page: number;
  pageSize: number;
  total: number;
  summary: InventorySummary;
}

export interface InventoryAdjustment {
  id: string;
  skuId: string;
  skuCode: string;
  variantName: string;
  productId: string;
  productName: string;
  movementType: InventoryMovementType;
  delta: number;
  heldDelta: number;
  onHandAfter: number;
  heldAfter: number;
  reason: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface InventoryAdjustmentSummary {
  totalIncrease: number;
  totalDecrease: number;
  movementCount: number;
}

export interface InventoryAdjustmentPage {
  data: InventoryAdjustment[];
  page: number;
  pageSize: number;
  total: number;
  summary: InventoryAdjustmentSummary;
}

export interface InventoryChangeResult {
  item: InventoryItem;
  adjustment: InventoryAdjustment;
}
