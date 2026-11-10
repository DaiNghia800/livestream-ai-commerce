import { InventoryHistory } from "@/features/inventory/inventory-history";

export const metadata = {
  title: "Nhật ký biến động tồn kho - LiveOrder AI",
  description: "Theo dõi lịch sử biến động tồn kho và audit log.",
};

export default async function InventoryHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ skuId?: string }>;
}) {
  const { skuId } = await searchParams;
  return <InventoryHistory initialSkuId={skuId} />;
}
