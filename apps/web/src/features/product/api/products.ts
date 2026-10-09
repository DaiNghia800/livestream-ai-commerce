import type { CatalogProductSummary, ProductListItem } from "../types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_COMMERCE_API_URL || "http://localhost:8000";
const SHOP_ID = process.env.NEXT_PUBLIC_DEFAULT_SHOP_ID || "1";

export interface ProductCategory {
  id: number;
  name: string;
  parentId: number | null;
}

interface BackendSku {
  id: string;
  skuCode: string;
  variantName: string;
  price: string;
  status: string;
}

interface BackendProduct {
  id: string;
  code: string;
  name: string;
  categoryName: string | null;
  description: string | null;
  status: "active" | "archived" | "discontinued";
  skus: BackendSku[];
  images: Array<{ url: string; isPrimary: boolean; sortOrder: number }>;
}

interface ProductListResponse {
  data: BackendProduct[];
  page: number;
  pageSize: number;
  total: number;
  summary: CatalogProductSummary;
}

export interface ProductListQuery {
  q?: string;
  categoryId?: string;
  status?: string;
  page: number;
  pageSize: number;
}

export class ProductApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ProductApiError";
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as { message?: string } & T;
  if (!response.ok) {
    throw new ProductApiError(body.message || `Commerce API failed (${response.status})`, response.status);
  }
  return body;
}

function mapProduct(product: BackendProduct): ProductListItem {
  const sku = product.skus.find((item) => item.status === "active") ?? product.skus[0];
  const image =
    product.images.find((item) => item.isPrimary) ??
    [...product.images].sort((left, right) => left.sortOrder - right.sortOrder)[0];

  return {
    id: product.id,
    code: product.code,
    sku: sku?.skuCode ?? "—",
    name: product.name,
    category: product.categoryName ?? "Chưa phân loại",
    variantDetails: product.skus.map((item) => item.variantName).join(", ") || "Chưa có SKU",
    livePrice: sku ? Number(sku.price) : 0,
    availableStock: null,
    reservedStock: null,
    status: product.status === "active" ? "active" : "inactive",
    imageUrl: image?.url,
  };
}

export async function getProducts(
  query: ProductListQuery,
  signal?: AbortSignal
): Promise<{ data: ProductListItem[]; page: number; pageSize: number; total: number; summary: CatalogProductSummary }> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  });
  if (query.q) params.set("q", query.q);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.status) params.set("status", query.status);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/products?${params.toString()}`, {
      headers: { "X-Shop-Id": SHOP_ID },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ProductApiError("Không thể kết nối Commerce API. Hãy kiểm tra backend đang chạy.");
  }

  const result = await readResponse<ProductListResponse>(response);
  return { ...result, data: result.data.map(mapProduct) };
}

export async function getProductCategories(signal?: AbortSignal): Promise<ProductCategory[]> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/products/categories`, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ProductApiError("Không thể kết nối Commerce API. Hãy kiểm tra backend đang chạy.");
  }

  const result = await readResponse<{ data: ProductCategory[] }>(response);
  return result.data;
}

export async function updateProductStatus(
  productId: string,
  status: "active" | "archived"
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/products/${productId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Shop-Id": SHOP_ID,
    },
    body: JSON.stringify({ status }),
  });
  await readResponse<BackendProduct>(response);
}

export async function exportProducts(query: Omit<ProductListQuery, "page" | "pageSize">): Promise<Blob> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.status) params.set("status", query.status);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/products/export.xlsx?${params.toString()}`, {
      headers: { "X-Shop-Id": SHOP_ID },
    });
  } catch {
    throw new ProductApiError("Không thể kết nối Commerce API. Hãy kiểm tra backend đang chạy.");
  }

  if (!response.ok) {
    let message = `Commerce API failed (${response.status})`;
    try {
      const body = (await response.json()) as { message?: string };
      message = body.message || message;
    } catch {
      // The server may return a binary or empty error response.
    }
    throw new ProductApiError(message, response.status);
  }
  return response.blob();
}

export async function importProducts(file: File): Promise<{ products: number; skus: number }> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/products/import.xlsx`, {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "X-Shop-Id": SHOP_ID,
      },
      body: file,
    });
  } catch {
    throw new ProductApiError("Không thể kết nối Commerce API. Hãy kiểm tra backend đang chạy.");
  }
  return readResponse<{ products: number; skus: number; message: string }>(response);
}