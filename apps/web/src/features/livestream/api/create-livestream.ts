/**
 * API Client for Creating Livestream Sessions
 * Connects frontend with Commerce Service Backend (POST /api/livestreams)
 */

export interface CreateLivestreamPayload {
  title: string;
  description?: string;
  scheduledAt?: string;
  coverImageKey?: string;
}

export interface CreatedLivestreamResult {
  id: string;
  merchantId: string;
  title: string;
  description: string | null;
  coverImageKey: string | null;
  status: string;
  playbackUrl: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorResponse {
  error?: string;
  message?: string;
  details?: unknown;
}

// Fallback constant for dev merchant UUID
export const DEFAULT_DEV_MERCHANT_ID =
  process.env.NEXT_PUBLIC_DEFAULT_MERCHANT_ID ||
  "a0000000-0000-0000-0000-000000000001";

// Base URL for Commerce API
export const COMMERCE_API_BASE_URL =
  process.env.NEXT_PUBLIC_COMMERCE_API_URL || "http://localhost:8000";

export class CreateLivestreamApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "CreateLivestreamApiError";
  }
}

/**
 * Chuyển đổi startDate (YYYY-MM-DD) và startTime (HH:mm) thành chuỗi ISO-8601 hợp lệ.
 * Trả về null nếu không có ngày/giờ hợp lệ.
 */
export function formatScheduledAt(
  startDate?: string,
  startTime?: string
): string | null {
  if (!startDate || !startDate.trim()) return null;

  const trimmedDate = startDate.trim();
  const trimmedTime = startTime?.trim() || "00:00";

  // Tạo Date object từ local time
  const dateObj = new Date(`${trimmedDate}T${trimmedTime}:00`);

  if (isNaN(dateObj.getTime())) {
    return null;
  }

  return dateObj.toISOString();
}

/**
 * Gọi backend Commerce POST /api/livestreams để tạo phiên livestream thật
 */
export async function createLivestream(
  payload: CreateLivestreamPayload,
  merchantId: string = DEFAULT_DEV_MERCHANT_ID
): Promise<CreatedLivestreamResult> {
  const url = `${COMMERCE_API_BASE_URL}/api/livestreams`;

  // Chỉ gửi các trường backend hỗ trợ (title, description?, scheduledAt?, coverImageKey?)
  // KHÔNG gửi: id, merchantId trong body, status, products,...
  const body: {
    title: string;
    description?: string;
    scheduledAt?: string;
    coverImageKey?: string;
  } = {
    title: payload.title.trim(),
  };

  if (payload.description && payload.description.trim()) {
    body.description = payload.description.trim();
  }

  if (payload.scheduledAt) {
    body.scheduledAt = payload.scheduledAt;
  }

  if (payload.coverImageKey && payload.coverImageKey.trim()) {
    body.coverImageKey = payload.coverImageKey.trim();
  }

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
    // Network error / Connection refused / Backend down
    const errorMsg =
      error instanceof Error && error.message
        ? `Không thể kết nối tới máy chủ Commerce (${error.message}). Vui lòng kiểm tra dịch vụ backend.`
        : "Không thể kết nối tới máy chủ Commerce. Vui lòng kiểm tra dịch vụ backend.";
    throw new CreateLivestreamApiError(errorMsg, 0, error);
  }

  let responseData: (Record<string, unknown> & ApiErrorResponse) | null = null;
  try {
    responseData = (await response.json()) as Record<string, unknown> & ApiErrorResponse;
  } catch {
    responseData = null;
  }

  if (!response.ok) {
    // HTTP 400 Validation Error
    if (response.status === 400) {
      const msg =
        typeof responseData?.message === "string"
          ? responseData.message
          : "Dữ liệu phiên livestream không hợp lệ (HTTP 400). Vui lòng kiểm tra lại.";
      throw new CreateLivestreamApiError(msg, 400, responseData);
    }

    // HTTP 500 hoặc các lỗi khác
    const msg =
      typeof responseData?.message === "string"
        ? responseData.message
        : `Máy chủ xử lý thất bại (HTTP ${response.status}). Vui lòng thử lại sau.`;
    throw new CreateLivestreamApiError(msg, response.status, responseData);
  }

  return responseData as unknown as CreatedLivestreamResult;
}
