import { EditProductPage } from "@/features/product/edit-product-page";

export const metadata = {
  title: "Chỉnh sửa sản phẩm - LiveOrder AI",
  description: "Cập nhật thông tin, giá bán và tồn kho sản phẩm livestream.",
};

export default async function ProductEditRoute({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { productId } = await params;
  const { from } = await searchParams;
  const returnTo = from === "inventory" ? "/shop/inventory" : "/shop/products";
  return <EditProductPage key={productId} productId={productId} returnTo={returnTo} />;
}