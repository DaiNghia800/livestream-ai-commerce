import { InventoryAdjustment } from "@/features/inventory/inventory-adjustment";

export const metadata = {
  title: "Điều chỉnh tồn kho - LiveOrder AI",
  description: "Điều chỉnh số lượng tồn kho và xác nhận phiếu kiểm kê.",
};

export default async function InventoryAdjustmentPage({
  searchParams,
}: {
  searchParams: Promise<{ skuId?: string }>;
}) {
  const { skuId } = await searchParams;
  return <InventoryAdjustment initialSkuId={skuId} />;
}
