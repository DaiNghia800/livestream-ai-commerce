import { MerchantOrderDetail } from "@/features/orders/merchant-order-detail";

type Props = { params: Promise<{ orderCode: string }> };

export async function generateMetadata({ params }: Props) {
  const { orderCode } = await params;
  return { title: `Đơn ${orderCode.toUpperCase()}` };
}

/**
 * Trang chỉ truyền mã đơn xuống; việc gọi API nằm ở component phía
 * client để nó còn tự làm mới sau mỗi thao tác đổi trạng thái.
 */
export default async function Page({ params }: Props) {
  const { orderCode } = await params;
  return <MerchantOrderDetail orderCode={orderCode} />;
}
