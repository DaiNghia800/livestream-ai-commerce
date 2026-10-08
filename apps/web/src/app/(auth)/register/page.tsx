import { AuthLayout } from "@/components/layouts/auth-layout";
import { AuthSwitcher } from "@/features/login/auth-switcher";
import { MarketingPanel } from "@/features/login/marketing-panel";

export default function RegisterPage() {
  return (
    <AuthLayout marketing={<MarketingPanel />}>
      <AuthSwitcher />
    </AuthLayout>
  );
}
