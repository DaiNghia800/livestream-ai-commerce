import { MerchantShell } from "@/components/layouts/merchant-shell";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <MerchantShell>{children}</MerchantShell>;
}
