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
