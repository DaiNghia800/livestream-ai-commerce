import type { Metadata } from "next";
import { CustomerMyOrders } from "@/features/orders/customer-my-orders";

export const metadata: Metadata = { title: "Đơn mua | LiveOrder AI" };

export default function Page() {
  return <CustomerMyOrders />;
}
