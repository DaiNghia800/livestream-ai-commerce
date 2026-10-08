/**
 * API Client for Livestream Products Management
 * Connects frontend with Commerce Service Backend:
 * - POST /api/livestreams/:id/products (Gắn sản phẩm vào phiên)
 * - GET /api/livestreams/:id/products (Lấy danh sách sản phẩm)
 * - PATCH /api/livestreams/:id/products/:productId (Ghim / Cập nhật thứ tự)
 * - DELETE /api/livestreams/:id/products/:productId (Xóa sản phẩm)
 */

import {
  COMMERCE_API_BASE_URL,
  DEFAULT_DEV_MERCHANT_ID,
  ApiErrorResponse,
} from "./create-livestream";

export interface BackendLivestreamProduct {
  id: string;
  livestreamId: string;
  productId: string;
  variantId: string | null;
  displayOrder: number;
  isFeatured: boolean;
  createdAt: string;
}

export interface AddLivestreamProductPayload {
  productId: string;
  variantId?: string | null;
  displayOrder?: number;
  isFeatured?: boolean;
}

export interface UpdateLivestreamProductPayload {
  displayOrder?: number;
  isFeatured?: boolean;
}

export class LivestreamProductApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "LivestreamProductApiError";
  }
}

// Map mock code (AO01, DM02,...) to stable deterministic UUIDs for backend PostgreSQL
const MOCK_CODE_TO_UUID: Record<string, string> = {
  AO01: "11111111-0000-4000-8000-000000000001",
  DM02: "11111111-0000-4000-8000-000000000002",
  QJ02: "11111111-0000-4000-8000-000000000003",
  SM03: "11111111-0000-4000-8000-000000000004",
  BL04: "11111111-0000-4000-8000-000000000005",
  PK05: "11111111-0000-4000-8000-000000000006",
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Đảm bảo productId gửi lên backend luôn là một UUID hợp lệ.
 */
export function getProductUuid(productIdOrCode: string): string {
  if (UUID_REGEX.test(productIdOrCode)) {
    return productIdOrCode;
  }
  return (
    MOCK_CODE_TO_UUID[productIdOrCode] ||
    "22222222-0000-4000-8000-000000000001"
  );
}

/**
 * Gắn sản phẩm vào phiên Livestream (POST /api/livestreams/:id/products)
 */
export async function addLivestreamProduct(
  livestreamId: string,
  payload: AddLivestreamProductPayload,
  merchantId: string = DEFAULT_DEV_MERCHANT_ID
): Promise<BackendLivestreamProduct> {
  const url = `${COMMERCE_API_BASE_URL}/api/livestreams/${livestreamId}/products`;

  const body = {
    productId: getProductUuid(payload.productId),
    variantId: payload.variantId || null,
    displayOrder: payload.displayOrder ?? 0,
    isFeatured: payload.isFeatured ?? false,
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Merchant-Id": merchantId,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const errorMsg =
      error instanceof Error && error.message
        ? `Không thể kết nối tới Commerce Service (${error.message})`
        : "Không thể kết nối tới Commerce Service";
    throw new LivestreamProductApiError(errorMsg, 0, error);
  }

  let data: (Record<string, unknown> & ApiErrorResponse) | null = null;
  try {
    data = (await response.json()) as Record<string, unknown> & ApiErrorResponse;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const msg =
      typeof data?.message === "string"
        ? data.message
        : `Lỗi thêm sản phẩm vào phiên (HTTP ${response.status})`;
    throw new LivestreamProductApiError(msg, response.status, data);
  }

  return data as unknown as BackendLivestreamProduct;
}

/**
 * Lấy danh sách sản phẩm trong phiên Livestream (GET /api/livestreams/:id/products)
 */
export async function getLivestreamProducts(
  livestreamId: string
): Promise<{ data: BackendLivestreamProduct[]; total: number }> {
  const url = `${COMMERCE_API_BASE_URL}/api/livestreams/${livestreamId}/products`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    const errorMsg =
      error instanceof Error && error.message
        ? `Không thể kết nối tới Commerce Service (${error.message})`
        : "Không thể kết nối tới Commerce Service";
    throw new LivestreamProductApiError(errorMsg, 0, error);
  }

  if (!response.ok) {
    throw new LivestreamProductApiError(
      `Không thể lấy danh sách sản phẩm (HTTP ${response.status})`,
      response.status
    );
  }

  return response.json();
}

/**
 * Ghim sản phẩm hoặc cập nhật thứ tự hiển thị (PATCH /api/livestreams/:id/products/:productId)
 */
export async function updateLivestreamProduct(
  livestreamId: string,
  productId: string,
  payload: UpdateLivestreamProductPayload,
  merchantId: string = DEFAULT_DEV_MERCHANT_ID
): Promise<BackendLivestreamProduct> {
  const validProductId = getProductUuid(productId);
  const url = `${COMMERCE_API_BASE_URL}/api/livestreams/${livestreamId}/products/${validProductId}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Merchant-Id": merchantId,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new LivestreamProductApiError(
      "Không thể kết nối tới Commerce Service",
      0,
      error
    );
  }

  const data = await response.json();
  if (!response.ok) {
    throw new LivestreamProductApiError(
      data?.message || `Cập nhật sản phẩm thất bại (HTTP ${response.status})`,
      response.status,
      data
    );
  }

  return data as BackendLivestreamProduct;
}

/**
 * Xóa sản phẩm khỏi phiên Livestream (DELETE /api/livestreams/:id/products/:productId)
 */
export async function removeLivestreamProduct(
  livestreamId: string,
  productId: string,
  merchantId: string = DEFAULT_DEV_MERCHANT_ID
): Promise<void> {
  const validProductId = getProductUuid(productId);
  const url = `${COMMERCE_API_BASE_URL}/api/livestreams/${livestreamId}/products/${validProductId}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "DELETE",
      headers: {
        "X-Merchant-Id": merchantId,
      },
    });
  } catch (error) {
    throw new LivestreamProductApiError(
      "Không thể kết nối tới Commerce Service",
      0,
      error
    );
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new LivestreamProductApiError(
      data?.message || `Xóa sản phẩm thất bại (HTTP ${response.status})`,
      response.status,
      data
    );
  }
}
