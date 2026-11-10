import type { Metadata } from "next";
import { CustomerOrderConfirmation } from "@/features/orders/customer-order-confirmation";

export const metadata: Metadata = { title: "Xác nhận đơn hàng | LiveOrder AI" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <CustomerOrderConfirmation token={token} />;
}
