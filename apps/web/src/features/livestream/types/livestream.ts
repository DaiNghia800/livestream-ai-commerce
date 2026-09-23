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
}