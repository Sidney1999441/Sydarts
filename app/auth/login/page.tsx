import Link from "next/link";
import { LogIn } from "lucide-react";
import { signInAction } from "@/app/auth/actions";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto grid max-w-md gap-4">
      <CodlPageHeader
        kicker="CODL Account"
        title="登录"
        description="进入赛事、计分器和个人数据。"
        icon={<LogIn className="h-6 w-6" aria-hidden />}
        art="white"
      />
      <Card>
        {params.message ? (
          <p className="mt-4 rounded-lg bg-field p-3 text-sm text-muted">{params.message}</p>
        ) : null}
        <form action={signInAction} className="mt-6 grid gap-4">
          <label className="label">
            邮箱
            <input className="form-input" type="email" name="email" required />
          </label>
          <label className="label">
            密码
            <input className="form-input" type="password" name="password" required />
          </label>
          <div className="-mt-2 flex justify-end">
            <Link className="text-sm font-semibold text-board underline" href="/auth/forgot-password">
              忘记密码？
            </Link>
          </div>
          <Button type="submit">登录</Button>
        </form>
        <p className="mt-5 text-sm text-muted">
          还没有账号？{" "}
          <Link className="font-semibold text-board underline" href="/auth/register">
            去注册
          </Link>
        </p>
      </Card>
    </div>
  );
}
