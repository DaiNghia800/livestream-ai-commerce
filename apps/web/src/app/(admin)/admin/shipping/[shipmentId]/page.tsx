import { MerchantShipmentDetail } from "@/features/shipping/merchant-shipment-detail";

export const metadata = { title: "Chi tiết vận đơn" };

export default async function Page({
  params,
}: {
  params: Promise<{ shipmentId: string }>;
}) {
  const { shipmentId } = await params;
  return <MerchantShipmentDetail shipmentId={shipmentId} />;
}
