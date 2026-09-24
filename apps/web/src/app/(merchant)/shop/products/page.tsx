import { MerchantProduct } from "@/features/product";

export const metadata = {
  title: "Quản lý sản phẩm - LiveOrder AI",
  description: "Quản lý danh mục hàng hóa, mã chốt đơn livestream và tồn kho.",
};

export default function ProductsPage() {
  return <MerchantProduct />;
}
