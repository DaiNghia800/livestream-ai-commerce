import { MerchantPaymentDetail } from "@/features/payments/merchant-payment-detail";

type Props = { params: Promise<{ txnRef: string }> };

export async function generateMetadata({ params }: Props) {
  const { txnRef } = await params;
  return { title: `Giao dịch ${txnRef.toUpperCase()}` };
}

export default async function Page({ params }: Props) {
  const { txnRef } = await params;
  return <MerchantPaymentDetail txnRef={txnRef} />;
}
