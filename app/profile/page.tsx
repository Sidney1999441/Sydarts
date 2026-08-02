import Link from "next/link";
import { UserRound } from "lucide-react";
import { confirmCasualMatchAction, confirmManualResultAction } from "@/lib/actions/matches";
import { updateSavedTeamProfileAction } from "@/lib/actions/teams";
import { calculatePlayerLevel, type PlayerLevelStats, type SoftPlayerLevelStats } from "@/lib/algorithms/player-level";
import { requireUser } from "@/lib/auth/guards";
import { getMatchRulesSummary } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, formatDateTime } from "@/lib/utils";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { LevelExplanation } from "@/components/LevelExplanation";
import { AvatarUploader } from "@/components/ui/AvatarUploader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

type DbStats = {
  matches_played?: number | null;
  wins?: number | null;
  losses?: number | null;
  legs_played?: number | null;
  legs_won?: number | null;
  legs_lost?: number | null;
  total_scored_points?: number | null;
  total_darts?: number | null;
  average_per_3_darts?: number | string | null;
  highest_turn_score?: number | null;
  bust_count?: number | null;
  checkout_count?: number | null;
  highest_checkout?: number | null;
  count_high_checkout?: number | null;
  count_80_plus?: number | null;
  count_100_plus?: number | null;
  count_140_plus?: number | null;
  count_170_plus?: number | null;
  count_180?: number | null;
  current_rating?: number | null;
};

type DbSoftStats = {
  matches_played?: number | null;
  wins?: number | null;
  losses?: number | null;
  legs_played?: number | null;
  legs_won?: number | null;
  legs_lost?: number | null;
  average_score?: number | string | null;
  average_mpr?: number | string | null;
  highest_checkout?: number | null;
  count_high_checkout?: number | null;
  count_ton80?: number | null;
  count_hat_trick?: number | null;
  count_white_horse?: number | null;
  total_marks?: number | null;
  count_5_marks?: number | null;
  count_6_marks?: number | null;
  count_7_marks?: number | null;
  count_9_marks?: number | null;
  current_rating?: number | null;
};

type MatchHistoryItem = {
  id: string;
  source: "赛事" | "切磋";
  title: string;
  href?: string;
  detailHref: string;
  playedAt: string;
  result: "胜" | "负" | "待确认" | "争议";
  statusLabel: string;
  scoreLabel: string;
  myName: string;
  opponentName: string;
};

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function percent(part: number | null | undefined, total: number | null | undefined) {
  const totalValue = toNumber(total);
  if (totalValue <= 0) return 0;
  return Math.round((toNumber(part) / totalValue) * 100);
}

function toLevelStats(stats?: DbStats | null): PlayerLevelStats {
  return {
    matchesPlayed: toNumber(stats?.matches_played),
    wins: toNumber(stats?.wins),
    losses: toNumber(stats?.losses),
    legsPlayed: toNumber(stats?.legs_played),
    legsWon: toNumber(stats?.legs_won),
    totalScoredPoints: toNumber(stats?.total_scored_points),
    totalDarts: toNumber(stats?.total_darts),
    averagePer3Darts: toNumber(stats?.average_per_3_darts),
    highestTurnScore: toNumber(stats?.highest_turn_score),
    highestCheckout: toNumber(stats?.highest_checkout),
    bustCount: toNumber(stats?.bust_count),
    countHighCheckout: toNumber(stats?.count_high_checkout),
    count80Plus: toNumber(stats?.count_80_plus),
    count100Plus: toNumber(stats?.count_100_plus),
    count140Plus: toNumber(stats?.count_140_plus),
    count170Plus: toNumber(stats?.count_170_plus),
    count180: toNumber(stats?.count_180)
  };
}

function toSoftLevelStats(stats?: DbSoftStats | null): SoftPlayerLevelStats {
  return {
    matchesPlayed: toNumber(stats?.matches_played),
    wins: toNumber(stats?.wins),
    losses: toNumber(stats?.losses),
    legsPlayed: toNumber(stats?.legs_played),
    legsWon: toNumber(stats?.legs_won),
    averageScore: toNumber(stats?.average_score),
    averageMpr: toNumber(stats?.average_mpr),
    highestCheckout: toNumber(stats?.highest_checkout),
    countHighCheckout: toNumber(stats?.count_high_checkout),
    countTon80: toNumber(stats?.count_ton80),
    countHatTrick: toNumber(stats?.count_hat_trick),
    countWhiteHorse: toNumber(stats?.count_white_horse)
  };
}

export default async function ProfilePage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;

  const { user, profile } = await requireUser();
  const supabase = await createSupabaseServerClient();
  const [
    { data: tournamentStats },
    { data: generalStats },
    { data: softStats },
    { data: registrations },
    { data: confirmations },
    { data: pendingCasualMatches },
    { data: teamMemberships },
    { data: savedTeams }
  ] = await Promise.all([
    supabase.from("user_stats").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("general_user_stats").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("soft_user_stats").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("tournament_registrations")
      .select("id, status, tournament_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("match_result_confirmations")
      .select("id, match_id, submitted_by, proposed_winner_participant_id, proposed_score_a, proposed_score_b, status, created_at")
      .eq("required_confirm_by", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("casual_matches")
      .select("*")
      .eq("player_b_user_id", user.id)
      .eq("confirmation_status", "pending")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("team_members").select("team_id").eq("user_id", user.id),
    supabase
      .from("saved_teams")
      .select("id, name, avatar_url, status, created_at, updated_at")
      .eq("captain_user_id", user.id)
      .order("updated_at", { ascending: false })
  ]);

  const teamIds = (teamMemberships || []).map((item) => item.team_id);
  const participantFilters = [`user_id.eq.${user.id}`];
  if (teamIds.length > 0) participantFilters.push(`team_id.in.(${teamIds.join(",")})`);

  const { data: myParticipants } = await supabase
    .from("tournament_participants")
    .select("id, display_name")
    .or(participantFilters.join(","));

  const myParticipantIds = (myParticipants || []).map((participant) => participant.id);
  const myParticipantIdSet = new Set(myParticipantIds);
  const { data: officialMatches } =
    myParticipantIds.length > 0
      ? await supabase
          .from("matches")
          .select("id, tournament_id, stage, round_number, match_number, participant_a_id, participant_b_id, winner_participant_id, status, score_a, score_b, dart_mode, game_variant, details, created_at, updated_at")
          .or(`participant_a_id.in.(${myParticipantIds.join(",")}),participant_b_id.in.(${myParticipantIds.join(",")})`)
          .eq("status", "completed")
          .order("updated_at", { ascending: false })
          .limit(30)
      : { data: [] };

  const { data: casualMatches } = await supabase
    .from("casual_matches")
    .select("*")
    .or(`created_by.eq.${user.id},player_a_user_id.eq.${user.id},player_b_user_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(30);

  const officialParticipantIds = [
    ...new Set(
      (officialMatches || [])
        .flatMap((match) => [match.participant_a_id, match.participant_b_id])
        .filter(Boolean)
    )
  ] as string[];
  const tournamentIds = [
    ...new Set([
      ...(officialMatches || []).map((match) => match.tournament_id),
      ...(registrations || []).map((registration) => registration.tournament_id)
    ])
  ];

  const [
    { data: officialParticipants },
    { data: tournaments },
    { data: confirmationMatches }
  ] = await Promise.all([
    officialParticipantIds.length > 0
      ? supabase.from("tournament_participants").select("id, display_name").in("id", officialParticipantIds)
      : Promise.resolve({ data: [] }),
    tournamentIds.length > 0
      ? supabase.from("tournaments").select("id, name").in("id", tournamentIds)
      : Promise.resolve({ data: [] }),
    (confirmations || []).length > 0
      ? supabase
          .from("matches")
          .select("id, tournament_id, participant_a_id, participant_b_id")
          .in("id", (confirmations || []).map((confirmation) => confirmation.match_id))
      : Promise.resolve({ data: [] })
  ]);

  const confirmationParticipantIds = [
    ...new Set(
      (confirmationMatches || [])
        .flatMap((match) => [match.participant_a_id, match.participant_b_id])
        .filter(Boolean)
    )
  ] as string[];
  const { data: confirmationParticipants } =
    confirmationParticipantIds.length > 0
      ? await supabase
          .from("tournament_participants")
          .select("id, display_name")
          .in("id", confirmationParticipantIds)
      : { data: [] };

  const participantById = new Map(
    [...(officialParticipants || []), ...(confirmationParticipants || [])].map((participant) => [
      participant.id,
      participant
    ])
  );
  const tournamentById = new Map((tournaments || []).map((tournament) => [tournament.id, tournament]));
  const confirmationMatchById = new Map((confirmationMatches || []).map((match) => [match.id, match]));

  const tournamentRating = profile?.tournament_rating ?? profile?.rating ?? 1000;
  const casualRating = profile?.casual_rating ?? profile?.rating ?? 1000;
  const softRating = profile?.soft_rating ?? profile?.rating ?? 1000;
  const tournamentLevel = calculatePlayerLevel({
    rating: tournamentRating,
    stats: toLevelStats(tournamentStats),
    softRating,
    softStats: toSoftLevelStats(softStats)
  });
  const generalLevel = calculatePlayerLevel({
    rating: casualRating,
    stats: toLevelStats(generalStats),
    softRating,
    softStats: toSoftLevelStats(softStats)
  });
  const history = [
    ...(officialMatches || []).flatMap((match): MatchHistoryItem[] => {
      const myParticipantId =
        [match.participant_a_id, match.participant_b_id].find((participantId) =>
          participantId ? myParticipantIdSet.has(participantId) : false
        ) || null;
      if (!myParticipantId) return [];
      const opponentParticipantId =
        myParticipantId === match.participant_a_id ? match.participant_b_id : match.participant_a_id;
      const myName = participantById.get(myParticipantId)?.display_name || "我方";
      const opponentName = opponentParticipantId
        ? participantById.get(opponentParticipantId)?.display_name || "对手"
        : "对手";
      const myScore = myParticipantId === match.participant_a_id ? match.score_a : match.score_b;
      const opponentScore = myParticipantId === match.participant_a_id ? match.score_b : match.score_a;

      return [
        {
          id: match.id,
          source: "赛事",
          title: tournamentById.get(match.tournament_id)?.name || "赛事比赛",
          href: `/tournaments/${match.tournament_id}`,
          detailHref: `/profile/history/official/${match.id}`,
          playedAt: match.updated_at || match.created_at,
          result: match.winner_participant_id === myParticipantId ? "胜" : "负",
          statusLabel: `${match.stage === "group" ? "小组赛" : `淘汰赛 R${match.round_number}`} / ${getMatchRulesSummary({
            dartMode: match.dart_mode,
            gameVariant: match.game_variant,
            legRules: (match.details as { legRules?: unknown } | null)?.legRules
          })}`,
          scoreLabel: `${myScore}:${opponentScore}`,
          myName,
          opponentName
        }
      ];
    }),
    ...(casualMatches || []).map((match): MatchHistoryItem => {
      const isPlayerA = match.player_a_user_id === user.id;
      const mySide = isPlayerA ? "A" : "B";
      const statusLabel =
        match.confirmation_status === "pending"
          ? "待对手确认"
          : match.confirmation_status === "rejected"
            ? "对手已拒绝"
            : "已记录";
      const result =
        match.confirmation_status === "rejected"
          ? "争议"
          : match.confirmation_status === "pending" && !isPlayerA
            ? "待确认"
            : match.winner_side === mySide
              ? "胜"
              : "负";

      return {
        id: match.id,
        source: "切磋",
        title: `${match.player_a_name} vs ${match.player_b_name}`,
        detailHref: `/profile/history/casual/${match.id}`,
        playedAt: match.created_at,
        result,
        statusLabel,
        scoreLabel: isPlayerA ? `${match.score_a}:${match.score_b}` : `${match.score_b}:${match.score_a}`,
        myName: isPlayerA ? match.player_a_name : match.player_b_name,
        opponentName: isPlayerA ? match.player_b_name : match.player_a_name
      };
    })
  ]
    .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime())
    .slice(0, 30);
  const pendingActionCount = (confirmations || []).length + (pendingCasualMatches || []).length;

  return (
    <div className="grid gap-5 sm:gap-6">
      <CodlPageHeader
        kicker={`UID ${profile?.uid || "------"}`}
        title="个人中心"
        description={`${profile?.display_name || user.email} · 普通 ${generalLevel.label} · 赛事 ${tournamentLevel.label}`}
        icon={<UserRound className="h-6 w-6" aria-hidden />}
        art="white"
        actions={
          <div className="rounded-lg border border-wire bg-surface/95 p-3">
            <AvatarUploader
              entityType="profile"
              entityId={user.id}
              initialUrl={profile?.avatar_url}
              fallback={profile?.display_name || user.email || "U"}
              label="更换头像"
              size="lg"
            />
          </div>
        }
      />

      <CombinedStatsPanel
        generalStats={generalStats}
        tournamentStats={tournamentStats}
        softStats={softStats}
        generalLevel={generalLevel}
        tournamentLevel={tournamentLevel}
      />

      <details className="codl-mobile-fold" open={pendingActionCount > 0}>
        <summary className="cursor-pointer rounded-lg border border-wire bg-surface p-3 text-sm font-black text-board shadow-soft">
          待确认事项{pendingActionCount > 0 ? ` · ${pendingActionCount}` : ""}
        </summary>
        <section className="codl-mobile-fold-content mt-3 gap-3 sm:gap-4 lg:grid-cols-2">
          <PendingManualCard
            confirmations={confirmations || []}
            matchById={confirmationMatchById}
            participantById={participantById}
          />
          <PendingCasualCard matches={pendingCasualMatches || []} />
        </section>
      </details>

      <section>
        <div className="mb-4 grid gap-3 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">最近 30 局详细记录</h2>
            <p className="mt-1 text-sm text-muted">
              新比赛会自动排在最前面，个人页只保留最近 30 局的结算式明细。
            </p>
          </div>
          <Link className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-lg border border-wire bg-surface px-4 text-sm font-semibold text-board shadow-soft sm:border-0 sm:bg-transparent sm:px-0 sm:shadow-none sm:underline" href="/scorer/casual">
            打开切磋计分器
          </Link>
        </div>
        <div className="grid gap-4">
          {history.map((item) => (
            <HistoryCard key={`${item.source}-${item.id}`} item={item} />
          ))}
          {history.length === 0 ? (
            <Card>
              <p className="text-sm text-muted">
                还没有可展示的比赛明细。用计分器完成一局后，这里会出现类似结算页的统计回顾。
              </p>
            </Card>
          ) : null}
        </div>
      </section>

      <details className="codl-mobile-fold">
        <summary className="cursor-pointer rounded-lg border border-wire bg-surface p-3 text-sm font-black text-board shadow-soft">
          报名与长期队伍
        </summary>
        <section className="codl-mobile-fold-content mt-3 gap-3 sm:gap-4 lg:grid-cols-2">
          <RegistrationCard registrations={registrations || []} tournamentById={tournamentById} />
          <SavedTeamCaptainCard savedTeams={savedTeams || []} />
        </section>
      </details>
    </div>
  );
}

function CombinedStatsPanel({
  generalStats,
  tournamentStats,
  softStats,
  generalLevel,
  tournamentLevel
}: {
  generalStats: DbStats | null;
  tournamentStats: DbStats | null;
  softStats: DbSoftStats | null;
  generalLevel: ReturnType<typeof calculatePlayerLevel>;
  tournamentLevel: ReturnType<typeof calculatePlayerLevel>;
}) {
  const comparisonRows = [
    { label: "等级", general: `${generalLevel.level}级`, tournament: `${tournamentLevel.level}级`, strong: true },
    { label: "称号", general: generalLevel.majorRank, tournament: tournamentLevel.majorRank, strong: true },
    { label: "综合分", general: generalLevel.score, tournament: tournamentLevel.score },
    { label: "可信度", general: `${generalLevel.confidence}%`, tournament: `${tournamentLevel.confidence}%` },
    {
      label: "比赛场数",
      general: toNumber(generalStats?.matches_played),
      tournament: toNumber(tournamentStats?.matches_played)
    },
    { label: "胜场", general: toNumber(generalStats?.wins), tournament: toNumber(tournamentStats?.wins) },
    { label: "负场", general: toNumber(generalStats?.losses), tournament: toNumber(tournamentStats?.losses) },
    {
      label: "胜率",
      general: `${percent(generalStats?.wins, generalStats?.matches_played)}%`,
      tournament: `${percent(tournamentStats?.wins, tournamentStats?.matches_played)}%`
    },
    {
      label: "Legs 胜率",
      general: `${percent(generalStats?.legs_won, generalStats?.legs_played)}%`,
      tournament: `${percent(tournamentStats?.legs_won, tournamentStats?.legs_played)}%`
    },
    {
      label: "三镖均分",
      general: toNumber(generalStats?.average_per_3_darts).toFixed(1),
      tournament: toNumber(tournamentStats?.average_per_3_darts).toFixed(1),
      strong: true
    },
    {
      label: "最高单轮",
      general: toNumber(generalStats?.highest_turn_score),
      tournament: toNumber(tournamentStats?.highest_turn_score)
    },
    {
      label: "最高结镖",
      general: toNumber(generalStats?.highest_checkout),
      tournament: toNumber(tournamentStats?.highest_checkout)
    },
    {
      label: "高拆",
      general: toNumber(generalStats?.count_high_checkout),
      tournament: toNumber(tournamentStats?.count_high_checkout)
    },
    {
      label: "100+",
      general: toNumber(generalStats?.count_100_plus),
      tournament: toNumber(tournamentStats?.count_100_plus)
    },
    {
      label: "140+",
      general: toNumber(generalStats?.count_140_plus),
      tournament: toNumber(tournamentStats?.count_140_plus)
    },
    {
      label: "170+",
      general: toNumber(generalStats?.count_170_plus),
      tournament: toNumber(tournamentStats?.count_170_plus)
    },
    {
      label: "180",
      general: toNumber(generalStats?.count_180),
      tournament: toNumber(tournamentStats?.count_180)
    },
    {
      label: "爆镖",
      general: toNumber(generalStats?.bust_count),
      tournament: toNumber(tournamentStats?.bust_count)
    }
  ];

  return (
    <section className="rounded-lg border border-wire bg-surface p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">水平与统计</h2>
          <p className="mt-1 text-sm text-muted">
            普通统计包含赛事和切磋，赛事统计只计算正式比赛。
          </p>
        </div>
        <LevelExplanation compact />
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <LevelSummary
          tone="general"
          title="普通段位"
          subtitle="赛事 + 平时切磋"
          level={generalLevel}
        />
        <LevelSummary
          tone="tournament"
          title="赛事段位"
          subtitle="正式赛事，软镖低权重"
          level={tournamentLevel}
        />
      </div>
      <details className="mt-4 rounded-lg border border-wire bg-field p-3" open>
        <summary className="cursor-pointer text-sm font-black text-board">
          完整统计明细
        </summary>
        <div className="mt-3 grid gap-4">
          <div className="rounded-lg border border-wire bg-surface/80 p-4">
            <div className="text-sm font-bold">软镖赛事补充</div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-7">
              <Metric label="场次" value={toNumber(softStats?.matches_played)} />
              <Metric label="胜率" value={`${percent(softStats?.wins, softStats?.matches_played)}%`} />
              <Metric label="均分" value={toNumber(softStats?.average_score).toFixed(1)} />
              <Metric label="MPR" value={toNumber(softStats?.average_mpr).toFixed(2)} />
              <Metric label="总标数" value={toNumber(softStats?.total_marks)} />
              <Metric label="5标" value={toNumber(softStats?.count_5_marks)} />
              <Metric label="6标" value={toNumber(softStats?.count_6_marks)} />
              <Metric label="7标" value={toNumber(softStats?.count_7_marks)} />
              <Metric label="9 Mark" value={toNumber(softStats?.count_9_marks)} />
              <Metric label="TON80" value={toNumber(softStats?.count_ton80)} />
              <Metric label="帽子戏法" value={toNumber(softStats?.count_hat_trick)} />
              <Metric label="白马" value={toNumber(softStats?.count_white_horse)} />
            </dl>
          </div>
          <div className="grid gap-2 sm:hidden">
            {comparisonRows.map((row) => (
              <div key={row.label} className="rounded-lg border border-wire bg-surface p-3">
                <div className="text-sm font-semibold text-muted">{row.label}</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="min-h-16 rounded-lg bg-emerald-50 p-3">
                    <div className="text-xs font-bold text-emerald-700">普通</div>
                    <div
                      className={cn(
                        "mt-1 break-words font-bold text-emerald-800",
                        row.strong ? "text-xl" : "text-lg"
                      )}
                    >
                      {row.general}
                    </div>
                  </div>
                  <div className="min-h-16 rounded-lg bg-violet-50 p-3">
                    <div className="text-xs font-bold text-violet-700">赛事</div>
                    <div
                      className={cn(
                        "mt-1 break-words font-bold text-violet-800",
                        row.strong ? "text-xl" : "text-lg"
                      )}
                    >
                      {row.tournament}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-hidden rounded-lg border border-wire sm:block">
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-[1.15fr_0.9fr_0.9fr] bg-field px-4 py-3 text-xs font-bold text-muted">
                  <span>指标</span>
                  <span className="text-right text-emerald-700">普通统计</span>
                  <span className="text-right text-violet-700">赛事统计</span>
                </div>
                {comparisonRows.map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-[1.15fr_0.9fr_0.9fr] items-center border-t border-wire px-4 py-3 text-sm"
                  >
                    <span className="font-medium text-muted">{row.label}</span>
                    <span
                      className={cn(
                        "text-right font-semibold text-emerald-700",
                        row.strong ? "text-base" : "text-sm"
                      )}
                    >
                      {row.general}
                    </span>
                    <span
                      className={cn(
                        "text-right font-semibold text-violet-700",
                        row.strong ? "text-base" : "text-sm"
                      )}
                    >
                      {row.tournament}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}

function LevelSummary({
  tone,
  title,
  subtitle,
  level
}: {
  tone: "general" | "tournament";
  title: string;
  subtitle: string;
  level: ReturnType<typeof calculatePlayerLevel>;
}) {
  const isGeneral = tone === "general";

  return (
    <div
      className={cn(
        "rounded-lg p-4 sm:p-5",
        isGeneral
          ? "bg-emerald-50 text-emerald-950"
          : "bg-violet-50 text-violet-950"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div
            className={cn(
              "text-xs font-bold uppercase tracking-normal",
              isGeneral ? "text-emerald-700" : "text-violet-700"
            )}
          >
            {subtitle}
          </div>
          <h3 className="mt-1 text-base font-bold sm:text-lg">{title}</h3>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm opacity-70">当前段位</div>
            <div className="mt-1 text-2xl font-bold sm:text-3xl">
              {level.label}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm opacity-70">综合分</div>
            <div className="text-2xl font-bold">{level.score}</div>
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface/80">
          <div
            className={cn("h-full", isGeneral ? "bg-emerald-500" : "bg-violet-500")}
            style={{ width: `${level.progressToNext}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs opacity-70">
          <span>可信度 {level.confidence}%</span>
          <span>{level.nextMajorRank ? `下一称号：${level.nextMajorRank}` : "已达最高称号"}</span>
        </div>
      </div>
    </div>
  );
}

function PendingManualCard({
  confirmations,
  matchById,
  participantById
}: {
  confirmations: Array<{
    id: string;
    match_id: string;
    proposed_winner_participant_id: string | null;
    proposed_score_a: number;
    proposed_score_b: number;
  }>;
  matchById: Map<string, { participant_a_id: string | null; participant_b_id: string | null }>;
  participantById: Map<string, { display_name: string }>;
}) {
  return (
    <Card>
      <h2 className="text-lg font-bold">待确认赛事结果</h2>
      <div className="mt-4 grid gap-3 text-sm">
        {confirmations.map((confirmation) => {
          const match = matchById.get(confirmation.match_id);
          const participantA = match?.participant_a_id
            ? participantById.get(match.participant_a_id)?.display_name || "A"
            : "A";
          const participantB = match?.participant_b_id
            ? participantById.get(match.participant_b_id)?.display_name || "B"
            : "B";
          const winner = confirmation.proposed_winner_participant_id
            ? participantById.get(confirmation.proposed_winner_participant_id)?.display_name || "未定"
            : "未定";

          return (
            <div key={confirmation.id} className="rounded-lg border border-wire p-4">
              <div className="font-semibold">
                {participantA} vs {participantB}
              </div>
              <div className="mt-1 text-muted">
                提交比分 {confirmation.proposed_score_a}:{confirmation.proposed_score_b}，胜者 {winner}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <form className="w-full sm:w-auto" action={confirmManualResultAction}>
                  <input type="hidden" name="confirmation_id" value={confirmation.id} />
                  <input type="hidden" name="decision" value="confirmed" />
                  <Button className="w-full sm:w-auto" type="submit">确认</Button>
                </form>
                <form className="w-full sm:w-auto" action={confirmManualResultAction}>
                  <input type="hidden" name="confirmation_id" value={confirmation.id} />
                  <input type="hidden" name="decision" value="rejected" />
                  <Button className="w-full sm:w-auto" type="submit" variant="secondary">
                    拒绝
                  </Button>
                </form>
              </div>
            </div>
          );
        })}
        {confirmations.length === 0 ? (
          <p className="text-muted">暂无需要你确认的赛事结果。</p>
        ) : null}
      </div>
    </Card>
  );
}

function PendingCasualCard({
  matches
}: {
  matches: Array<{
    id: string;
    player_a_name: string;
    player_b_name: string;
    winner_side: "A" | "B";
    score_a: number;
    score_b: number;
  }>;
}) {
  return (
    <Card>
      <h2 className="text-lg font-bold">待确认切磋</h2>
      <div className="mt-4 grid gap-3 text-sm">
        {matches.map((match) => (
          <div key={match.id} className="rounded-lg border border-wire p-4">
            <div className="font-semibold">
              {match.player_a_name} vs {match.player_b_name}
            </div>
            <div className="mt-1 text-muted">
              比分 {match.score_a}:{match.score_b}，{match.winner_side === "B" ? "你方获胜" : "对手获胜"}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <form className="w-full sm:w-auto" action={confirmCasualMatchAction}>
                <input type="hidden" name="casual_match_id" value={match.id} />
                <input type="hidden" name="decision" value="confirmed" />
                <Button className="w-full sm:w-auto" type="submit">确认写入普通数据</Button>
              </form>
              <form className="w-full sm:w-auto" action={confirmCasualMatchAction}>
                <input type="hidden" name="casual_match_id" value={match.id} />
                <input type="hidden" name="decision" value="rejected" />
                <Button className="w-full sm:w-auto" type="submit" variant="secondary">
                  拒绝
                </Button>
              </form>
            </div>
          </div>
        ))}
        {matches.length === 0 ? <p className="text-muted">暂无需要你确认的切磋记录。</p> : null}
      </div>
    </Card>
  );
}

function SavedTeamCaptainCard({
  savedTeams
}: {
  savedTeams: Array<{
    id: string;
    name: string;
    avatar_url: string | null;
    status: string;
    updated_at: string;
  }>;
}) {
  return (
    <Card>
      <h2 className="text-lg font-bold">我的长期队伍</h2>
      <div className="mt-4 grid gap-3 text-sm">
        {savedTeams.map((team) => (
          <form key={team.id} action={updateSavedTeamProfileAction} className="grid gap-3 rounded-lg border border-wire p-4">
            <input type="hidden" name="saved_team_id" value={team.id} />
            <AvatarUploader
              entityType="saved_team"
              entityId={team.id}
              initialUrl={team.avatar_url}
              fallback={team.name}
              label="上传队伍头像"
              size="md"
            />
            <label className="label">
              队伍名称
              <input className="form-input" name="name" defaultValue={team.name} required />
            </label>
            <div className="text-xs text-muted">状态 {team.status}</div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="secondary">保存队伍资料</Button>
              <Link className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-bold text-board underline" href={`/teams/${team.id}`}>
                历史
              </Link>
            </div>
          </form>
        ))}
        {savedTeams.length === 0 ? (
          <p className="text-muted">你作为队长保存的长期队伍会显示在这里。</p>
        ) : null}
      </div>
    </Card>
  );
}

function HistoryCard({ item }: { item: MatchHistoryItem }) {
  return (
    <Link
      className="grid min-h-16 touch-manipulation gap-3 rounded-lg border border-wire bg-surface p-3 shadow-soft transition-colors duration-75 active:bg-field sm:grid-cols-[auto_1fr_auto_auto] sm:items-center"
      href={item.detailHref}
    >
      <span
        className={cn(
          "w-fit rounded-full px-2 py-1 text-xs font-bold",
          item.source === "赛事" ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"
        )}
      >
        {item.source}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-black text-ink">
          {item.myName} vs {item.opponentName}
        </span>
        <span className="mt-1 block truncate text-xs font-semibold text-muted">
          {item.title} · {item.statusLabel} · {formatDateTime(item.playedAt)}
        </span>
      </span>
      <span
        className={cn(
          "text-lg font-black",
          item.result === "胜"
            ? "text-emerald-700"
            : item.result === "负"
              ? "text-red-700"
              : "text-amber-700"
        )}
      >
        {item.result}
      </span>
      <span className="text-sm font-black text-board">{item.scoreLabel}</span>
    </Link>
  );
}

function RegistrationCard({
  registrations,
  tournamentById
}: {
  registrations: Array<{ id: string; tournament_id: string; status: string; created_at: string }>;
  tournamentById: Map<string, { name: string }>;
}) {
  return (
    <Card>
      <h2 className="text-lg font-bold">参加过的赛事</h2>
      <div className="mt-4 grid gap-2 text-sm">
        {registrations.map((registration) => (
          <Link
            key={registration.id}
            href={`/tournaments/${registration.tournament_id}`}
            className="grid min-h-14 touch-manipulation gap-2 rounded-lg border border-wire p-3 hover:bg-field sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <span className="break-words">{tournamentById.get(registration.tournament_id)?.name || `赛事 ${registration.tournament_id.slice(0, 8)}`}</span>
            <span className="font-semibold text-muted">{registration.status}</span>
          </Link>
        ))}
        {registrations.length === 0 ? <p className="text-muted">暂无报名记录。</p> : null}
      </div>
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
