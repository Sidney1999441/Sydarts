import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, FileImage, ListChecks, UserRound } from "lucide-react";
import { confirmCasualMatchAction } from "@/lib/actions/matches";
import { calculateDartStats, type ScoreTurn } from "@/lib/algorithms/scoring";
import { requireUser } from "@/lib/auth/guards";
import { getMatchRulesSummary } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, formatDateTime } from "@/lib/utils";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PlayerIdentity } from "@/components/ui/PlayerIdentity";

export const dynamic = "force-dynamic";

type SoftDisplayStats = {
  averageScore?: number;
  averageMpr?: number;
  countTon80?: number;
  countHatTrick?: number;
  countWhiteHorse?: number;
  totalMarks?: number;
  count5Marks?: number;
  count6Marks?: number;
  count7Marks?: number;
  count9Marks?: number;
};

type DartStats = ReturnType<typeof calculateDartStats> & SoftDisplayStats;
type DetailTurn = ScoreTurn & { playerName: string };

type DbParticipant = {
  id: string;
  display_name: string;
  user_id?: string | null;
  team_id?: string | null;
};
type StatsBucket = "participantStats" | "personalStats" | "memberStats" | "userStats";
type CasualSide = "A" | "B";
type CasualTurnMeta = {
  turnNumber?: number;
  side?: CasualSide;
  legNumber?: number;
  userId?: string | null;
  userName?: string | null;
};
type CasualMember = {
  userId?: string | null;
  name?: string | null;
  linked?: boolean | null;
};

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeDartStats(value?: Partial<DartStats> | null): DartStats {
  const empty = calculateDartStats([]);
  return {
    ...empty,
    ...value,
    turnsThrown: toNumber(value?.turnsThrown),
    totalScoredPoints: toNumber(value?.totalScoredPoints),
    totalDarts: toNumber(value?.totalDarts),
    averagePer3Darts: toNumber(value?.averagePer3Darts),
    highestTurnScore: toNumber(value?.highestTurnScore),
    bustCount: toNumber(value?.bustCount),
    checkoutCount: toNumber(value?.checkoutCount),
    highestCheckout: toNumber(value?.highestCheckout),
    countHighCheckout: toNumber(value?.countHighCheckout),
    count60Plus: toNumber(value?.count60Plus),
    count80Plus: toNumber(value?.count80Plus),
    count180: toNumber(value?.count180),
    count100Plus: toNumber(value?.count100Plus),
    count140Plus: toNumber(value?.count140Plus),
    count170Plus: toNumber(value?.count170Plus),
    averageScore: toNumber(value?.averageScore),
    averageMpr: toNumber(value?.averageMpr),
    countTon80: toNumber(value?.countTon80),
    countHatTrick: toNumber(value?.countHatTrick),
    countWhiteHorse: toNumber(value?.countWhiteHorse),
    totalMarks: toNumber(value?.totalMarks),
    count5Marks: toNumber(value?.count5Marks),
    count6Marks: toNumber(value?.count6Marks),
    count7Marks: toNumber(value?.count7Marks),
    count9Marks: toNumber(value?.count9Marks),
    checkoutScore: value?.checkoutScore ?? null
  };
}

function readStatsEntryFromDetails(details: unknown, key: string, bucket: StatsBucket = "participantStats") {
  const stats = (details as {
    participantStats?: Record<string, Partial<DartStats>>;
    personalStats?: Record<string, Partial<DartStats>>;
    memberStats?: Record<string, Partial<DartStats>>;
    userStats?: Record<string, Partial<DartStats>>;
  } | null)?.[bucket];
  return stats?.[key] ? normalizeDartStats(stats[key]) : null;
}

function readStatsFromDetails(details: unknown, key: string, bucket: StatsBucket = "participantStats") {
  return readStatsEntryFromDetails(details, key, bucket) || normalizeDartStats();
}

function readCasualTurnMeta(details: unknown) {
  return (
    (details as { turnMeta?: CasualTurnMeta[] } | null)?.turnMeta?.filter((item) => item.turnNumber && item.side) ||
    []
  );
}

function readCasualMemberSide(details: unknown, userId: string): CasualSide | null {
  const participantMembers = (details as { participantMembers?: { A?: CasualMember[]; B?: CasualMember[] } } | null)
    ?.participantMembers;
  if (participantMembers?.A?.some((member) => member.linked && member.userId === userId)) return "A";
  if (participantMembers?.B?.some((member) => member.linked && member.userId === userId)) return "B";
  return null;
}

function statsFromTurns(turns: ScoreTurn[]) {
  return normalizeDartStats(calculateDartStats(turns));
}

function mapOfficialTurn(row: {
  participant_id: string;
  user_id?: string | null;
  score: number;
  darts?: number | null;
  remaining_before: number;
  remaining_after: number;
  is_bust: boolean;
  is_checkout: boolean;
  leg_number?: number | null;
}, playerName: string): DetailTurn {
  return {
    participantId: row.participant_id,
    userId: row.user_id || undefined,
    legNumber: row.leg_number || 1,
    score: row.score,
    darts: row.darts || 3,
    remainingBefore: row.remaining_before,
    remainingAfter: row.remaining_after,
    isBust: row.is_bust,
    isCheckout: row.is_checkout,
    playerName
  };
}

function mapCasualTurn(row: {
  side: "A" | "B";
  turn_number?: number | null;
  score: number;
  darts?: number | null;
  remaining_before: number;
  remaining_after: number;
  is_bust: boolean;
  is_checkout: boolean;
}, playerName: string, meta?: CasualTurnMeta): DetailTurn {
  const userName = meta?.userName || null;
  return {
    participantId: row.side,
    userId: meta?.userId || undefined,
    legNumber: meta?.legNumber || 1,
    score: row.score,
    darts: row.darts || 3,
    remainingBefore: row.remaining_before,
    remainingAfter: row.remaining_after,
    isBust: row.is_bust,
    isCheckout: row.is_checkout,
    playerName: userName ? `${playerName} · ${userName}` : playerName
  };
}

export default async function ProfileHistoryDetailPage({
  params
}: {
  params: Promise<{ source: string; id: string }>;
}) {
  if (!hasSupabaseEnv()) return <SetupNotice />;

  const { source, id } = await params;
  const { user } = await requireUser();
  const supabase = await createSupabaseServerClient();

  if (source === "official") {
    const [{ data: match }, { data: teamMemberships }] = await Promise.all([
      supabase
        .from("matches")
        .select("id, tournament_id, stage, round_number, match_number, participant_a_id, participant_b_id, winner_participant_id, status, score_a, score_b, dart_mode, game_variant, details, created_at, updated_at")
        .eq("id", id)
        .maybeSingle(),
      supabase.from("team_members").select("team_id").eq("user_id", user.id)
    ]);
    if (!match) notFound();

    const participantIds = [match.participant_a_id, match.participant_b_id].filter(Boolean) as string[];
    const [{ data: participants }, { data: turns }, { data: tournament }] = await Promise.all([
      participantIds.length > 0
        ? supabase.from("tournament_participants").select("id, display_name, user_id, team_id").in("id", participantIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from("match_turns")
        .select("match_id, participant_id, user_id, turn_number, score, darts, remaining_before, remaining_after, is_bust, is_checkout, leg_number")
        .eq("match_id", id)
        .order("turn_number", { ascending: true }),
      supabase.from("tournaments").select("id, name").eq("id", match.tournament_id).maybeSingle()
    ]);

    const teamIds = new Set((teamMemberships || []).map((item) => item.team_id));
    const participantRows = (participants || []) as DbParticipant[];
    const myParticipant = participantRows.find(
      (participant) => participant.user_id === user.id || (participant.team_id ? teamIds.has(participant.team_id) : false)
    );
    if (!myParticipant) notFound();

    const opponentParticipantId =
      myParticipant.id === match.participant_a_id ? match.participant_b_id : match.participant_a_id;
    const opponent = participantRows.find((participant) => participant.id === opponentParticipantId) || null;
    const avatarTeamIds = [...new Set(participantRows.map((participant) => participant.team_id).filter(Boolean))] as string[];
    const { data: avatarTeamMembers } =
      avatarTeamIds.length > 0
        ? await supabase.from("team_members").select("team_id, user_id").in("team_id", avatarTeamIds)
        : { data: [] };
    const avatarUserIds = [
      ...new Set([
        ...participantRows.map((participant) => participant.user_id).filter(Boolean),
        ...(avatarTeamMembers || []).map((member) => member.user_id)
      ])
    ] as string[];
    const { data: avatarProfiles } =
      avatarUserIds.length > 0
        ? await supabase.from("profiles").select("id, avatar_url").in("id", avatarUserIds)
        : { data: [] };
    const avatarByUserId = new Map((avatarProfiles || []).map((profile) => [profile.id, profile.avatar_url]));
    function participantAvatarUrl(participant?: DbParticipant | null) {
      if (!participant) return null;
      if (participant.user_id) return avatarByUserId.get(participant.user_id) || null;
      return (
        (avatarTeamMembers || [])
          .filter((member) => member.team_id === participant.team_id)
          .map((member) => avatarByUserId.get(member.user_id) || null)
          .find(Boolean) || null
      );
    }
    const myScore = myParticipant.id === match.participant_a_id ? match.score_a : match.score_b;
    const opponentScore = myParticipant.id === match.participant_a_id ? match.score_b : match.score_a;
    const matchTurns = (turns || []).map((turn) =>
      mapOfficialTurn(
        turn,
        turn.user_id === user.id
          ? `${participantRows.find((participant) => participant.id === turn.participant_id)?.display_name || "我方"} / 我`
          : participantRows.find((participant) => participant.id === turn.participant_id)?.display_name || "选手"
      )
    );
    const hasPersonalTurns = matchTurns.some((turn) => Boolean(turn.userId));
    const myTurns = hasPersonalTurns
      ? matchTurns.filter((turn) => turn.userId === user.id)
      : matchTurns.filter((turn) => turn.participantId === myParticipant.id);
    const opponentTurns = opponentParticipantId
      ? matchTurns.filter((turn) => turn.participantId === opponentParticipantId)
      : [];
    const userStats = readStatsFromDetails(match.details, user.id, "userStats");
    const hasUserStats =
      toNumber(userStats.averagePer3Darts) > 0 ||
      toNumber(userStats.averageScore) > 0 ||
      toNumber(userStats.averageMpr) > 0;

    return (
      <HistoryDetailView
        title={tournament?.name || "赛事比赛"}
        subtitle={`${match.stage === "group" ? "小组赛" : `淘汰赛 R${match.round_number}`} / ${getMatchRulesSummary({
          dartMode: match.dart_mode,
          gameVariant: match.game_variant,
          legRules: (match.details as { legRules?: unknown } | null)?.legRules
        })}`}
        playedAt={match.updated_at || match.created_at}
        result={match.winner_participant_id === myParticipant.id ? "胜" : "负"}
        scoreLabel={`${myScore}:${opponentScore}`}
        myName={myParticipant.display_name || "我方"}
        opponentName={opponent?.display_name || "对手"}
        myAvatarUrl={participantAvatarUrl(myParticipant)}
        opponentAvatarUrl={participantAvatarUrl(opponent)}
        myStats={myTurns.length > 0 ? statsFromTurns(myTurns) : hasUserStats ? userStats : readStatsFromDetails(match.details, myParticipant.id)}
        opponentStats={
          opponentTurns.length > 0
            ? statsFromTurns(opponentTurns)
            : opponentParticipantId
              ? readStatsFromDetails(match.details, opponentParticipantId)
              : normalizeDartStats()
        }
        turns={matchTurns}
        extraHref={`/tournaments/${match.tournament_id}`}
        extraLabel="打开赛事"
        reportHref={`/reports/official/${match.id}`}
      />
    );
  }

  if (source === "casual") {
    const { data: match } = await supabase.from("casual_matches").select("*").eq("id", id).maybeSingle();
    if (!match) notFound();
    const casualMemberSide = readCasualMemberSide(match.details, user.id);
    const isPlayerA = match.player_a_user_id === user.id || casualMemberSide === "A";
    const isPlayerB = match.player_b_user_id === user.id || casualMemberSide === "B";
    if (!isPlayerA && !isPlayerB && match.created_by !== user.id) notFound();

    const { data: turns } = await supabase
      .from("casual_match_turns")
      .select("casual_match_id, side, turn_number, score, darts, remaining_before, remaining_after, is_bust, is_checkout")
      .eq("casual_match_id", id)
      .order("turn_number", { ascending: true });
    const mySide: CasualSide = casualMemberSide || (isPlayerA ? "A" : "B");
    const opponentSide: CasualSide = mySide === "A" ? "B" : "A";
    const turnMeta = readCasualTurnMeta(match.details);
    const matchTurns = (turns || []).map((turn) => {
      const meta = turnMeta.find((item) => item.side === turn.side && item.turnNumber === turn.turn_number);
      return mapCasualTurn(turn, turn.side === "A" ? match.player_a_name : match.player_b_name, meta);
    });
    const myTurns = matchTurns.filter((turn) => turn.participantId === mySide);
    const opponentTurns = matchTurns.filter((turn) => turn.participantId === opponentSide);
    const myPersonalStats = readStatsEntryFromDetails(match.details, mySide, "personalStats");
    const opponentPersonalStats = readStatsEntryFromDetails(match.details, opponentSide, "personalStats");
    const myMemberStats = readStatsEntryFromDetails(match.details, user.id, "memberStats");
    const result =
      match.confirmation_status === "rejected"
        ? "争议"
        : match.confirmation_status === "pending" && !isPlayerA
          ? "待确认"
          : match.winner_side === mySide
            ? "胜"
            : "负";
    const casualAvatarUserIds = [match.player_a_user_id, match.player_b_user_id].filter(Boolean) as string[];
    const { data: casualAvatarProfiles } =
      casualAvatarUserIds.length > 0
        ? await supabase.from("profiles").select("id, avatar_url").in("id", casualAvatarUserIds)
        : { data: [] };
    const casualAvatarByUserId = new Map((casualAvatarProfiles || []).map((profile) => [profile.id, profile.avatar_url]));
    const avatarA = match.player_a_user_id ? casualAvatarByUserId.get(match.player_a_user_id) || null : null;
    const avatarB = match.player_b_user_id ? casualAvatarByUserId.get(match.player_b_user_id) || null : null;

    return (
      <HistoryDetailView
        title={`${match.player_a_name} vs ${match.player_b_name}`}
        subtitle={match.confirmation_status === "pending" ? "待确认切磋" : "普通切磋"}
        playedAt={match.created_at}
        result={result}
        scoreLabel={mySide === "A" ? `${match.score_a}:${match.score_b}` : `${match.score_b}:${match.score_a}`}
        myName={mySide === "A" ? match.player_a_name : match.player_b_name}
        opponentName={mySide === "A" ? match.player_b_name : match.player_a_name}
        myAvatarUrl={mySide === "A" ? avatarA : avatarB}
        opponentAvatarUrl={mySide === "A" ? avatarB : avatarA}
        myStats={myMemberStats || myPersonalStats || (myTurns.length > 0 ? statsFromTurns(myTurns) : readStatsFromDetails(match.details, mySide))}
        opponentStats={
          opponentPersonalStats || (opponentTurns.length > 0 ? statsFromTurns(opponentTurns) : readStatsFromDetails(match.details, opponentSide))
        }
        turns={matchTurns}
        reportHref={`/reports/casual/${match.id}`}
        confirmationSlot={
          match.player_b_user_id === user.id && match.confirmation_status === "pending" ? (
            <CasualConfirmationActions matchId={match.id} />
          ) : null
        }
      />
    );
  }

  notFound();
}

function HistoryDetailView({
  title,
  subtitle,
  playedAt,
  result,
  scoreLabel,
  myName,
  opponentName,
  myAvatarUrl,
  opponentAvatarUrl,
  myStats,
  opponentStats,
  turns,
  extraHref,
  extraLabel,
  reportHref,
  confirmationSlot
}: {
  title: string;
  subtitle: string;
  playedAt: string;
  result: "胜" | "负" | "待确认" | "争议";
  scoreLabel: string;
  myName: string;
  opponentName: string;
  myAvatarUrl?: string | null;
  opponentAvatarUrl?: string | null;
  myStats: DartStats;
  opponentStats: DartStats;
  turns: DetailTurn[];
  extraHref?: string;
  extraLabel?: string;
  reportHref?: string;
  confirmationSlot?: ReactNode;
}) {
  return (
    <div className="grid gap-5">
      <CodlPageHeader
        kicker="Match History"
        title="战绩详情"
        description={`${myName} vs ${opponentName} · ${scoreLabel} · ${formatDateTime(playedAt)}`}
        icon={<UserRound className="h-6 w-6" aria-hidden />}
        art="white"
        actions={
          <div className="grid gap-2 sm:flex">
            {reportHref ? (
              <Link
                className="inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg bg-board px-4 text-sm font-black text-white shadow-soft"
                href={reportHref}
              >
                <FileImage className="h-4 w-4" aria-hidden />
                CODL 战报
              </Link>
            ) : null}
            <Link
              className="inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg border border-wire bg-surface px-4 text-sm font-black text-board shadow-soft"
              href="/profile"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              返回个人页
            </Link>
          </div>
        }
      />

      <Card>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="min-w-0">
            <div className="text-sm font-bold text-muted">{subtitle}</div>
            <h2 className="mt-1 break-words text-xl font-black text-primary">{title}</h2>
            <p className="mt-1 text-sm text-muted">{formatDateTime(playedAt)}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
              <PlayerIdentity name={myName} avatarUrl={myAvatarUrl} subtitle="我方" size="md" compact />
              <div className="rounded-full bg-board px-3 py-1 text-center text-sm font-black text-white">{scoreLabel}</div>
              <PlayerIdentity name={opponentName} avatarUrl={opponentAvatarUrl} subtitle="对手" size="md" compact />
            </div>
          </div>
          <div className="rounded-lg bg-field p-4 text-center">
            <div
              className={cn(
                "text-2xl font-black",
                result === "胜" ? "text-emerald-700" : result === "负" ? "text-red-700" : "text-amber-700"
              )}
            >
              {result}
            </div>
            <div className="mt-1 text-lg font-black text-board">{scoreLabel}</div>
          </div>
        </div>
        {extraHref ? (
          <Link className="mt-4 inline-flex text-sm font-bold text-board underline" href={extraHref}>
            {extraLabel || "打开关联页面"}
          </Link>
        ) : null}
        {confirmationSlot ? <div className="mt-4">{confirmationSlot}</div> : null}
      </Card>

      <section className="grid gap-3 lg:grid-cols-2">
        <PlayerSummary title="我方数据" name={myName} avatarUrl={myAvatarUrl} stats={myStats} highlight />
        <PlayerSummary title="对手数据" name={opponentName} avatarUrl={opponentAvatarUrl} stats={opponentStats} />
      </section>

      <Card>
        <div className="mb-3 flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-board" aria-hidden />
          <h2 className="text-lg font-bold">战局回顾</h2>
        </div>
        {turns.length > 0 ? (
          <div className="grid max-h-[70vh] touch-pan-y gap-2 overflow-y-auto overscroll-contain rounded-lg bg-field p-3 sm:grid-cols-2 lg:grid-cols-3">
            {turns.map((turn, index) => (
              <div
                key={`${turn.participantId}-${index}`}
                className={cn(
                  "rounded-lg border bg-surface px-3 py-2 text-xs",
                  turn.isCheckout ? "border-emerald-300" : turn.isBust ? "border-red-200" : "border-wire"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{turn.playerName}</span>
                  <span className="font-bold">{turn.score}</span>
                </div>
                <div className="mt-1 flex justify-between text-muted">
                  <span>L{turn.legNumber} · {turn.darts || 3} 镖</span>
                  <span>{turn.isBust ? "爆镖" : turn.isCheckout ? "结镖" : `剩 ${turn.remainingAfter}`}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg bg-field p-3 text-sm text-muted">
            这场没有逐轮计分明细，通常是手动录入或旧数据。
          </p>
        )}
      </Card>
    </div>
  );
}

function CasualConfirmationActions({ matchId }: { matchId: string }) {
  return (
    <div className="grid gap-2 rounded-lg border border-board/25 bg-field p-3 text-sm sm:flex sm:items-center sm:justify-between">
      <div className="font-bold text-ink">确认后会写入你的普通数据和等级分。</div>
      <div className="grid gap-2 sm:flex">
        <form action={confirmCasualMatchAction}>
          <input type="hidden" name="casual_match_id" value={matchId} />
          <input type="hidden" name="decision" value="confirmed" />
          <Button className="w-full sm:w-auto" type="submit">确认写入</Button>
        </form>
        <form action={confirmCasualMatchAction}>
          <input type="hidden" name="casual_match_id" value={matchId} />
          <input type="hidden" name="decision" value="rejected" />
          <Button className="w-full sm:w-auto" type="submit" variant="secondary">拒绝</Button>
        </form>
      </div>
    </div>
  );
}

function PlayerSummary({
  title,
  name,
  avatarUrl,
  stats,
  highlight
}: {
  title: string;
  name: string;
  avatarUrl?: string | null;
  stats: DartStats;
  highlight?: boolean;
}) {
  return (
    <Card className={cn(highlight && "border-board/30 bg-field")}>
      <div className="mb-3">
        <div className="text-sm font-bold">{title}</div>
        <PlayerIdentity className="mt-2" name={name} avatarUrl={avatarUrl} size="sm" compact />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <Metric label="均分" value={stats.averagePer3Darts.toFixed(1)} />
        <Metric label="最高轮" value={stats.highestTurnScore} />
        <Metric label="最高结镖" value={stats.highestCheckout} />
        {stats.averageScore ? <Metric label="软镖均分" value={stats.averageScore.toFixed(1)} /> : null}
        {stats.averageMpr ? <Metric label="MPR" value={stats.averageMpr.toFixed(2)} /> : null}
        {stats.totalMarks ? <Metric label="总标数" value={stats.totalMarks} /> : null}
        {stats.count9Marks ? <Metric label="9 Mark" value={stats.count9Marks} /> : null}
        <Metric label="高拆" value={stats.countHighCheckout} />
        {stats.countTon80 ? <Metric label="TON80" value={stats.countTon80} /> : null}
        {stats.countHatTrick ? <Metric label="帽子" value={stats.countHatTrick} /> : null}
        {stats.countWhiteHorse ? <Metric label="白马" value={stats.countWhiteHorse} /> : null}
        <Metric label="100+" value={stats.count100Plus} />
        <Metric label="140+" value={stats.count140Plus} />
        <Metric label="170+" value={stats.count170Plus} />
        <Metric label="180" value={stats.count180} />
        <Metric label="爆镖" value={stats.bustCount} />
      </dl>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-surface/70 p-2.5 sm:p-3">
      <dt className="text-muted">{label}</dt>
      <dd className="mt-1 font-bold text-ink">{value}</dd>
    </div>
  );
}
