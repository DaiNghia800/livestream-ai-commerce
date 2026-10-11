const API_BASE_URL =
  process.env.NEXT_PUBLIC_COMMERCE_API_URL || "http://localhost:8000";
const SHOP_ID = process.env.NEXT_PUBLIC_DEFAULT_SHOP_ID || "1";

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

export interface InventoryAdjustmentPage {
  data: InventoryAdjustment[];
  page: number;
  pageSize: number;
  total: number;
  summary: { totalIncrease: number; totalDecrease: number; movementCount: number };
}

export interface InventoryListQuery {
  q?: string;
  categoryId?: string;
  status?: "in_stock" | "low" | "out" | "high_hold";
  page: number;
  pageSize: number;
}

export interface AdjustmentListQuery {
  q?: string;
  skuId?: string;
  movementType?: InventoryMovementType;
  reason?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface AdjustStockInput {
  delta?: number;
  newQuantity?: number;
  reason: string;
  note?: string | null;
}

export class InventoryApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "InventoryApiError";
  }
}

async function inventoryRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/inventory${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "X-Shop-Id": SHOP_ID, ...init?.headers },
    });
  } catch {
    if (init?.signal?.aborted) throw new DOMException("The request was aborted.", "AbortError");
    throw new InventoryApiError("Không thể kết nối Commerce API. Hãy kiểm tra backend đang chạy.");
  }
  let body: { message?: string } & T;
  try {
    body = (await response.json()) as { message?: string } & T;
  } catch {
    throw new InventoryApiError(
      `Commerce API returned an invalid response (${response.status})`,
      response.status,
    );
  }
  if (!response.ok) {
    throw new InventoryApiError(
      body.message || `Commerce API failed (${response.status})`,
      response.status,
    );
  }
  return body;
}

function toQueryString(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function getInventory(query: InventoryListQuery, signal?: AbortSignal) {
  return inventoryRequest<InventoryPage>(toQueryString(query), { signal });
}

export function getInventoryItem(skuId: string, signal?: AbortSignal) {
  return inventoryRequest<InventoryItem>(`/skus/${encodeURIComponent(skuId)}`, { signal });
}

export function getInventoryAdjustments(query: AdjustmentListQuery, signal?: AbortSignal) {
  return inventoryRequest<InventoryAdjustmentPage>(`/adjustments${toQueryString(query)}`, {
    signal,
  });
}

export function adjustInventory(skuId: string, input: AdjustStockInput) {
  return inventoryRequest<{ item: InventoryItem; adjustment: InventoryAdjustment }>(
    `/skus/${encodeURIComponent(skuId)}/adjust`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function adjustInventoryBatch(items: (AdjustStockInput & { skuId: string })[]) {
  return inventoryRequest<{
    data: { item: InventoryItem; adjustment: InventoryAdjustment }[];
  }>("/adjustments/batch", { method: "POST", body: JSON.stringify({ items }) });
}

export function updateLowStockThreshold(skuId: string, lowStockThreshold: number) {
  return inventoryRequest<InventoryItem>(`/skus/${encodeURIComponent(skuId)}/threshold`, {
    method: "PATCH",
    body: JSON.stringify({ lowStockThreshold }),
  });
}
