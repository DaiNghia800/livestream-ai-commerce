import { LivestreamProduct } from "./livestream-product.types.js";

export type LivestreamStatus =
  | "draft"
  | "scheduled"
  | "live"
  | "ended"
  | "cancelled";

export interface Livestream {
  id: string;
  merchantId: string;
  title: string;
  description: string | null;
  coverImageKey: string | null;
  status: LivestreamStatus;
  channelArn: string | null;
  playbackUrl: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LivestreamListItem extends Livestream {
  productCount: number;
}

export interface LivestreamListQuery {
  merchantId: string;
  status?: LivestreamStatus | "all";
  search?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export interface LivestreamListResult {
  items: LivestreamListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LivestreamDetailResult extends Livestream {
  products: LivestreamProduct[];
}
