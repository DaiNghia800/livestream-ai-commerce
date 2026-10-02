import { MerchantInventory } from "@/features/inventory";

export const metadata = {
  title: "Quản lý tồn kho - LiveOrder AI",
  description: "Theo dõi tồn kho khả dụng và lượng hàng đang giữ chỗ livestream.",
};

export default function InventoryPage() {
  return <MerchantInventory />;
}
