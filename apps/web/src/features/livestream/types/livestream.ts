export type LivestreamStatus =
    | "DRAFT"
    | "SCHEDULED"
    | "STARTING"
    | "LIVE"
    | "ENDED";

export interface Livestream {
    id: string;
    title: string;
    status: LivestreamStatus;
    thumbnail?: string;
    hostName?: string;
    ivsChannel?: string;
    resolution?: string;
    channelName?: string;
    scheduledAt?: string;
    startedAt?: string;
    endedAt?: string;
    productCount: number;
    currentViewers?: number;
    peakViewers?: number;
    chatCount?: number;
    chatRatePerMinute?: number;
    aiOrderCount?: number;
    aiConversionRate?: number;
    revenue?: number;
    timeDisplay?: string;
    subTimeDisplay?: string;
    chatDisplay?: string;
    chatSubDisplay?: string;
    revenueDisplay?: string;
    description?: string;
    startDate?: string;
    startTime?: string;
    endDate?: string;
    endTime?: string;
    products?: LiveProductItem[];
}

export interface LiveProductItem {
    id: string; // Mã chốt đơn / Product code (e.g. AO01, DM02)
    sku: string;
    name: string;
    price: number;
    originalPrice?: number;
    stock: number;
    image?: string;
    isPinned?: boolean;
    chatOrders?: number; // Số đơn chốt từ chat trong phiên
}

export interface LivestreamFormData {
    title: string;
    description: string;
    coverImage?: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    products: LiveProductItem[];
}
