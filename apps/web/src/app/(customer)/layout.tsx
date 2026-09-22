import { CustomerShell } from "@/components/layouts/customer-shell";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
