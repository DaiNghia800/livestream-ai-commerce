export type ProductStatus = "active" | "archived" | "discontinued";

export interface ProductSku {
  id: string;
  productId: string;
  skuCode: string;
  variantName: string;
  price: string;
  aiCode?: string | null;
  availableStock?: number;
  reservedStock?: number;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  id: string;
  productId: string;
  skuId: string | null;
  url: string;
  contentHash?: string | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface ProductEditHistoryChange {
  from: unknown;
  to: unknown;
}

export interface ProductEditHistoryEntry {
  id: string;
  summary: string;
  changes: Record<string, ProductEditHistoryChange>;
  createdAt: string;
}

export interface Product {
  id: string;
  shopId: number;
  categoryId: number | null;
  categoryName: string | null;
  livestreamProductId?: string;
  code: string;
  name: string;
  description: string | null;
  brand?: string | null;
  listPrice?: string | null;
  stockWarning?: number;
  triggerCode?: string | null;
  holdInventory?: boolean;
  shippingWeightGrams?: number | null;
  packageLengthCm?: string | null;
  packageWidthCm?: string | null;
  packageHeightCm?: string | null;
  isBestSeller?: boolean;
  isPinned?: boolean;
  status: ProductStatus;
  skus: ProductSku[];
  images: ProductImage[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductCategory {
  id: number;
  name: string;
  parentId: number | null;
}

export interface ProductPage {
  data: Product[];
  page: number;
  pageSize: number;
  total: number;
  summary: ProductSummary;
}

export interface ProductSummary {
  totalProducts: number;
  activeProducts: number;
  skuCount: number;
  inactiveProducts: number;
  updatedThisWeekCount: number;
}