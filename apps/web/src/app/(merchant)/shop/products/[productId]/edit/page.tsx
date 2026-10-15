import { EditProductPage } from "@/features/product/edit-product-page";

export const metadata = {
  title: "Chỉnh sửa sản phẩm - LiveOrder AI",
  description: "Cập nhật thông tin, giá bán và tồn kho sản phẩm livestream.",
};

export default async function ProductEditRoute({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return <EditProductPage key={productId} productId={productId} />;
}