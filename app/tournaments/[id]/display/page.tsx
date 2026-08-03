import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ListOrdered, Monitor, Trophy } from "lucide-react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { DisplayModeChrome } from "@/components/DisplayModeChrome";
import { TournamentBracket } from "@/components/TournamentBracket";
import { SetupNotice } from "@/components/SetupNotice";
import { updateTournamentStandings } from "@/lib/algorithms/standings";
import { getMatchRulesSummary } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, formatDateTime } from "@/lib/utils";
import type { MatchSummary, ParticipantSeed, Tournament } from "@/types/domain";

export const dynamic = "force-dynamic";

type DisplayMatch = MatchSummary & {
  stage: "group" | "knockout";
  round_number: number;
  match_number: number;
  tournament_id: string;
  updated_at?: string | null;
};

export default async function TournamentDisplayPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  if (!hasSupabaseEnv()) return <SetupNotice />;

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ data: tournament }, { data: participants }, { data: matches }] = await Promise.all([
    supabase.from("tournaments").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("tournament_participants")
      .select("id, display_name, rating_snapshot, status")
      .eq("tournament_id", id)
      .eq("status", "active")
      .order("seed"),
    supabase
      .from("matches")
      .select("*")
      .eq("tournament_id", id)
      .order("round_number")
      .order("match_number")
  ]);

  if (!tournament) notFound();

  const tournamentData = tournament as Tournament;
  const participantSeeds: ParticipantSeed[] = (participants || []).map((participant) => ({
    id: participant.id,
    name: participant.display_name,
    rating: participant.rating_snapshot || 1000
  }));
  const participantById = new Map(participantSeeds.map((participant) => [participant.id, participant.name]));
  const matchRows = (matches || []) as DisplayMatch[];
  const groupMatches = matchRows.filter((match) => match.stage === "group");
  const knockoutMatches = matchRows.filter((match) => match.stage === "knockout");
  const standings = updateTournamentStandings(
    participantSeeds,
    (groupMatches.length > 0 ? groupMatches : matchRows.filter((match) => match.stage !== "knockout")) as MatchSummary[]
  );
  const liveMatches = matchRows.filter((match) => match.status === "in_progress");
  const upcomingMatches = matchRows
    .filter((match) => match.status === "not_started" && match.participant_a_id && match.participant_b_id)
    .slice(0, 6);
  const completedMatches = [...matchRows]
    .filter((match) => match.status === "completed")
    .sort((a, b) => new Date(b.updated_at || "").getTime() - new Date(a.updated_at || "").getTime())
    .slice(0, 6);
  const completedCount = matchRows.filter((match) => match.status === "completed" || match.status === "bye").length;

  return (
    <div className="min-h-screen bg-primary text-white">
      <DisplayModeChrome />
      <AutoRefresh intervalMs={15000} />
      <div className="grid min-h-screen gap-5 p-4 sm:p-6 lg:p-8">
        <header className="grid gap-5 xl:grid-cols-[1fr_auto] xl:items-end">
          <div>
            <Link
              className="mb-4 inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-4 text-sm font-black text-white/80 active:bg-white/15"
              href={`/tournaments/${id}`}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              返回赛事
            </Link>
            <img src="/codl/codl-logo-dark.png" alt="CODL logo" className="h-auto w-[210px] object-contain sm:w-[300px]" />
            <div className="mt-4 flex items-center gap-3 text-sm font-black uppercase text-board">
              <span className="h-1.5 w-20 rounded-full bg-board" aria-hidden />
              Tournament Display
            </div>
            <h1 className="mt-3 break-words text-4xl font-black sm:text-6xl">{tournamentData.name}</h1>
            <p className="mt-3 text-lg font-bold text-white/60">
              {tournamentData.location || "CODL"} · {tournamentData.status} · {formatDateTime(tournamentData.tournament_start_at)}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:w-[520px]">
            <DisplayMetric label="参赛" value={participantSeeds.length} />
            <DisplayMetric label="完成" value={`${completedCount}/${matchRows.length}`} />
            <DisplayMetric label="直播" value={liveMatches.length} />
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[1fr_0.95fr]">
          <div className="grid gap-4">
            <DisplayPanel title="现场比赛" icon={<Monitor className="h-5 w-5" aria-hidden />}>
              <div className="grid gap-3">
                {(liveMatches.length > 0 ? liveMatches : upcomingMatches.slice(0, 2)).map((match) => (
                  <MatchBillboard key={match.id} match={match} participantById={participantById} />
                ))}
                {liveMatches.length === 0 && upcomingMatches.length === 0 ? <EmptyState text="暂无可展示比赛" /> : null}
              </div>
            </DisplayPanel>

            {knockoutMatches.length > 0 ? (
              <DisplayPanel title="季后赛/淘汰赛" icon={<Trophy className="h-5 w-5" aria-hidden />}>
                <div className="rounded-lg bg-white p-3 text-primary">
                  <TournamentBracket
                    title={tournamentData.format === "league_playoff" ? "季后赛对阵" : "淘汰赛对阵"}
                    matches={knockoutMatches}
                    participants={(participants || []).map((participant) => ({
                      id: participant.id,
                      display_name: participant.display_name
                    }))}
                  />
                </div>
              </DisplayPanel>
            ) : null}
          </div>

          <div className="grid gap-4">
            <DisplayPanel title="实时排名" icon={<ListOrdered className="h-5 w-5" aria-hidden />}>
              <div className="grid gap-2">
                {standings.slice(0, 10).map((row, index) => (
                  <div key={row.participantId} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-white/10 bg-white/10 p-3">
                    <div className={cn("grid h-10 w-10 place-items-center rounded-lg text-lg font-black", index < 3 ? "bg-board text-white" : "bg-white/10 text-white/70")}>
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-lg font-black">{row.name}</div>
                      <div className="text-xs font-bold text-white/45">
                        {row.played} 场 · {row.wins} 胜 · Leg {row.legDiff}
                      </div>
                    </div>
                    <div className="text-3xl font-black text-board">{row.points}</div>
                  </div>
                ))}
                {standings.length === 0 ? <EmptyState text="暂无排名数据" /> : null}
              </div>
            </DisplayPanel>

            <DisplayPanel title="最新战报" icon={<Trophy className="h-5 w-5" aria-hidden />}>
              <div className="grid gap-2">
                {completedMatches.map((match) => (
                  <Link
                    key={match.id}
                    href={`/reports/official/${match.id}`}
                    className="grid min-h-16 touch-manipulation gap-2 rounded-lg border border-white/10 bg-white/10 p-3 active:bg-white/15 sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-base font-black">
                        {participantById.get(match.participant_a_id || "") || "A"} vs {participantById.get(match.participant_b_id || "") || "B"}
                      </span>
                      <span className="mt-1 block truncate text-xs font-bold text-white/45">
                        第 {match.round_number} 轮 · {getMatchRulesSummary({
                          dartMode: match.dart_mode,
                          gameVariant: match.game_variant,
                          legRules: match.leg_rules
                        })}
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-2 text-2xl font-black text-board">
                      {match.score_a}:{match.score_b}
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </span>
                  </Link>
                ))}
                {completedMatches.length === 0 ? <EmptyState text="暂无战报" /> : null}
              </div>
            </DisplayPanel>
          </div>
        </section>
      </div>
    </div>
  );
}

function DisplayMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/10 p-4 text-center">
      <div className="text-xs font-black text-white/45">{label}</div>
      <div className="mt-1 text-3xl font-black text-board">{value}</div>
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

function MatchBillboard({
  match,
  participantById
}: {
  match: DisplayMatch;
  participantById: Map<string, string>;
}) {
  const playerA = participantById.get(match.participant_a_id || "") || "TBD";
  const playerB = participantById.get(match.participant_b_id || "") || "TBD";

  return (
    <div className="grid gap-3 rounded-lg border border-white/10 bg-white/10 p-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
      <div className="rounded-lg bg-white/10 p-4">
        <div className="text-xs font-black text-white/45">A</div>
        <div className="mt-1 break-words text-3xl font-black">{playerA}</div>
      </div>
      <div className="grid place-items-center rounded-lg bg-board px-5 py-4 text-center text-white">
        <div className="text-xs font-black uppercase text-white/70">
          第 {match.round_number} 轮 / M{match.match_number}
        </div>
        <div className="mt-1 text-6xl font-black leading-none">{match.score_a}:{match.score_b}</div>
        <div className="mt-2 text-xs font-black text-white/70">{match.status}</div>
      </div>
      <div className="rounded-lg bg-white/10 p-4 lg:text-right">
        <div className="text-xs font-black text-white/45">B</div>
        <div className="mt-1 break-words text-3xl font-black">{playerB}</div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm font-bold text-white/55">{text}</p>;
}
