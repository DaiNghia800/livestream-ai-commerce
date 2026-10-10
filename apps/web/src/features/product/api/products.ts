import type { CatalogProductSummary, ProductListItem } from "../types";
import { DEFAULT_DEV_MERCHANT_ID } from "../../livestream/api/create-livestream";
import { uploadFileToS3 } from "../../livestream/api/upload-file-to-s3";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_COMMERCE_API_URL || "http://localhost:8000";
const SHOP_ID = process.env.NEXT_PUBLIC_DEFAULT_SHOP_ID || "1";

export interface ProductCategory {
  id: number;
  name: string;
  parentId: number | null;
}

export interface BackendSku {
  id: string;
  skuCode: string;
  variantName: string;
  price: string;
  aiCode?: string | null;
  stock: number;
  status: "active" | "archived" | "discontinued";
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

export interface BackendProduct {
  id: string;
  shopId: number;
  categoryId: number | null;
  code: string;
  name: string;
  categoryName: string | null;
  description: string | null;
  brand?: string | null;
  listPrice?: string | null;
  stockWarning: number;
  triggerCode?: string | null;
  holdInventory?: boolean;
  shippingWeightGrams?: number | null;
  packageLengthCm?: string | null;
  packageWidthCm?: string | null;
  packageHeightCm?: string | null;
  status: "active" | "archived" | "discontinued";
  skus: BackendSku[];
  images: ProductImage[];
  createdAt: string;
  updatedAt: string;
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

export interface ProductInput {
  categoryId: number | null;
  code: string;
  name: string;
  description: string | null;
  brand?: string | null;
  listPrice?: number | null;
  stockWarning?: number;
  triggerCode?: string | null;
  holdInventory?: boolean;
  shippingWeightGrams?: number | null;
  packageLengthCm?: number | null;
  packageWidthCm?: number | null;
  packageHeightCm?: number | null;
  status: BackendProduct["status"];
}

export interface CreateProductInput extends ProductInput {
  skus?: ProductSkuInput[];
  images?: Pick<ProductImage, "url" | "isPrimary" | "sortOrder">[];
}

export interface ProductSkuInput {
  skuCode: string;
  variantName: string;
  price: number;
  aiCode?: string | null;
  stock?: number;
  status: BackendSku["status"];
}

export class ProductApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ProductApiError";
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  let body: { message?: string } & T;
  try {
    body = (await response.json()) as { message?: string } & T;
  } catch {
    throw new ProductApiError(`Commerce API returned an invalid response (${response.status})`, response.status);
  }
  if (!response.ok) {
    throw new ProductApiError(body.message || `Commerce API failed (${response.status})`, response.status);
  }
  return body;
}

async function productRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Shop-Id": SHOP_ID,
        ...init?.headers,
      },
    });
  } catch {
    if (init?.signal?.aborted) throw new DOMException("The request was aborted.", "AbortError");
    throw new ProductApiError("Không thể kết nối Commerce API. Hãy kiểm tra backend đang chạy.");
  }
  return readResponse<T>(response);
}

export async function getProduct(productId: string, signal?: AbortSignal): Promise<BackendProduct> {
  return productRequest<BackendProduct>(`/api/products/${encodeURIComponent(productId)}`, { signal });
}

export async function updateProduct(productId: string, input: ProductInput): Promise<BackendProduct> {
  return productRequest<BackendProduct>(`/api/products/${encodeURIComponent(productId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function createProduct(input: CreateProductInput): Promise<BackendProduct> {
  return productRequest<BackendProduct>("/api/products", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createProductSku(productId: string, input: ProductSkuInput): Promise<BackendSku> {
  return productRequest<BackendSku>(`/api/products/${encodeURIComponent(productId)}/skus`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateProductSku(
  productId: string,
  skuId: string,
  input: ProductSkuInput
): Promise<BackendSku> {
  return productRequest<BackendSku>(
    `/api/products/${encodeURIComponent(productId)}/skus/${encodeURIComponent(skuId)}`,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}

export async function discontinueProductSku(productId: string, skuId: string): Promise<BackendSku> {
  return productRequest<BackendSku>(
    `/api/products/${encodeURIComponent(productId)}/skus/${encodeURIComponent(skuId)}`,
    { method: "DELETE" }
  );
}

export async function createProductImage(
  productId: string,
  input: Pick<ProductImage, "url" | "isPrimary" | "sortOrder">
): Promise<ProductImage> {
  return productRequest<ProductImage>(`/api/products/${encodeURIComponent(productId)}/images`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateProductImage(
  productId: string,
  imageId: string,
  input: Partial<Pick<ProductImage, "isPrimary" | "sortOrder">>
): Promise<ProductImage> {
  return productRequest<ProductImage>(
    `/api/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}

export async function removeProductImage(productId: string, imageId: string): Promise<void> {
  await productRequest<{ message: string }>(
    `/api/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
    { method: "DELETE" }
  );
}

export async function uploadProductImage(file: File): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/uploads/product-image/presign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Merchant-Id": DEFAULT_DEV_MERCHANT_ID,
      },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type,
        fileSize: file.size,
      }),
    });
  } catch {
    throw new ProductApiError("Không thể kết nối Commerce API để tải ảnh sản phẩm.");
  }
  const result = await readResponse<{
    uploadUrl: string;
    imageUrl: string;
    storage?: "local" | "s3";
  }>(response);
  const uploadUrl = result.uploadUrl.startsWith("/")
    ? `${API_BASE_URL}${result.uploadUrl}`
    : result.uploadUrl;
  if (result.storage === "local") {
    let uploadResponse: Response;
    try {
      uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          "X-Merchant-Id": DEFAULT_DEV_MERCHANT_ID,
        },
        body: file,
      });
    } catch {
      throw new ProductApiError("Không thể kết nối Commerce API để tải ảnh lên bộ nhớ local.");
    }
    if (!uploadResponse.ok) {
      let message = `Tải ảnh lên máy chủ thất bại (HTTP ${uploadResponse.status} ${uploadResponse.statusText}).`;
      try {
        const body = (await uploadResponse.json()) as { message?: string };
        if (body.message) message = body.message;
      } catch {
        // Keep the HTTP status message when the server response is not JSON.
      }
      throw new ProductApiError(message, uploadResponse.status);
    }
  } else {
    await uploadFileToS3(uploadUrl, file, file.type);
  }
  return result.imageUrl;
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
