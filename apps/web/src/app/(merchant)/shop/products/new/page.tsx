import { CreateProductPage } from "@/features/product/create-product-page";

export const metadata = {
  title: "Tạo sản phẩm mới - LiveOrder AI",
  description:
    "Thêm thông tin hàng hóa, SKU và thiết lập mã chốt đơn AI để tự động nhận diện trong livestream.",
};

export default function NewProductPage() {
  return <CreateProductPage />;
}
