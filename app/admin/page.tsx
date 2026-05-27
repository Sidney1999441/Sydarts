import Link from "next/link";
import { CalendarRange, ShieldCheck, Swords, UsersRound } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, StatCard } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ count: tournamentCount }, { count: registrationCount }, { count: activeMatchCount }] =
    await Promise.all([
      supabase.from("tournaments").select("*", { count: "exact", head: true }),
      supabase.from("tournament_registrations").select("*", { count: "exact", head: true }),
      supabase.from("matches").select("*", { count: "exact", head: true }).in("status", ["not_started", "in_progress", "pending_confirmation", "disputed"])
    ]);

  return (
    <div className="grid gap-6">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-field px-3 py-1 text-sm font-semibold text-board">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Admin
        </div>
        <h1 className="mt-3 text-2xl font-bold">赛事后台</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="赛事数量" value={tournamentCount || 0} />
        <StatCard label="报名记录" value={registrationCount || 0} />
        <StatCard label="待处理比赛" value={activeMatchCount || 0} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <AdminLink href="/admin/tournaments" icon={<CalendarRange className="h-5 w-5" />} title="赛事管理" text="创建、发布、关闭报名、删除赛事" />
        <AdminLink href="/admin/users" icon={<UsersRound className="h-5 w-5" />} title="用户管理" text="调整角色、rating 和等级" />
        <AdminLink href="/scorer" icon={<Swords className="h-5 w-5" />} title="比赛计分" text="进入当前账号关联的计分器" />
      </div>
    </div>
  );
}

function AdminLink({
  href,
  icon,
  title,
  text
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <Link href={href} className="rounded-lg border border-wire bg-white p-5 shadow-soft hover:bg-field">
      <div className="text-board">{icon}</div>
      <h2 className="mt-3 font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </Link>
  );
}
