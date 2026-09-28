import { AuthLayout } from "@/components/layouts/auth-layout";
import { MarketingPanel } from "@/features/login/marketing-panel";
import { RegisterForm } from "@/features/login/register-form";

export default function RegisterPage() {
  return (
    <AuthLayout marketing={<MarketingPanel />}>
      <RegisterForm />
    </AuthLayout>
  );
}
