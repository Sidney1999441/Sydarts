import Link from "next/link";
import { Shield, Target, UserRound } from "lucide-react";
import { signOutAction } from "@/app/auth/actions";
import { Button } from "@/components/ui/Button";
import type { Profile } from "@/types/domain";

export function Header({
  userEmail,
  profile
}: {
  userEmail: string | null;
  profile: Profile | null;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-wire bg-white/95 backdrop-blur">
      <div className="mx-auto grid w-full max-w-7xl gap-3 px-4 py-3 sm:px-6 lg:grid-cols-[auto_1fr_auto] lg:items-center lg:px-8">
        <div className="flex items-center justify-between gap-3">
        <Link className="flex min-h-11 touch-manipulation items-center gap-2 text-lg font-bold text-ink" href="/">
          <Target className="h-6 w-6 text-board" aria-hidden />
          Darts League
        </Link>
        <div className="flex items-center gap-2 lg:hidden">
          {userEmail ? (
            <form action={signOutAction}>
              <Button className="px-3" variant="secondary" type="submit">
                退出
              </Button>
            </form>
          ) : (
            <Link className="inline-flex min-h-11 touch-manipulation items-center rounded-lg bg-board px-3 text-sm font-semibold text-white" href="/auth/login">
              登录
            </Link>
          )}
        </div>
        </div>
        <nav className="-mx-1 flex snap-x items-center gap-1 overflow-x-auto px-1 text-sm font-semibold text-slate-600 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link className="inline-flex min-h-11 shrink-0 snap-start touch-manipulation items-center rounded-lg px-3 hover:bg-field" href="/tournaments">
            赛事
          </Link>
          <Link className="inline-flex min-h-11 shrink-0 snap-start touch-manipulation items-center rounded-lg px-3 hover:bg-field" href="/scorer">
            计分器
          </Link>
          <Link className="inline-flex min-h-11 shrink-0 snap-start touch-manipulation items-center rounded-lg px-3 hover:bg-field" href="/profile">
            个人中心
          </Link>
          {profile?.role === "admin" ? (
            <Link className="inline-flex min-h-11 shrink-0 snap-start touch-manipulation items-center gap-1 rounded-lg px-3 hover:bg-field" href="/admin">
              <Shield className="h-4 w-4" aria-hidden />
              后台
            </Link>
          ) : null}
        </nav>
        <div className="hidden items-center justify-end gap-2 lg:flex">
          {userEmail ? (
            <>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <UserRound className="h-4 w-4" aria-hidden />
                {profile?.display_name || userEmail}
              </div>
              <form action={signOutAction}>
                <Button variant="secondary" type="submit">
                  退出
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link className="inline-flex min-h-11 touch-manipulation items-center rounded-lg px-3 text-sm font-semibold hover:bg-field" href="/auth/login">
                登录
              </Link>
              <Link className="inline-flex min-h-11 touch-manipulation items-center rounded-lg bg-board px-3 text-sm font-semibold text-white hover:bg-teal-800" href="/auth/register">
                注册
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
