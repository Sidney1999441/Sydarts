import Link from "next/link";
import { KeyRound } from "lucide-react";
import { requestPasswordResetAction } from "@/app/auth/actions";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default async function ForgotPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto grid max-w-md gap-4">
      <CodlPageHeader
        kicker="CODL Account"
        title="找回密码"
        description="输入注册邮箱，系统会发送一封密码重置邮件。"
        icon={<KeyRound className="h-6 w-6" aria-hidden />}
        art="white"
      />
      <Card>
        {params.message ? (
          <p className="mt-4 rounded-lg bg-field p-3 text-sm font-semibold text-muted">
            {params.message}
          </p>
        ) : null}
        <form action={requestPasswordResetAction} className="mt-6 grid gap-4">
          <label className="label">
            邮箱
            <input
              className="form-input"
              type="email"
              name="email"
              autoComplete="email"
              required
            />
          </label>
          <Button type="submit" pendingText="发送中">
            发送重置邮件
          </Button>
        </form>
        <p className="mt-5 text-sm text-muted">
          想起密码了？{" "}
          <Link className="font-semibold text-board underline" href="/auth/login">
            返回登录
          </Link>
        </p>
      </Card>
    </div>
  );
}
