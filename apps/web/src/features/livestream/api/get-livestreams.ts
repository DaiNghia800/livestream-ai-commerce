/**
 * API Client for Fetching Livestream Sessions
 * Connects frontend with Commerce Service Backend:
 * - GET /api/livestreams (List livestreams with filter and pagination)
 * - GET /api/livestreams/:id (Get livestream session detail)
 */

import {
  COMMERCE_API_BASE_URL,
  DEFAULT_DEV_MERCHANT_ID,
} from "./create-livestream";
import type { Livestream, LivestreamStatus } from "../types/livestream";

export interface BackendLivestreamItem {
  id: string;
  merchantId: string;
  title: string;
  description: string | null;
  coverImageKey: string | null;
  status: "draft" | "scheduled" | "live" | "ended" | "cancelled";
  channelArn: string | null;
  playbackUrl: string | null;
  replayUrl?: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  productCount: number;
  products?: Array<{
    id: string;
    livestreamId: string;
    productId: string;
    variantId: string | null;
    displayOrder: number;
    isFeatured: boolean;
    createdAt: string;
    productName?: string | null;
    productCode?: string | null;
    skuCode?: string | null;
    variantName?: string | null;
    price?: number | null;
    imageUrl?: string | null;
  }>;
}

export interface BackendLivestreamListResponse {
  items: BackendLivestreamItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BackendLivestreamDetailResponse extends BackendLivestreamItem {
  products: Array<{
    id: string;
    livestreamId: string;
    productId: string;
    variantId: string | null;
    displayOrder: number;
    isFeatured: boolean;
    createdAt: string;
    productName?: string | null;
    productCode?: string | null;
    skuCode?: string | null;
    variantName?: string | null;
    price?: number | null;
    imageUrl?: string | null;
  }>;
}

export interface GetLivestreamsQueryParams {
  status?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

/**
 * Chuyển đổi status từ backend ("draft", "live"...) sang format frontend ("DRAFT", "LIVE"...)
 */
export function mapBackendStatusToFrontend(
  status: string
): LivestreamStatus {
  switch (status.toLowerCase()) {
    case "live":
      return "LIVE";
    case "scheduled":
      return "SCHEDULED";
    case "ended":
    case "cancelled":
      return "ENDED";
    case "starting":
      return "STARTING";
    case "draft":
    default:
      return "DRAFT";
  }
}

/**
 * Format thời gian hiển thị thân thiện cho bảng livestream
 */
export function formatTimeDisplay(dateString?: string | null): {
  timeDisplay: string;
  subTimeDisplay: string;
} {
  if (!dateString) {
    return {
      timeDisplay: "Chưa lên lịch",
      subTimeDisplay: "--",
    };
  }

  const d = new Date(dateString);
  if (isNaN(d.getTime())) {
    return {
      timeDisplay: dateString,
      subTimeDisplay: "--",
    };
  }

  const dateFormatted = d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeFormatted = d.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return {
    timeDisplay: `${timeFormatted} ${dateFormatted}`,
    subTimeDisplay: "Giờ Việt Nam (GMT+7)",
  };
}

export const PUBLIC_ASSET_BASE_URL =
  process.env.PUBLIC_ASSET_BASE_URL ||
  process.env.NEXT_PUBLIC_PUBLIC_ASSET_BASE_URL ||
  "https://liveorder-dev-realtime-images.s3.ap-southeast-1.amazonaws.com";

/**
 * Format link ảnh cover trực tiếp từ S3:
 * - Nếu key đã là link đầy đủ (http/https) -> giữ nguyên
 * - Tự động bổ sung tiền tố "public/" nếu key lưu trước đó chưa có
 */
export function formatCoverImageUrl(
  coverImageKey?: string | null
): string | undefined {
  if (!coverImageKey || !coverImageKey.trim()) return undefined;
  const cleanKey = coverImageKey.trim().replace(/^\/+/, "");
  if (cleanKey.startsWith("http://") || cleanKey.startsWith("https://")) {
    return cleanKey;
  }
  const normalizedKey = cleanKey.startsWith("public/")
    ? cleanKey
    : `public/${cleanKey}`;
  return `${PUBLIC_ASSET_BASE_URL}/${normalizedKey}`;
}

/**
 * Adapter map dữ liệu từ backend sang kiểu Livestream của frontend UI
 */
export function mapBackendLivestreamToFrontend(
  item: BackendLivestreamItem
): Livestream {
  const { timeDisplay, subTimeDisplay } = formatTimeDisplay(
    item.scheduledAt || item.startedAt || item.createdAt
  );

  return {
    id: item.id,
    title: item.title,
    status: mapBackendStatusToFrontend(item.status),
    thumbnail: formatCoverImageUrl(item.coverImageKey),
    description: item.description || undefined,
    channelName: item.channelArn ? "AWS IVS Channel" : "LiveOrder RTMP",
    ivsChannel: item.channelArn || "Chưa cấu hình",
    replayUrl: item.replayUrl || undefined,
    resolution: "1080p60",
    productCount:
      item.productCount || (Array.isArray(item.products) ? item.products.length : 0),
    products: Array.isArray(item.products)
      ? item.products.map((p) => ({
          id: p.productId || p.id,
          sku: p.skuCode || p.productCode || p.productId,
          name: p.productName || `Sản phẩm #${p.productId}`,
          price: typeof p.price === "number" ? p.price : 0,
          originalPrice: undefined,
          stock: 100,
          image: p.imageUrl || undefined,
          isPinned: Boolean(p.isFeatured),
        }))
      : undefined,
    scheduledAt: item.scheduledAt || undefined,
    startedAt: item.startedAt || undefined,
    endedAt: item.endedAt || undefined,
    createdAt: item.createdAt || undefined,
    timeDisplay,
    subTimeDisplay,
    currentViewers: item.status === "live" ? 0 : 0,
    peakViewers: 0,
    revenue: 0,
    revenueDisplay: "0 ₫",
    chatCount: 0,
    chatDisplay: "0 tin nhắn",
    chatSubDisplay: "0 msg/phút",
  };
}

/**
 * Gọi API GET /api/livestreams lấy danh sách phiên livestream
 */
export async function getLivestreams(
  params: GetLivestreamsQueryParams = {},
  merchantId: string = DEFAULT_DEV_MERCHANT_ID
): Promise<{
  items: Livestream[];
  rawItems: BackendLivestreamItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const query = new URLSearchParams();

  if (params.status && params.status !== "ALL") {
    query.set("status", params.status.toLowerCase());
  }

  if (params.search && params.search.trim()) {
    query.set("search", params.search.trim());
  }

  if (params.fromDate) {
    query.set("fromDate", params.fromDate);
  }

  if (params.toDate) {
    query.set("toDate", params.toDate);
  }

  if (params.page && params.page > 0) {
    query.set("page", params.page.toString());
  }

  if (params.limit && params.limit > 0) {
    query.set("limit", params.limit.toString());
  }

  const queryString = query.toString();
  const url = `${COMMERCE_API_BASE_URL}/api/livestreams${queryString ? `?${queryString}` : ""
    }`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Merchant-Id": merchantId,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Lỗi tải danh sách livestream (HTTP ${res.status})`);
  }

  const data: BackendLivestreamListResponse = await res.json();

  return {
    items: (data.items || []).map(mapBackendLivestreamToFrontend),
    rawItems: data.items || [],
    total: data.total || 0,
    page: data.page || 1,
    limit: data.limit || 10,
    totalPages: data.totalPages || 1,
  };
}

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return UUID_V4_REGEX.test(id);
}

/**
 * Gọi API GET /api/livestreams/:id lấy chi tiết phiên livestream
 */
export async function getLivestreamDetail(
  id: string
): Promise<BackendLivestreamDetailResponse> {
  if (!id || !isValidUuid(id)) {
    throw new Error(`Phiên livestream không tồn tại hoặc ID không hợp lệ: ${id}`);
  }

  const url = `${COMMERCE_API_BASE_URL}/api/livestreams/${id}`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Lỗi tải chi tiết phiên livestream (HTTP ${res.status})`);
  }

  return (await res.json()) as BackendLivestreamDetailResponse;
}

/**
 * Gọi API PATCH /api/livestreams/:id/status cập nhật trạng thái phiên livestream (bắt đầu, kết thúc...)
 */
export async function updateLivestreamStatus(
  id: string,
  status: "draft" | "scheduled" | "live" | "ended" | "cancelled",
  merchantId: string = DEFAULT_DEV_MERCHANT_ID
): Promise<BackendLivestreamItem> {
  if (!id || !isValidUuid(id)) {
    throw new Error(`Phiên livestream không tồn tại hoặc ID không hợp lệ: ${id}`);
  }

  const url = `${COMMERCE_API_BASE_URL}/api/livestreams/${id}/status`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Merchant-Id": merchantId,
    },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      errBody?.message ||
        `Cập nhật trạng thái livestream thất bại (HTTP ${res.status})`
    );
  }

  return (await res.json()) as BackendLivestreamItem;
}

export interface IvsStreamConfig {
  channelArn: string;
  playbackUrl: string;
  ingestEndpoint: string;
  streamKey?: string;
}

/**
 * Gọi API GET /api/livestreams/:id/stream-config để lấy hoặc tự động khởi tạo Channel IVS & Stream Key
 */
export async function getIvsStreamConfig(
  id: string,
  merchantId: string = DEFAULT_DEV_MERCHANT_ID
): Promise<IvsStreamConfig> {
  if (!id || !isValidUuid(id)) {
    throw new Error(`Phiên livestream không tồn tại hoặc ID không hợp lệ: ${id}`);
  }

  const url = `${COMMERCE_API_BASE_URL}/api/livestreams/${id}/stream-config`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Merchant-Id": merchantId,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      errBody?.message ||
        `Lấy cấu hình phát sóng IVS thất bại (HTTP ${res.status})`
    );
  }

  return (await res.json()) as IvsStreamConfig;
}

export interface IvsChatConfig {
  roomArn: string;
  roomId: string;
}

export interface IvsChatTokenResponse {
  token: string;
  sessionExpirationTime?: string;
  tokenExpirationTime?: string;
  roomArn: string;
  roomId: string;
}

/**
 * Gọi API GET /api/livestreams/:id/chat-config để lấy thông tin IVS Chat Room
 */
export async function getIvsChatConfig(id: string): Promise<IvsChatConfig> {
  if (!id || !isValidUuid(id)) {
    throw new Error(`Phiên livestream không tồn tại hoặc ID không hợp lệ: ${id}`);
  }

  const url = `${COMMERCE_API_BASE_URL}/api/livestreams/${id}/chat-config`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      errBody?.message ||
        `Lấy cấu hình phòng chat IVS thất bại (HTTP ${res.status})`
    );
  }

  return (await res.json()) as IvsChatConfig;
}

/**
 * Gọi API POST /api/livestreams/:id/chat-token để lấy token xác thực kết nối WebSocket IVS Chat
 */
export async function getIvsChatToken(
  id: string,
  params: {
    userId: string;
    role?: "HOST" | "MODERATOR" | "VIEWER";
    username?: string;
    avatarUrl?: string;
  }
): Promise<IvsChatTokenResponse> {
  if (!id || !isValidUuid(id)) {
    throw new Error(`Phiên livestream không tồn tại hoặc ID không hợp lệ: ${id}`);
  }

  const url = `${COMMERCE_API_BASE_URL}/api/livestreams/${id}/chat-token`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      errBody?.message ||
        `Lấy token chat IVS thất bại (HTTP ${res.status})`
    );
  }

  return (await res.json()) as IvsChatTokenResponse;
}


