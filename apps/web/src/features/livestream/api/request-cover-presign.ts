/**
 * API client to request an S3 presigned PUT URL for uploading livestream cover images.
 * Endpoint: POST /api/uploads/livestream-cover/presign
 */
import {
  COMMERCE_API_BASE_URL,
  DEFAULT_DEV_MERCHANT_ID,
  CreateLivestreamApiError,
} from "./create-livestream";

export interface PresignCoverUploadRequest {
  fileName: string;
  contentType: string;
  fileSize: number;
}

export interface PresignCoverUploadResponse {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
}

export async function requestCoverPresign(
  payload: PresignCoverUploadRequest,
  merchantId: string = DEFAULT_DEV_MERCHANT_ID
): Promise<PresignCoverUploadResponse> {
  const url = `${COMMERCE_API_BASE_URL}/api/uploads/livestream-cover/presign`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Merchant-Id": merchantId,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const errorMsg =
      error instanceof Error && error.message
        ? `Không thể kết nối tới máy chủ Commerce (${error.message}).`
        : "Không thể kết nối tới máy chủ Commerce để yêu cầu tải ảnh.";
    throw new CreateLivestreamApiError(errorMsg, 0, error);
  }

  let responseData: (Record<string, unknown> & { message?: string }) | null = null;
  try {
    responseData = (await response.json()) as Record<string, unknown> & {
      message?: string;
    };
  } catch {
    responseData = null;
  }

  if (!response.ok) {
    const msg =
      typeof responseData?.message === "string"
        ? responseData.message
        : `Yêu cầu presigned URL thất bại (HTTP ${response.status}).`;
    throw new CreateLivestreamApiError(msg, response.status, responseData);
  }

  return responseData as unknown as PresignCoverUploadResponse;
}
