import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Crown, Gauge, Sparkles, Trophy } from "lucide-react";
import { ReportActions } from "@/components/ReportActions";
import { getCurrentUserAndProfile } from "@/lib/auth/guards";
import { getMatchRulesSummary } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, formatDateTime } from "@/lib/utils";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

type ReportStats = {
  averagePer3Darts?: number | string | null;
  averageScore?: number | string | null;
  averageMpr?: number | string | null;
  highestTurnScore?: number | string | null;
  highestCheckout?: number | string | null;
  countHighCheckout?: number | string | null;
  count180?: number | string | null;
  count100Plus?: number | string | null;
  count140Plus?: number | string | null;
  count170Plus?: number | string | null;
  countTon80?: number | string | null;
  countHatTrick?: number | string | null;
  countWhiteHorse?: number | string | null;
  count9Marks?: number | string | null;
  totalMarks?: number | string | null;
};

type ReportData = {
  sourceLabel: string;
  title: string;
  subtitle: string;
  playedAt: string;
  playerAName: string;
  playerBName: string;
  winnerName: string;
  scoreA: number;
  scoreB: number;
  statsA: ReportStats;
  statsB: ReportStats;
  backHref: string;
};

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function readStats(details: unknown, key: string, bucket = "participantStats"): ReportStats {
  const value = (details as Record<string, Record<string, ReportStats> | undefined> | null)?.[bucket]?.[key];
  return value || {};
}

function readCasualMemberSide(details: unknown, userId: string) {
  const participantMembers = (details as {
    participantMembers?: {
      A?: Array<{ userId?: string | null; linked?: boolean | null }>;
      B?: Array<{ userId?: string | null; linked?: boolean | null }>;
    };
  } | null)?.participantMembers;
  if (participantMembers?.A?.some((member) => member.linked && member.userId === userId)) return "A";
  if (participantMembers?.B?.some((member) => member.linked && member.userId === userId)) return "B";
  return null;
}

function topMetric(stats: ReportStats) {
  return Math.max(
    toNumber(stats.averagePer3Darts),
    toNumber(stats.averageScore),
    toNumber(stats.averageMpr) * 25
  );
}

function buildHighlights(data: ReportData) {
  const mvp =
    topMetric(data.statsA) >= topMetric(data.statsB)
      ? data.playerAName
      : data.playerBName;
  const highestTurn = Math.max(toNumber(data.statsA.highestTurnScore), toNumber(data.statsB.highestTurnScore));
  const highestCheckout = Math.max(toNumber(data.statsA.highestCheckout), toNumber(data.statsB.highestCheckout));
  const count180 = Math.max(toNumber(data.statsA.count180), toNumber(data.statsB.count180));
  const count100 = Math.max(toNumber(data.statsA.count100Plus), toNumber(data.statsB.count100Plus));
  const countHat = Math.max(toNumber(data.statsA.countHatTrick), toNumber(data.statsB.countHatTrick));
  const countWhiteHorse = Math.max(toNumber(data.statsA.countWhiteHorse), toNumber(data.statsB.countWhiteHorse));
  const count9 = Math.max(toNumber(data.statsA.count9Marks), toNumber(data.statsB.count9Marks));

  return [
    { label: "MVP", value: mvp, accent: true },
    { label: "最高轮", value: highestTurn || "-" },
    { label: "最高拆", value: highestCheckout || "-" },
    { label: "180", value: count180 },
    { label: "100+", value: count100 },
    { label: "帽子", value: countHat },
    { label: "白马", value: countWhiteHorse },
    { label: "9 Mark", value: count9 }
  ];
}

async function loadOfficialReport(id: string): Promise<ReportData | null> {
  const supabase = await createSupabaseServerClient();
  const { data: match } = await supabase
    .from("matches")
    .select("id, tournament_id, stage, round_number, match_number, participant_a_id, participant_b_id, winner_participant_id, status, score_a, score_b, dart_mode, game_variant, leg_rules, details, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!match || !match.participant_a_id || !match.participant_b_id) return null;

  const [{ data: participants }, { data: tournament }] = await Promise.all([
    supabase
      .from("tournament_participants")
      .select("id, display_name")
      .in("id", [match.participant_a_id, match.participant_b_id]),
    supabase.from("tournaments").select("id, name").eq("id", match.tournament_id).maybeSingle()
  ]);
  const participantById = new Map((participants || []).map((participant) => [participant.id, participant.display_name]));
  const playerAName = participantById.get(match.participant_a_id) || "A";
  const playerBName = participantById.get(match.participant_b_id) || "B";

  return {
    sourceLabel: "OFFICIAL MATCH",
    title: tournament?.name || "赛事比赛",
    subtitle: `${match.stage === "group" ? "联赛轮次" : "淘汰赛"} · ${getMatchRulesSummary({
      dartMode: match.dart_mode,
      gameVariant: match.game_variant,
      legRules: match.leg_rules
    })}`,
    playedAt: match.updated_at || match.created_at,
    playerAName,
    playerBName,
    winnerName:
      match.winner_participant_id === match.participant_a_id
        ? playerAName
        : match.winner_participant_id === match.participant_b_id
          ? playerBName
          : "未定",
    scoreA: match.score_a || 0,
    scoreB: match.score_b || 0,
    statsA: readStats(match.details, match.participant_a_id),
    statsB: readStats(match.details, match.participant_b_id),
    backHref: `/profile/history/official/${match.id}`
  };
}

async function loadCasualReport(id: string): Promise<ReportData | null> {
  const { user } = await getCurrentUserAndProfile();
  if (!user) redirect(`/auth/login?redirect=/reports/casual/${id}`);

  const admin = createSupabaseAdminClient();
  const { data: match } = await admin.from("casual_matches").select("*").eq("id", id).maybeSingle();
  if (!match) return null;

  const casualMemberSide = readCasualMemberSide(match.details, user.id);
  const isParticipant =
    match.created_by === user.id ||
    match.player_a_user_id === user.id ||
    match.player_b_user_id === user.id ||
    Boolean(casualMemberSide);
  if (!isParticipant) return null;

  return {
    sourceLabel: "CASUAL MATCH",
    title: `${match.player_a_name} vs ${match.player_b_name}`,
    subtitle: (match.details as { participantMode?: string } | null)?.participantMode === "doubles" ? "双人切磋" : "单人切磋",
    playedAt: match.created_at,
    playerAName: match.player_a_name,
    playerBName: match.player_b_name,
    winnerName: match.winner_side === "A" ? match.player_a_name : match.player_b_name,
    scoreA: match.score_a || 0,
    scoreB: match.score_b || 0,
    statsA: readStats(match.details, "A", "personalStats"),
    statsB: readStats(match.details, "B", "personalStats"),
    backHref: `/profile/history/casual/${match.id}`
  };
}

export default async function MatchReportPage({
  params
}: {
  params: Promise<{ source: string; id: string }>;
}) {
  if (!hasSupabaseEnv()) return <SetupNotice />;

  const { source, id } = await params;
  const data =
    source === "official"
      ? await loadOfficialReport(id)
      : source === "casual"
        ? await loadCasualReport(id)
        : null;
  if (!data) notFound();

  const highlights = buildHighlights(data);

  return (
    <div className="grid min-h-[calc(100vh-8rem)] gap-4 print:block">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          className="inline-flex min-h-11 touch-manipulation items-center gap-2 rounded-lg border border-wire bg-surface px-4 text-sm font-black text-board shadow-soft"
          href={data.backHref}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          返回详情
        </Link>
        <ReportActions />
      </div>

      <section className="codl-report-poster relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-lg border border-wire bg-white shadow-[0_24px_70px_rgb(17_24_39/0.14)] print:max-w-none print:border-0">
        <div className="codl-panel-art" aria-hidden />
        <div className="relative grid content-between gap-8 p-5 sm:p-8 lg:p-10">
          <div className="grid gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <img src="/codl/codl-logo-light.png" alt="CODL logo" className="h-auto w-[190px] object-contain sm:w-[250px]" />
                <div className="mt-4 flex items-center gap-2 text-xs font-black uppercase text-board">
                  <span className="h-1.5 w-16 rounded-full bg-board" aria-hidden />
                  {data.sourceLabel}
                </div>
              </div>
              <div className="rounded-lg bg-primary px-4 py-3 text-right text-white">
                <div className="text-xs font-black text-white/60">MATCH REPORT</div>
                <div className="mt-1 text-sm font-black">{formatDateTime(data.playedAt)}</div>
              </div>
            </div>

            <div>
              <div className="text-sm font-black text-muted">{data.subtitle}</div>
              <h1 className="mt-2 break-words text-3xl font-black text-primary sm:text-5xl">{data.title}</h1>
            </div>
          </div>

          <div className="grid gap-5">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              <ReportSide name={data.playerAName} score={data.scoreA} winner={data.winnerName === data.playerAName} />
              <div className="grid place-items-center rounded-lg bg-field px-4 py-3 text-center">
                <Trophy className="h-8 w-8 text-board" aria-hidden />
                <div className="mt-1 text-xs font-black text-muted">WINNER</div>
                <div className="max-w-48 truncate text-lg font-black text-board">{data.winnerName}</div>
              </div>
              <ReportSide name={data.playerBName} score={data.scoreB} winner={data.winnerName === data.playerBName} alignRight />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {highlights.map((item) => (
                <div
                  key={item.label}
                  className={cn(
                    "min-h-20 rounded-lg border p-3",
                    item.accent ? "border-board bg-board text-white" : "border-wire bg-surface/90"
                  )}
                >
                  <div className={cn("text-xs font-black", item.accent ? "text-white/70" : "text-muted")}>{item.label}</div>
                  <div className="mt-2 truncate text-2xl font-black">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <StatsPanel title={data.playerAName} stats={data.statsA} highlighted={data.winnerName === data.playerAName} />
              <StatsPanel title={data.playerBName} stats={data.statsB} highlighted={data.winnerName === data.playerBName} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-wire pt-4">
            <div className="flex items-center gap-2 text-sm font-black text-muted">
              <Sparkles className="h-4 w-4 text-board" aria-hidden />
              Caliburn Office Darts League 2026
            </div>
            <div className="text-sm font-black text-primary">FOCUS. COMPETE. WIN.</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ReportSide({
  name,
  score,
  winner,
  alignRight
}: {
  name: string;
  score: number;
  winner: boolean;
  alignRight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        winner ? "border-board bg-board text-white" : "border-wire bg-surface/90",
        alignRight && "lg:text-right"
      )}
    >
      <div className={cn("text-xs font-black", winner ? "text-white/70" : "text-muted")}>
        {winner ? "VICTORY" : "PLAYER"}
      </div>
      <div className="mt-2 break-words text-2xl font-black">{name}</div>
      <div className="mt-3 text-6xl font-black leading-none">{score}</div>
    </div>
  );
}

function StatsPanel({ title, stats, highlighted }: { title: string; stats: ReportStats; highlighted?: boolean }) {
  const rows = [
    ["均分", toNumber(stats.averagePer3Darts) ? toNumber(stats.averagePer3Darts).toFixed(1) : "-"],
    ["软镖均分", toNumber(stats.averageScore) ? toNumber(stats.averageScore).toFixed(1) : "-"],
    ["MPR", toNumber(stats.averageMpr) ? toNumber(stats.averageMpr).toFixed(2) : "-"],
    ["最高轮", toNumber(stats.highestTurnScore) || "-"],
    ["最高拆", toNumber(stats.highestCheckout) || "-"],
    ["高拆", toNumber(stats.countHighCheckout)],
    ["100+", toNumber(stats.count100Plus)],
    ["140+", toNumber(stats.count140Plus)],
    ["170+", toNumber(stats.count170Plus)],
    ["180", toNumber(stats.count180)],
    ["TON80", toNumber(stats.countTon80)],
    ["帽子", toNumber(stats.countHatTrick)],
    ["白马", toNumber(stats.countWhiteHorse)],
    ["9 Mark", toNumber(stats.count9Marks)],
    ["总 Mark", toNumber(stats.totalMarks)]
  ];

  return (
    <div className={cn("rounded-lg border p-4", highlighted ? "border-board/40 bg-field" : "border-wire bg-surface/90")}>
      <div className="flex items-center gap-2">
        {highlighted ? <Crown className="h-4 w-4 text-board" aria-hidden /> : <Gauge className="h-4 w-4 text-muted" aria-hidden />}
        <h2 className="truncate text-base font-black">{title}</h2>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs sm:grid-cols-5">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-white/75 p-2">
            <dt className="truncate text-muted">{label}</dt>
            <dd className="mt-1 truncate font-black text-primary">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
