export type ProductStatus = "active" | "archived" | "discontinued";

export interface ProductSku {
  id: string;
  productId: string;
  skuCode: string;
  variantName: string;
  price: string;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProductImage {
  id: string;
  productId: string;
  skuId: string | null;
  url: string;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface Product {
  id: string;
  shopId: number;
  categoryId: number | null;
  categoryName: string | null;
  code: string;
  name: string;
  description: string | null;
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
}