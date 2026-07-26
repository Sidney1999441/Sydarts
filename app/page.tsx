import Link from "next/link";
import { ArrowRight, BarChart3, BookOpen, CalendarDays, Gauge, ShieldCheck, Trophy } from "lucide-react";
import { SetupNotice } from "@/components/SetupNotice";
import { TournamentCard } from "@/components/TournamentCard";
import { Card } from "@/components/ui/Card";
import { getCurrentUserAndProfile } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { defaultSiteTheme } from "@/lib/theme";
import { formatDateTime } from "@/lib/utils";
import type { Tournament } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { user, profile } = await getCurrentUserAndProfile();
  const platformName = defaultSiteTheme.platformName;

  if (!hasSupabaseEnv()) {
    return (
      <div className="grid gap-5">
        <SetupNotice />
        <Hero platformName={platformName} isAdmin={profile?.role === "admin"} />
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
      <Hero platformName={platformName} isAdmin={profile?.role === "admin"} />

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
    <section className="relative min-h-[360px] overflow-hidden rounded-lg border border-wire bg-surface text-ink shadow-[0_24px_70px_rgb(17_24_39/0.10)]">
      <img
        src="/codl/codl-focus-poster.jpg"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: "72% 34%" }}
      />
      <div className="absolute inset-0 bg-white/80" />
      <div className="relative grid min-h-[360px] content-between gap-8 p-5 sm:p-6 lg:p-8">
        <div className="max-w-2xl">
          <div className="codl-page-kicker">
            <span className="codl-rule" aria-hidden />
            Caliburn Office Darts League 2026
          </div>
          <img
            src="/codl/codl-logo-light.png"
            alt={`${platformName} logo`}
            className="mt-4 h-auto w-full max-w-[560px] object-contain"
          />
          <h1 className="sr-only">{platformName}</h1>
          <p className="mt-3 max-w-xl text-base font-bold text-muted sm:text-lg">
            软镖、硬镖、团队联赛、个人数据和现场计分全部集中在一个赛事系统里。
          </p>
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
      </div>
    </section>
  );
}

function HeroAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-16 touch-manipulation items-center justify-between gap-3 rounded-lg border border-primary/10 bg-primary px-4 text-sm font-black text-white shadow-[0_14px_30px_rgb(32_32_32/0.12)] transition-colors duration-75 hover:bg-board active:bg-board"
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
    <div className="rounded-lg border border-wire bg-surface/95 p-4 shadow-[0_14px_34px_rgb(17_24_39/0.05)]">
      <div className="text-xs font-black uppercase text-muted">{label}</div>
      <div className="mt-1 truncate text-2xl font-black">{value}</div>
    </div>
  );
}

function SectionTitle({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-3 text-xl font-black">
        <span className="h-4 w-4 rounded-full bg-board" aria-hidden />
        {title}
      </h2>
      <Link className="inline-flex min-h-11 touch-manipulation items-center gap-1 rounded-lg px-3 text-sm font-black text-board hover:bg-board/10" href={href}>
        全部
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
