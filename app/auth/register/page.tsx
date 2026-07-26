import Link from "next/link";
import { UserPlus } from "lucide-react";
import { signUpAction } from "@/app/auth/actions";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default async function RegisterPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto grid max-w-md gap-4">
      <CodlPageHeader
        kicker="CODL Account"
        title="注册"
        description="创建选手账号后即可报名、计分和查看个人段位。"
        icon={<UserPlus className="h-6 w-6" aria-hidden />}
        poster="white"
      />
      <Card>
        {params.message ? (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{params.message}</p>
        ) : null}
        <form action={signUpAction} className="mt-6 grid gap-4">
          <label className="label">
            昵称
            <input className="form-input" name="display_name" required />
          </label>
          <label className="label">
            邮箱
            <input className="form-input" type="email" name="email" required />
          </label>
          <label className="label">
            密码
            <input className="form-input" type="password" name="password" minLength={6} required />
          </label>
          <Button type="submit">注册</Button>
        </form>
        <p className="mt-5 text-sm text-muted">
          已有账号？{" "}
          <Link className="font-semibold text-board underline" href="/auth/login">
            去登录
          </Link>
        </p>
      </Card>
    </div>
  );
}
