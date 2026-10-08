import { AuthLayout } from "@/components/layouts/auth-layout";
import { AuthSwitcher } from "@/features/login/auth-switcher";
import { MarketingPanel } from "@/features/login/marketing-panel";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string }>;
}) {
  const { registered } = await searchParams;

  return (
    <AuthLayout marketing={<MarketingPanel />}>
      <AuthSwitcher registrationComplete={registered === "1"} />
    </AuthLayout>
  );
}
