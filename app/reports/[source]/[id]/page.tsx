import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Crown, Gauge, Sparkles, Trophy } from "lucide-react";
import { ReportActions } from "@/components/ReportActions";
import { SetupNotice } from "@/components/SetupNotice";
import { getCurrentUserAndProfile } from "@/lib/auth/guards";
import { getMatchRulesSummary } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { normalizeAvatarUrl } from "@/lib/storage/avatars";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, formatDateTime } from "@/lib/utils";

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
  playerAAvatarUrl?: string | null;
  playerBAvatarUrl?: string | null;
  winnerName: string;
  winnerSide: "A" | "B" | null;
  scoreA: number;
  scoreB: number;
  statsA: ReportStats;
  statsB: ReportStats;
  backHref: string;
};

type ParticipantInfo = {
  name: string;
  avatarUrl: string | null;
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
  const mvp = topMetric(data.statsA) >= topMetric(data.statsB) ? data.playerAName : data.playerBName;
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

function participantInitial(name: string) {
  const clean = name.trim();
  if (!clean) return "C";
  const first = Array.from(clean)[0] || "C";
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
}

function resolveParticipantInfo(
  participant: {
    display_name?: string | null;
    user_id?: string | null;
    team_id?: string | null;
    participant_type?: string | null;
  } | null | undefined,
  fallback: string,
  avatarMaps: {
    teamAvatarById: Map<string, string | null>;
    profileAvatarById: Map<string, string | null>;
  }
): ParticipantInfo {
  if (!participant) return { name: fallback, avatarUrl: null };
  const isTeam = participant.participant_type === "team" || Boolean(participant.team_id);
  const avatarUrl =
    isTeam && participant.team_id
      ? avatarMaps.teamAvatarById.get(participant.team_id) || null
      : participant.user_id
        ? avatarMaps.profileAvatarById.get(participant.user_id) || null
        : null;

  return {
    name: participant.display_name || fallback,
    avatarUrl
  };
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
      .select("id, display_name, user_id, team_id, participant_type")
      .in("id", [match.participant_a_id, match.participant_b_id]),
    supabase.from("tournaments").select("id, name").eq("id", match.tournament_id).maybeSingle()
  ]);
  const participantRows = participants || [];
  const teamIds = [...new Set(participantRows.map((participant) => participant.team_id).filter(Boolean))] as string[];
  const userIds = [...new Set(participantRows.map((participant) => participant.user_id).filter(Boolean))] as string[];
  const [{ data: teams }, { data: profiles }] = await Promise.all([
    teamIds.length > 0 ? supabase.from("teams").select("id, avatar_url").in("id", teamIds) : Promise.resolve({ data: [] }),
    userIds.length > 0 ? supabase.from("profiles").select("id, avatar_url").in("id", userIds) : Promise.resolve({ data: [] })
  ]);
  const teamAvatarById = new Map((teams || []).map((team) => [team.id, team.avatar_url || null]));
  const profileAvatarById = new Map((profiles || []).map((profile) => [profile.id, profile.avatar_url || null]));
  const participantById = new Map(participantRows.map((participant) => [participant.id, participant]));
  const participantA = resolveParticipantInfo(participantById.get(match.participant_a_id), "A", {
    teamAvatarById,
    profileAvatarById
  });
  const participantB = resolveParticipantInfo(participantById.get(match.participant_b_id), "B", {
    teamAvatarById,
    profileAvatarById
  });
  const winnerSide =
    match.winner_participant_id === match.participant_a_id
      ? "A"
      : match.winner_participant_id === match.participant_b_id
        ? "B"
        : null;

  return {
    sourceLabel: "OFFICIAL MATCH",
    title: tournament?.name || "赛事比赛",
    subtitle: `${match.stage === "group" ? "联赛轮次" : "淘汰赛"} · ${getMatchRulesSummary({
      dartMode: match.dart_mode,
      gameVariant: match.game_variant,
      legRules: match.leg_rules
    })}`,
    playedAt: match.updated_at || match.created_at,
    playerAName: participantA.name,
    playerBName: participantB.name,
    playerAAvatarUrl: participantA.avatarUrl,
    playerBAvatarUrl: participantB.avatarUrl,
    winnerName: winnerSide === "A" ? participantA.name : winnerSide === "B" ? participantB.name : "未定",
    winnerSide,
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

  const profileIds = [match.player_a_user_id, match.player_b_user_id].filter(Boolean) as string[];
  const { data: profiles } =
    profileIds.length > 0
      ? await admin.from("profiles").select("id, avatar_url").in("id", profileIds)
      : { data: [] };
  const profileAvatarById = new Map((profiles || []).map((profile) => [profile.id, profile.avatar_url || null]));
  const winnerSide = match.winner_side === "A" ? "A" : match.winner_side === "B" ? "B" : null;

  return {
    sourceLabel: "CASUAL MATCH",
    title: `${match.player_a_name} vs ${match.player_b_name}`,
    subtitle: (match.details as { participantMode?: string } | null)?.participantMode === "doubles" ? "双人切磋" : "单人切磋",
    playedAt: match.created_at,
    playerAName: match.player_a_name,
    playerBName: match.player_b_name,
    playerAAvatarUrl: match.player_a_user_id ? profileAvatarById.get(match.player_a_user_id) || null : null,
    playerBAvatarUrl: match.player_b_user_id ? profileAvatarById.get(match.player_b_user_id) || null : null,
    winnerName: winnerSide === "A" ? match.player_a_name : winnerSide === "B" ? match.player_b_name : "未定",
    winnerSide,
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
  const winnerAvatarUrl = data.winnerSide === "A" ? data.playerAAvatarUrl : data.winnerSide === "B" ? data.playerBAvatarUrl : null;

  return (
    <div className="grid min-h-[calc(100vh-8rem)] min-w-0 gap-4 print:block">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <Link
          className="inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg border border-wire bg-surface px-4 text-sm font-black text-board shadow-soft"
          href={data.backHref}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          返回详情
        </Link>
        <ReportActions className="grid grid-cols-2 sm:flex" />
      </div>

      <section className="codl-report-poster relative mx-auto grid w-full max-w-5xl min-w-0 overflow-hidden rounded-lg border border-wire bg-white shadow-[0_24px_70px_rgb(17_24_39/0.14)] print:max-w-none print:border-0">
        <div className="codl-panel-art" aria-hidden />
        <div className="absolute inset-x-0 top-0 h-1.5 bg-board" aria-hidden />
        <div className="relative grid min-w-0 gap-5 p-4 sm:gap-7 sm:p-8 lg:p-10">
          <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <div className="min-w-0">
              <img src="/codl/codl-logo-light.png" alt="CODL logo" className="h-auto w-[170px] object-contain sm:w-[250px]" />
              <div className="mt-4 flex min-w-0 items-center gap-2 text-xs font-black uppercase text-board">
                <span className="h-1.5 w-14 shrink-0 rounded-full bg-board" aria-hidden />
                <span className="truncate">{data.sourceLabel}</span>
              </div>
            </div>
            <div className="rounded-lg bg-primary px-4 py-3 text-left text-white sm:text-right">
              <div className="text-xs font-black text-white/60">MATCH REPORT</div>
              <div className="mt-1 text-sm font-black">{formatDateTime(data.playedAt)}</div>
            </div>
          </div>

          <div className="min-w-0">
            <div className="text-sm font-black text-muted">{data.subtitle}</div>
            <h1 className="mt-2 break-words text-[clamp(1.75rem,7vw,3.75rem)] font-black leading-tight text-primary">
              {data.title}
            </h1>
          </div>

          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-stretch">
            <ReportSide
              sideLabel="TEAM A"
              name={data.playerAName}
              avatarUrl={data.playerAAvatarUrl}
              score={data.scoreA}
              winner={data.winnerSide === "A"}
            />
            <div className="relative grid min-w-0 place-items-center overflow-hidden rounded-lg border border-wire bg-field px-4 py-5 text-center lg:min-w-64">
              <div className="absolute -right-10 -top-10 opacity-[0.08]" aria-hidden>
                <ReportCrest name={data.winnerName} avatarUrl={winnerAvatarUrl} size="watermark" />
              </div>
              <Trophy className="relative h-8 w-8 text-board" aria-hidden />
              <div className="relative mt-2 text-xs font-black uppercase text-muted">FINAL SCORE</div>
              <div className="relative mt-1 whitespace-nowrap text-[clamp(3.4rem,16vw,6.8rem)] font-black leading-none text-primary">
                {data.scoreA}:{data.scoreB}
              </div>
              <div className="relative mt-4 flex max-w-full items-center gap-2 rounded-lg bg-surface px-3 py-2 shadow-sm">
                <ReportCrest name={data.winnerName} avatarUrl={winnerAvatarUrl} size="sm" />
                <div className="min-w-0 text-left">
                  <div className="text-[10px] font-black uppercase text-muted">WINNER</div>
                  <div className="truncate text-sm font-black text-board">{data.winnerName}</div>
                </div>
              </div>
            </div>
            <ReportSide
              sideLabel="TEAM B"
              name={data.playerBName}
              avatarUrl={data.playerBAvatarUrl}
              score={data.scoreB}
              winner={data.winnerSide === "B"}
            />
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
            {highlights.map((item) => (
              <div
                key={item.label}
                className={cn(
                  "min-w-0 rounded-lg border p-3",
                  item.accent ? "border-board bg-board text-white" : "border-wire bg-surface/90"
                )}
              >
                <div className={cn("text-xs font-black", item.accent ? "text-white/70" : "text-muted")}>{item.label}</div>
                <div className="mt-2 break-words text-[clamp(1.2rem,5vw,1.85rem)] font-black leading-tight">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            <StatsPanel title={data.playerAName} stats={data.statsA} highlighted={data.winnerSide === "A"} />
            <StatsPanel title={data.playerBName} stats={data.statsB} highlighted={data.winnerSide === "B"} />
          </div>

          <div className="flex min-w-0 flex-col gap-2 border-t border-wire pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2 text-sm font-black text-muted">
              <Sparkles className="h-4 w-4 shrink-0 text-board" aria-hidden />
              <span className="truncate">Caliburn Office Darts League 2026</span>
            </div>
            <div className="text-sm font-black text-primary">FOCUS. COMPETE. WIN.</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ReportCrest({
  name,
  avatarUrl,
  size = "md",
  className
}: {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg" | "watermark";
  className?: string;
}) {
  const normalizedUrl = normalizeAvatarUrl(avatarUrl);
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-white bg-white font-black text-board shadow-[0_12px_30px_rgb(17_24_39/0.18)] ring-1 ring-board/20",
        size === "sm" && "h-11 w-11 rounded-xl text-sm",
        size === "md" && "h-16 w-16 text-xl sm:h-20 sm:w-20",
        size === "lg" && "h-20 w-20 text-2xl sm:h-28 sm:w-28",
        size === "watermark" && "h-44 w-44 rounded-[2rem] border-0 text-6xl shadow-none ring-0",
        className
      )}
      aria-hidden
    >
      {normalizedUrl ? (
        <img src={normalizedUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="grid h-full w-full place-items-center bg-field">{participantInitial(name)}</span>
      )}
    </div>
  );
}

function ReportSide({
  sideLabel,
  name,
  avatarUrl,
  score,
  winner
}: {
  sideLabel: string;
  name: string;
  avatarUrl?: string | null;
  score: number;
  winner: boolean;
}) {
  return (
    <div
      className={cn(
        "relative min-w-0 overflow-hidden rounded-lg border p-3 sm:p-4",
        winner ? "border-board bg-board text-white shadow-[0_18px_45px_rgb(var(--color-board)/0.22)]" : "border-wire bg-surface/90"
      )}
    >
      <div className="absolute -bottom-16 -right-12 opacity-[0.08]" aria-hidden>
        <ReportCrest name={name} avatarUrl={avatarUrl} size="watermark" />
      </div>
      <div className="relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <ReportCrest name={name} avatarUrl={avatarUrl} size="lg" />
        <div className="min-w-0">
          <div className={cn("text-xs font-black", winner ? "text-white/70" : "text-muted")}>
            {winner ? "VICTORY" : sideLabel}
          </div>
          <div className="mt-1 break-words text-lg font-black leading-tight sm:text-2xl">{name}</div>
        </div>
        <div className="text-[clamp(3rem,15vw,5.4rem)] font-black leading-none">{score}</div>
      </div>
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
    <div className={cn("min-w-0 rounded-lg border p-3 sm:p-4", highlighted ? "border-board/40 bg-field" : "border-wire bg-surface/90")}>
      <div className="flex min-w-0 items-center gap-2">
        {highlighted ? <Crown className="h-4 w-4 shrink-0 text-board" aria-hidden /> : <Gauge className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
        <h2 className="min-w-0 truncate text-base font-black">{title}</h2>
      </div>
      <dl className="mt-3 grid min-w-0 grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-5">
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg bg-white/75 p-2">
            <dt className="truncate text-muted">{label}</dt>
            <dd className="mt-1 truncate font-black text-primary">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
