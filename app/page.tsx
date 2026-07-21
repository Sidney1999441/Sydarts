import Link from "next/link";
import { ArrowRight, BarChart3, BookOpen, CalendarDays, Gauge, ShieldCheck, Trophy } from "lucide-react";
import { SetupNotice } from "@/components/SetupNotice";
import { TournamentCard } from "@/components/TournamentCard";
import { Card } from "@/components/ui/Card";
import { getCurrentUserAndProfile } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteThemeSettings } from "@/lib/theme";
import { formatDateTime } from "@/lib/utils";
import type { Tournament } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [{ user, profile }, theme] = await Promise.all([
    getCurrentUserAndProfile(),
    getSiteThemeSettings()
  ]);

  if (!hasSupabaseEnv()) {
    return (
      <div className="grid gap-5">
        <SetupNotice />
        <Hero platformName={theme.platformName} isAdmin={profile?.role === "admin"} />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*")
    .in("status", ["registration_open", "in_progress"])
    .order("tournament_start_at", { ascending: true })
    .limit(6);

  let nextMatches: {
    data:
      | Array<{
          id: string;
          tournament_id: string;
          round_number: number;
          match_number: number;
          status: string;
          scheduled_at: string | null;
          participant_a_id: string | null;
          participant_b_id: string | null;
        }>
      | null;
  } = { data: [] };

  if (user) {
    const { data: teamMemberships } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id);
    const teamIds = (teamMemberships || []).map((item) => item.team_id);
    const participantFilters = [`user_id.eq.${user.id}`];
    if (teamIds.length > 0) participantFilters.push(`team_id.in.(${teamIds.join(",")})`);
    const { data: myParticipants } = await supabase
      .from("tournament_participants")
      .select("id")
      .or(participantFilters.join(","));
    const participantIds = (myParticipants || []).map((participant) => participant.id);

    nextMatches =
      participantIds.length > 0
        ? await supabase
            .from("matches")
            .select("id, tournament_id, round_number, match_number, status, scheduled_at, participant_a_id, participant_b_id")
            .or(`participant_a_id.in.(${participantIds.join(",")}),participant_b_id.in.(${participantIds.join(",")})`)
            .in("status", ["not_started", "in_progress"])
            .order("scheduled_at", { ascending: true, nullsFirst: false })
            .limit(5)
        : { data: [] };
  }

  const activeTournaments = tournaments || [];

  return (
    <div className="grid gap-5">
      <Hero platformName={theme.platformName} isAdmin={profile?.role === "admin"} />

      <section className="grid gap-3 md:grid-cols-3">
        <MiniMetric label="用户" value={profile?.display_name || "访客"} />
        <MiniMetric label="报名中" value={activeTournaments.filter((item) => item.status === "registration_open").length} />
        <MiniMetric label="进行中" value={activeTournaments.filter((item) => item.status === "in_progress").length} />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1fr_380px]">
        <div className="grid gap-3">
          <SectionTitle title="赛事" href="/tournaments" />
          <div className="grid gap-3 md:grid-cols-2">
            {activeTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament as Tournament} />
            ))}
            {activeTournaments.length === 0 ? (
              <Card>
                <p className="text-sm text-muted">暂无开放赛事。</p>
              </Card>
            ) : null}
          </div>
        </div>

        <Card>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-board" aria-hidden />
            <h2 className="text-lg font-black">下一场</h2>
          </div>
          <div className="mt-4 grid gap-2">
            {(nextMatches.data || []).length > 0 ? (
              nextMatches.data?.map((match) => (
                <Link
                  key={match.id}
                  href={`/scorer/${match.id}`}
                  className="flex min-h-14 touch-manipulation items-center justify-between rounded-lg border border-wire px-3 text-sm font-bold hover:bg-field"
                >
                  <span>R{match.round_number} / M{match.match_number}</span>
                  <span className="text-xs text-muted">
                    {match.scheduled_at ? formatDateTime(match.scheduled_at) : "待排期"}
                  </span>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted">暂无待打比赛。</p>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}

function Hero({ platformName, isAdmin }: { platformName: string; isAdmin: boolean }) {
  return (
    <section className="grid gap-4 rounded-lg bg-primary p-5 text-white sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
      <div>
        <div className="text-sm font-bold text-white/60">DARTS EVENT OS</div>
        <h1 className="mt-2 text-4xl font-black tracking-normal md:text-6xl">{platformName}</h1>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <HeroAction href="/tournaments" icon={<CalendarDays className="h-5 w-5" />} label="赛事" />
        <HeroAction href="/scorer" icon={<Gauge className="h-5 w-5" />} label="计分" />
        {isAdmin ? (
          <HeroAction href="/admin" icon={<ShieldCheck className="h-5 w-5" />} label="后台" />
        ) : (
          <HeroAction href="/profile" icon={<BarChart3 className="h-5 w-5" />} label="数据" />
        )}
        <HeroAction href="/help" icon={<BookOpen className="h-5 w-5" />} label="说明" />
      </div>
    </section>
  );
}

function HeroAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-16 touch-manipulation items-center justify-between gap-3 rounded-lg bg-white/10 px-4 text-sm font-black text-white transition-colors duration-75 hover:bg-white/15 active:bg-white/15"
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-wire bg-surface p-4">
      <div className="text-xs font-bold text-muted">{label}</div>
      <div className="mt-1 truncate text-2xl font-black">{value}</div>
    </div>
  );
}

function SectionTitle({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-black">{title}</h2>
      <Link className="inline-flex min-h-11 touch-manipulation items-center gap-1 rounded-lg px-3 text-sm font-bold text-board hover:bg-field" href={href}>
        全部
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
