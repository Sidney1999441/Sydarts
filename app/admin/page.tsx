import Link from "next/link";
import { BookOpen, CalendarRange, ChevronRight, Palette, ShieldCheck, Swords, UserRound, UsersRound } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const [
    { count: tournamentCount },
    { count: registrationCount },
    { count: savedTeamCount }
  ] = await Promise.all([
    supabase.from("tournaments").select("*", { count: "exact", head: true }),
    supabase.from("tournament_registrations").select("*", { count: "exact", head: true }),
    supabase.from("saved_teams").select("*", { count: "exact", head: true })
  ]);

  return (
    <div className="grid gap-5">
      <CodlPageHeader
        dark
        kicker="CODL Admin"
        title="赛事后台"
        description="管理赛事、用户、队伍、赛程和现场计分入口。"
        icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
        art="pattern"
        actions={
          <Link
            className="inline-flex min-h-12 touch-manipulation items-center gap-2 rounded-lg bg-board px-4 text-sm font-bold text-white"
            href="/admin/tournaments/new"
          >
            创建赛事
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        }
      />

      <section className="grid grid-cols-3 gap-3">
        <Metric label="赛事" value={tournamentCount || 0} />
        <Metric label="报名" value={registrationCount || 0} />
        <Metric label="队伍" value={savedTeamCount || 0} />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <AdminAction href="/admin/tournaments" icon={<CalendarRange className="h-6 w-6" />} title="赛事" />
        <AdminAction href="/admin/users" icon={<UserRound className="h-6 w-6" />} title="用户" />
        <AdminAction href="/admin/teams" icon={<UsersRound className="h-6 w-6" />} title="队伍" />
        <AdminAction href="/admin/theme" icon={<Palette className="h-6 w-6" />} title="主题" />
        <AdminAction href="/scorer" icon={<Swords className="h-6 w-6" />} title="计分" />
        <AdminAction href="/help" icon={<BookOpen className="h-6 w-6" />} title="说明" />
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-wire bg-surface/95 p-4 shadow-[0_14px_34px_rgb(17_24_39/0.05)]">
      <div className="text-xs font-black uppercase text-muted">{label}</div>
      <div className="mt-1 text-3xl font-black">{value}</div>
    </div>
  );
}

function AdminAction({
  href,
  icon,
  title
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-32 touch-manipulation items-center justify-between rounded-lg border border-wire bg-surface/95 p-5 shadow-[0_14px_34px_rgb(17_24_39/0.05)] transition-colors duration-75 hover:border-board/40 active:bg-field sm:min-h-36"
    >
      <div>
        <div className="grid h-12 w-12 place-items-center rounded-lg bg-board/10 text-board group-hover:bg-board group-hover:text-white">
          {icon}
        </div>
        <h2 className="mt-4 text-xl font-black">{title}</h2>
      </div>
      <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
    </Link>
  );
}
