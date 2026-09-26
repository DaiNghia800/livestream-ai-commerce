export interface StudioProductItem {
  id: string;
  name: string;
  sku: string;
  price: number;
  originalPrice?: number;
  stock: number;
  image?: string;
  isPinned?: boolean;
  orderCode?: string;
  salesCount?: number;
}

export type StudioChatMessageStatus =
  | "NEW"
  | "ANALYZING"
  | "PARSED"
  | "PENDING_CONFIRMATION"
  | "NEEDS_REVIEW"
  | "NORMAL";

export interface StudioChatMessage {
  id: string;
  userName: string;
  userAvatar?: string;
  content: string;
  timestamp: string;
  status?: StudioChatMessageStatus;
  isAiParsed?: boolean;
  extractedSku?: string;
  extractedQuantity?: number;
  orderCreated?: boolean;
  orderId?: string;
  reviewReason?: string;
}

export interface StudioSessionState {
  id: string;
  title: string;
  isLive: boolean;
  resolution: string;
  fps: string;
  bitrate: string;
  duration: string;
  viewers: number;
  commentsCount: number;
  ordersCreatedCount: number;
  pinnedProduct: StudioProductItem | null;
  products: StudioProductItem[];
  messages: StudioChatMessage[];
}
