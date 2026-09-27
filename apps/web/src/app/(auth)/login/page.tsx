import { AuthLayout } from "@/components/layouts/auth-layout";
import { LoginForm } from "@/features/login/login-form";
import { MarketingPanel } from "@/features/login/marketing-panel";

export default function LoginPage() {
  return (
    <AuthLayout marketing={<MarketingPanel />}>
      <LoginForm />
    </AuthLayout>
  );
}
