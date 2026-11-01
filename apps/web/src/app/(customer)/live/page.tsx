import type { Metadata } from "next";
import { CustomerLive } from "@/features/livestream/customer-live";

export const metadata: Metadata = {
  title: "Xem Livestream Trực Tiếp | LiveOrder AI",
  description: "Tham gia xem livestream và chốt đơn tự động với trợ lý AI",
};

export default function LiveIndexPage() {
  return <CustomerLive />;
}
