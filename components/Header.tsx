import Link from "next/link";
import {
  CalendarDays,
  Gauge,
  HelpCircle,
  Home,
  LogIn,
  LogOut,
  Shield,
  UserPlus,
  UserRound
} from "lucide-react";
import { signOutAction } from "@/app/auth/actions";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/Button";
import type { SiteThemeSettings } from "@/lib/theme";
import type { Profile } from "@/types/domain";

const primaryNav = [
  { href: "/", label: "首页", icon: Home },
  { href: "/tournaments", label: "赛事", icon: CalendarDays },
  { href: "/scorer", label: "计分", icon: Gauge },
  { href: "/profile", label: "个人", icon: UserRound },
  { href: "/help", label: "说明", icon: HelpCircle }
];

export function Header({
  userEmail,
  profile,
  theme
}: {
  userEmail: string | null;
  profile: Profile | null;
  theme: SiteThemeSettings;
}) {
  const displayName = profile?.display_name || userEmail;
  const nav = profile?.role === "admin"
    ? [...primaryNav, { href: "/admin", label: "后台", icon: Shield }]
    : primaryNav;
  const dockNav = profile?.role === "admin"
    ? [primaryNav[1], primaryNav[2], primaryNav[3], { href: "/admin", label: "后台", icon: Shield }, primaryNav[4]]
    : [primaryNav[1], primaryNav[2], primaryNav[3], primaryNav[4]];

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-primary text-white shadow-[0_14px_34px_rgb(0_0_0/0.16)]">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <BackButton />
          <Link className="flex min-h-12 shrink-0 touch-manipulation items-center rounded-lg pr-2" href="/">
            <img
              src="/codl/codl-mark-dark.png"
              alt={`${theme.platformName} logo`}
              className="h-10 w-auto max-w-[128px] object-contain sm:h-11 sm:max-w-[152px]"
              style={{ height: "clamp(2.5rem, 3vw, 2.75rem)", width: "auto", maxWidth: "min(152px, 34vw)" }}
            />
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
            {nav.map((item) => (
              <TopNavLink key={item.href} {...item} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {userEmail ? (
              <>
                <div className="hidden max-w-[220px] truncate text-sm font-semibold text-white/70 md:block">
                  {displayName}
                </div>
                <form action={signOutAction}>
                  <Button className="border-white/15 bg-white/10 text-white hover:bg-white/15" variant="secondary" type="submit">
                    <LogOut className="h-4 w-4" aria-hidden />
                    退出
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Link className="hidden min-h-12 touch-manipulation items-center gap-2 rounded-lg px-4 text-sm font-black text-white/80 hover:bg-white/10 md:inline-flex" href="/auth/login">
                  <LogIn className="h-4 w-4" aria-hidden />
                  登录
                </Link>
                <Link className="inline-flex min-h-12 touch-manipulation items-center gap-2 rounded-lg bg-board px-4 text-sm font-black text-white hover:brightness-95" href="/auth/register">
                  <UserPlus className="h-4 w-4" aria-hidden />
                  注册
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <nav
        className="fixed inset-x-3 bottom-3 z-40 grid gap-1 rounded-lg border border-wire bg-surface/95 p-1 shadow-[0_18px_45px_rgb(15_23_42/0.18)] backdrop-blur lg:hidden"
        style={{ gridTemplateColumns: `repeat(${dockNav.length}, minmax(0, 1fr))` }}
      >
        {dockNav.map((item) => (
          <DockLink key={item.href} {...item} />
        ))}
      </nav>
    </>
  );
}

function TopNavLink({
  href,
  label,
  icon: Icon
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Link
      className="inline-flex min-h-12 touch-manipulation items-center gap-2 rounded-lg px-4 text-sm font-black text-white/75 transition-colors duration-75 hover:bg-white/10 hover:text-white active:bg-white/10"
      href={href}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  );
}

function DockLink({
  href,
  label,
  icon: Icon
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Link
      className="grid min-h-14 touch-manipulation place-items-center rounded-md px-1 py-1 text-[11px] font-black text-muted transition-colors duration-75 active:bg-field"
      href={href}
    >
      <Icon className="h-5 w-5 text-board" aria-hidden />
      <span>{label}</span>
    </Link>
  );
}
