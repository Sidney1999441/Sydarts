import Link from "next/link";
import { signInAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="text-2xl font-bold">登录</h1>
        <p className="mt-2 text-sm text-muted">进入赛事、计分器和个人数据。</p>
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
