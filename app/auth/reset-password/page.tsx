import { ShieldCheck } from "lucide-react";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { Card } from "@/components/ui/Card";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto grid max-w-md gap-4">
      <CodlPageHeader
        kicker="CODL Account"
        title="设置新密码"
        description="通过邮箱验证后，为账号设置新的登录密码。"
        icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
        art="white"
      />
      <Card>
        <ResetPasswordForm />
      </Card>
    </div>
  );
}
