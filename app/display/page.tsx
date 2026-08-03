import Link from "next/link";
import { ArrowRight, CalendarDays, Monitor, Trophy } from "lucide-react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { DisplayModeChrome } from "@/components/DisplayModeChrome";
import { SetupNotice } from "@/components/SetupNotice";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DisplayOverviewPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;

  const supabase = await createSupabaseServerClient();
  const [{ data: tournaments }, { data: matches }] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, name, status, tournament_start_at, location")
      .in("status", ["registration_open", "registration_closed", "in_progress"])
      .order("tournament_start_at", { ascending: true })
      .limit(8),
    supabase
      .from("matches")
      .select("id, tournament_id, round_number, match_number, participant_a_id, participant_b_id, winner_participant_id, status, score_a, score_b, updated_at")
      .in("status", ["in_progress", "not_started", "completed"])
      .order("updated_at", { ascending: false })
      .limit(18)
  ]);

  const participantIds = [
    ...new Set((matches || []).flatMap((match) => [match.participant_a_id, match.participant_b_id]).filter(Boolean))
  ] as string[];
  const { data: participants } =
    participantIds.length > 0
      ? await supabase.from("tournament_participants").select("id, display_name").in("id", participantIds)
      : { data: [] };

  const tournamentById = new Map((tournaments || []).map((tournament) => [tournament.id, tournament]));
  const participantById = new Map((participants || []).map((participant) => [participant.id, participant.display_name]));
  const liveMatches = (matches || []).filter((match) => match.status === "in_progress");
  const upcomingMatches = (matches || []).filter((match) => match.status === "not_started").slice(0, 6);
  const completedMatches = (matches || []).filter((match) => match.status === "completed").slice(0, 6);

  return (
    <div className="min-h-screen bg-primary text-white">
      <DisplayModeChrome />
      <AutoRefresh intervalMs={20000} />
      <div className="grid min-h-screen gap-5 p-4 sm:p-6 lg:p-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <img src="/codl/codl-logo-dark.png" alt="CODL logo" className="h-auto w-[230px] object-contain sm:w-[320px]" />
            <div className="mt-4 flex items-center gap-3 text-sm font-black uppercase text-board">
              <span className="h-1.5 w-20 rounded-full bg-board" aria-hidden />
              Live Center
            </div>
            <h1 className="mt-3 text-4xl font-black sm:text-6xl">CODL 现场大屏</h1>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/10 px-5 py-4 text-right">
            <div className="text-sm font-black text-white/50">自动刷新</div>
            <div className="mt-1 text-2xl font-black">{formatDateTime(new Date().toISOString())}</div>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
          <div className="grid gap-4">
            <DisplayPanel title="正在进行" icon={<Trophy className="h-5 w-5" aria-hidden />}>
              {liveMatches.length > 0 ? (
                <div className="grid gap-3">
                  {liveMatches.map((match) => (
                    <MatchRow
                      key={match.id}
                      match={match}
                      tournamentName={tournamentById.get(match.tournament_id)?.name || "赛事"}
                      participantById={participantById}
                      strong
                    />
                  ))}
                </div>
              ) : (
                <EmptyState text="暂无进行中的比赛" />
              )}
            </DisplayPanel>

            <DisplayPanel title="即将开始" icon={<CalendarDays className="h-5 w-5" aria-hidden />}>
              <div className="grid gap-2">
                {upcomingMatches.map((match) => (
                  <MatchRow
                    key={match.id}
                    match={match}
                    tournamentName={tournamentById.get(match.tournament_id)?.name || "赛事"}
                    participantById={participantById}
                  />
                ))}
                {upcomingMatches.length === 0 ? <EmptyState text="暂无待开始比赛" /> : null}
              </div>
            </DisplayPanel>
          </div>

          <div className="grid gap-4">
            <DisplayPanel title="赛事入口" icon={<Monitor className="h-5 w-5" aria-hidden />}>
              <div className="grid gap-3">
                {(tournaments || []).map((tournament) => (
                  <Link
                    key={tournament.id}
                    className="grid min-h-20 touch-manipulation gap-2 rounded-lg border border-white/10 bg-white/10 p-4 active:bg-white/15"
                    href={`/tournaments/${tournament.id}/display`}
                  >
                    <span className="text-lg font-black">{tournament.name}</span>
                    <span className="flex items-center justify-between gap-3 text-sm font-bold text-white/60">
                      {tournament.location || "CODL"} · {tournament.status}
                      <ArrowRight className="h-4 w-4 shrink-0 text-board" aria-hidden />
                    </span>
                  </Link>
                ))}
                {(tournaments || []).length === 0 ? <EmptyState text="暂无可投屏赛事" /> : null}
              </div>
            </DisplayPanel>

            <DisplayPanel title="最新赛果" icon={<Trophy className="h-5 w-5" aria-hidden />}>
              <div className="grid gap-2">
                {completedMatches.map((match) => (
                  <MatchRow
                    key={match.id}
                    match={match}
                    tournamentName={tournamentById.get(match.tournament_id)?.name || "赛事"}
                    participantById={participantById}
                    href={`/reports/official/${match.id}`}
                  />
                ))}
                {completedMatches.length === 0 ? <EmptyState text="暂无已完成比赛" /> : null}
              </div>
            </DisplayPanel>
          </div>
        </section>
      </div>
    </div>
  );
}

function DisplayPanel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.06] p-4 shadow-[0_24px_70px_rgb(0_0_0/0.25)] sm:p-5">
      <div className="mb-4 flex items-center gap-2 text-board">
        {icon}
        <h2 className="text-xl font-black text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function MatchRow({
  match,
  tournamentName,
  participantById,
  href,
  strong
}: {
  match: {
    id: string;
    tournament_id: string;
    round_number: number;
    match_number: number;
    participant_a_id: string | null;
    participant_b_id: string | null;
    winner_participant_id: string | null;
    status: string;
    score_a: number;
    score_b: number;
  };
  tournamentName: string;
  participantById: Map<string, string>;
  href?: string;
  strong?: boolean;
}) {
  const content = (
    <>
      <div className="min-w-0">
        <div className="truncate text-xs font-black uppercase text-white/45">
          {tournamentName} · 第 {match.round_number} 轮 / M{match.match_number}
        </div>
        <div className={strong ? "mt-1 text-2xl font-black" : "mt-1 text-lg font-black"}>
          {participantById.get(match.participant_a_id || "") || "TBD"} vs {participantById.get(match.participant_b_id || "") || "TBD"}
        </div>
      </div>
      <div className="text-right">
        <div className={strong ? "text-5xl font-black text-board" : "text-3xl font-black text-board"}>
          {match.score_a}:{match.score_b}
        </div>
        <div className="mt-1 text-xs font-black text-white/50">{match.status}</div>
      </div>
    </>
  );

  const className = "grid min-h-20 gap-3 rounded-lg border border-white/10 bg-white/10 p-4 sm:grid-cols-[1fr_auto] sm:items-center";
  return href ? (
    <Link className={`${className} active:bg-white/15`} href={href}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm font-bold text-white/55">{text}</p>;
}
