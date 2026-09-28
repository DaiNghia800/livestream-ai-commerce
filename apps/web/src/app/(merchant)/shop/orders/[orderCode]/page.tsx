import { notFound } from "next/navigation";
import { MerchantOrderDetail } from "@/features/orders/merchant-order-detail";
import { findOrder } from "@/mocks/orders";

type Props = { params: Promise<{ orderCode: string }> };

export async function generateMetadata({ params }: Props) {
  const { orderCode } = await params;
  return { title: `Đơn ${orderCode.toUpperCase()}` };
}

export default async function Page({ params }: Props) {
  const { orderCode } = await params;
  const order = findOrder(orderCode);
  if (!order) notFound();
  return <MerchantOrderDetail order={order} />;
}
