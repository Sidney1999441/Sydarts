import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, History, IdCard, Swords, UserRound } from "lucide-react";
import { confirmCasualMatchAction, confirmManualResultAction } from "@/lib/actions/matches";
import { updateSavedTeamProfileAction } from "@/lib/actions/teams";
import { calculatePlayerLevel, type PlayerLevelStats, type SoftPlayerLevelStats } from "@/lib/algorithms/player-level";
import { requireUser } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
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

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function percent(part: number | null | undefined, total: number | null | undefined) {
  const totalValue = toNumber(total);
  if (totalValue <= 0) return 0;
  return Math.round((toNumber(part) / totalValue) * 100);
}

function getLevelTone(level: ReturnType<typeof calculatePlayerLevel>) {
  if (level.level >= 95) {
    return {
      header: "border-sky-300 bg-slate-950 text-white",
      panel: "border-sky-300 bg-slate-950 text-white",
      badge: "bg-sky-400 text-slate-950",
      text: "text-sky-200",
      bar: "bg-sky-400"
    };
  }
  if (level.level >= 83) {
    return {
      header: "border-indigo-200 bg-indigo-50",
      panel: "border-indigo-200 bg-indigo-50 text-indigo-950",
      badge: "bg-indigo-600 text-white",
      text: "text-indigo-700",
      bar: "bg-indigo-600"
    };
  }
  if (level.level >= 70) {
    return {
      header: "border-rose-200 bg-rose-50",
      panel: "border-rose-200 bg-rose-50 text-rose-950",
      badge: "bg-rose-600 text-white",
      text: "text-rose-700",
      bar: "bg-rose-600"
    };
  }
  if (level.level >= 55) {
    return {
      header: "border-amber-200 bg-amber-50",
      panel: "border-amber-200 bg-amber-50 text-amber-950",
      badge: "bg-amber-500 text-slate-950",
      text: "text-amber-700",
      bar: "bg-amber-500"
    };
  }
  if (level.level >= 40) {
    return {
      header: "border-cyan-200 bg-cyan-50",
      panel: "border-cyan-200 bg-cyan-50 text-cyan-950",
      badge: "bg-cyan-600 text-white",
      text: "text-cyan-700",
      bar: "bg-cyan-600"
    };
  }
  if (level.level >= 20) {
    return {
      header: "border-emerald-200 bg-emerald-50",
      panel: "border-emerald-200 bg-emerald-50 text-emerald-950",
      badge: "bg-emerald-600 text-white",
      text: "text-emerald-700",
      bar: "bg-emerald-600"
    };
  }
  return {
    header: "border-slate-200 bg-slate-50",
    panel: "border-slate-200 bg-slate-50 text-slate-950",
    badge: "bg-slate-700 text-white",
    text: "text-slate-600",
    bar: "bg-slate-700"
  };
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
    supabase
      .from("saved_teams")
      .select("id, name, avatar_url, status, created_at, updated_at")
      .eq("captain_user_id", user.id)
      .order("updated_at", { ascending: false })
  ]);

  const tournamentIds = [...new Set((registrations || []).map((registration) => registration.tournament_id))];

  const [
    { data: tournaments },
    { data: confirmationMatches }
  ] = await Promise.all([
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
    (confirmationParticipants || []).map((participant) => [
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
  const profileTone = getLevelTone(generalLevel);
  const pendingActionCount = (confirmations || []).length + (pendingCasualMatches || []).length;

  return (
    <div className="grid gap-5 sm:gap-6">
      <CodlPageHeader
        kicker={`UID ${profile?.uid || "------"}`}
        title="个人中心"
        description={`${profile?.display_name || user.email} · 普通 ${generalLevel.label} · 赛事 ${tournamentLevel.label}`}
        icon={<UserRound className="h-6 w-6" aria-hidden />}
        art="white"
        dark={generalLevel.level >= 95}
        className={profileTone.header}
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

      <section className={cn("rounded-lg border p-4 shadow-soft sm:p-5", profileTone.panel)}>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="min-w-0">
            <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-black", profileTone.badge)}>
              {generalLevel.majorRank}
            </span>
            <h2 className="mt-3 truncate text-2xl font-black">{profile?.display_name || user.email}</h2>
            <div className={cn("mt-2 text-sm font-bold", profileTone.text)}>
              普通 {generalLevel.level} 级 · 赛事 {tournamentLevel.level} 级 · UID {profile?.uid || "------"}
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/70">
              <div className={cn("h-full", profileTone.bar)} style={{ width: `${generalLevel.progressToNext}%` }} />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:w-[520px]">
            <ProfileQuickLink href="/profile/history" icon={<History className="h-4 w-4" aria-hidden />} label="历史战绩" />
            <ProfileQuickLink href="/profile/real-name" icon={<IdCard className="h-4 w-4" aria-hidden />} label="实名认证" />
            <ProfileQuickLink href="/scorer/casual" icon={<Swords className="h-4 w-4" aria-hidden />} label="切磋计分" />
            <ProfileQuickLink href="/help" icon={<ArrowRight className="h-4 w-4" aria-hidden />} label="规则说明" />
          </div>
        </div>
      </section>

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

function ProfileQuickLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link
      className="flex min-h-12 touch-manipulation items-center justify-between gap-2 rounded-lg border border-white/60 bg-white/80 px-3 text-sm font-black text-primary shadow-sm active:bg-white"
      href={href}
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
    </Link>
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
      <details className="mt-4 rounded-lg border border-wire bg-field p-3">
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
