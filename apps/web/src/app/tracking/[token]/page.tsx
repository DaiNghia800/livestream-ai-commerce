import { PublicTracking } from "@/features/shipping/public-tracking";

export const metadata = {
  title: "Theo dõi đơn hàng",
  // Trang chứa thông tin cá nhân, không để công cụ tìm kiếm lập chỉ mục.
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicTracking token={token} />;
}
