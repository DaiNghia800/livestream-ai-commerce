import { notFound } from "next/navigation";
import { MerchantPaymentDetail } from "@/features/payments/merchant-payment-detail";
import { findPayment } from "@/mocks/payments";

type Props = { params: Promise<{ txnRef: string }> };

export async function generateMetadata({ params }: Props) {
  const { txnRef } = await params;
  return { title: `Giao dịch ${txnRef.toUpperCase()}` };
}

export default async function Page({ params }: Props) {
  const { txnRef } = await params;
  const payment = findPayment(txnRef);
  if (!payment) notFound();
  return <MerchantPaymentDetail payment={payment} />;
}
