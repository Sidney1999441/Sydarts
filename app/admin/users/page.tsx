import { Search } from "lucide-react";
import { updateUserAdminFieldsAction } from "@/lib/actions/users";
import { calculatePlayerLevel, ratingToSkillLevel, type PlayerLevelStats, type SoftPlayerLevelStats } from "@/lib/algorithms/player-level";
import { requireAdmin } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { SetupNotice } from "@/components/SetupNotice";
import { AvatarUploader } from "@/components/ui/AvatarUploader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

type DbStats = {
  user_id: string;
  matches_played?: number | null;
  wins?: number | null;
  losses?: number | null;
  legs_played?: number | null;
  legs_won?: number | null;
  total_scored_points?: number | null;
  total_darts?: number | null;
  average_per_3_darts?: number | string | null;
  highest_turn_score?: number | null;
  highest_checkout?: number | null;
  bust_count?: number | null;
  count_high_checkout?: number | null;
  count_80_plus?: number | null;
  count_100_plus?: number | null;
  count_140_plus?: number | null;
  count_170_plus?: number | null;
  count_180?: number | null;
};

type DbSoftStats = {
  user_id: string;
  matches_played?: number | null;
  wins?: number | null;
  losses?: number | null;
  legs_played?: number | null;
  legs_won?: number | null;
  average_score?: number | string | null;
  average_mpr?: number | string | null;
  highest_checkout?: number | null;
  count_high_checkout?: number | null;
  count_ton80?: number | null;
  count_hat_trick?: number | null;
  count_white_horse?: number | null;
  count_9_marks?: number | null;
  total_marks?: number | null;
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

export default async function AdminUsersPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const { q = "" } = (await searchParams) || {};
  const keyword = q.trim();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("profiles")
    .select(
      "id, uid, display_name, avatar_url, bio, phone, role, rating, skill_level, tournament_rating, casual_rating, soft_rating, tournament_skill_level, casual_skill_level, soft_skill_level, status, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(60);

  if (keyword) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keyword)) {
      query = query.eq("id", keyword);
    } else if (/^[0-9]+$/.test(keyword)) {
      query = query.ilike("uid", `${keyword}%`);
    } else {
      query = query.ilike("display_name", `%${keyword}%`);
    }
  }

  const { data: users } = await query;
  const userIds = (users || []).map((user) => user.id);
  const statsSelect =
    "user_id,matches_played,wins,losses,legs_played,legs_won,total_scored_points,total_darts,average_per_3_darts,highest_turn_score,highest_checkout,bust_count,count_high_checkout,count_80_plus,count_100_plus,count_140_plus,count_170_plus,count_180";
  const [{ data: tournamentStatsRows }, { data: generalStatsRows }, { data: softStatsRows }] =
    userIds.length > 0
      ? await Promise.all([
          supabase.from("user_stats").select(statsSelect).in("user_id", userIds),
          supabase.from("general_user_stats").select(statsSelect).in("user_id", userIds),
          supabase.from("soft_user_stats").select("*").in("user_id", userIds)
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];
  const tournamentStatsByUser = new Map((tournamentStatsRows || []).map((stats) => [stats.user_id, stats as DbStats]));
  const generalStatsByUser = new Map((generalStatsRows || []).map((stats) => [stats.user_id, stats as DbStats]));
  const softStatsByUser = new Map((softStatsRows || []).map((stats) => [stats.user_id, stats as DbSoftStats]));

  return (
    <div className="grid gap-5">
      <section className="rounded-lg bg-primary p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-white/60">Admin</div>
            <h1 className="mt-2 text-3xl font-black">用户管理</h1>
          </div>
          <form className="flex w-full gap-2 sm:w-auto" action="/admin/users">
            <input
              className="form-input min-w-0 bg-white text-ink sm:w-72"
              name="q"
              defaultValue={keyword}
              placeholder="UID / 姓名 / 用户 ID"
            />
            <Button className="shrink-0 bg-board text-white" type="submit">
              <Search className="h-4 w-4" aria-hidden />
              筛选
            </Button>
          </form>
        </div>
      </section>

      <Card>
        <div className="grid gap-3">
          {(users || []).map((user) => {
            const tournamentStats = tournamentStatsByUser.get(user.id) || null;
            const generalStats = generalStatsByUser.get(user.id) || null;
            const softStats = softStatsByUser.get(user.id) || null;
            const tournamentRating = user.tournament_rating ?? user.rating ?? 1000;
            const casualRating = user.casual_rating ?? user.rating ?? 1000;
            const softRating = user.soft_rating ?? user.rating ?? 1000;
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

            return (
              <form
                key={user.id}
                action={updateUserAdminFieldsAction}
                className="grid gap-4 rounded-lg border border-wire bg-surface p-4"
              >
                <input type="hidden" name="user_id" value={user.id} />
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <AvatarUploader
                      entityType="profile"
                      entityId={user.id}
                      initialUrl={user.avatar_url}
                      fallback={user.display_name || "U"}
                      label="上传头像"
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-lg font-black">{user.display_name || "未命名用户"}</div>
                      <div className="text-xs font-bold text-board">UID {user.uid || "------"}</div>
                      <div className="truncate text-xs text-muted">{user.id}</div>
                    </div>
                  </div>
                  <div className="text-right text-xs font-semibold text-muted">
                    <div>{user.status}</div>
                    <div>{user.created_at ? formatDateTime(user.created_at) : "-"}</div>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-4">
                  <label className="label">
                    显示名
                    <input className="form-input" name="display_name" defaultValue={user.display_name || ""} required />
                  </label>
                  <label className="label">
                    手机
                    <input className="form-input" name="phone" defaultValue={user.phone || ""} />
                  </label>
                  <label className="label">
                    状态
                    <select className="form-input" name="status" defaultValue={user.status || "active"}>
                      <option value="active">active</option>
                      <option value="banned">banned</option>
                    </select>
                  </label>
                  <label className="label">
                    角色
                    <select className="form-input" name="role" defaultValue={user.role}>
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </label>
                  <label className="label">
                    普通 Rating
                    <input
                      className="form-input"
                      type="number"
                      name="casual_rating"
                      defaultValue={casualRating}
                    />
                  </label>
                  <label className="label">
                    赛事 Rating
                    <input
                      className="form-input"
                      type="number"
                      name="tournament_rating"
                      defaultValue={tournamentRating}
                    />
                  </label>
                  <label className="label">
                    软镖 Rating
                    <input
                      className="form-input"
                      type="number"
                      name="soft_rating"
                      defaultValue={softRating}
                    />
                  </label>
                  <ReadOnlyField label="普通分档" value={ratingToSkillLevel(casualRating)} />
                  <ReadOnlyField label="赛事分档" value={ratingToSkillLevel(tournamentRating)} />
                  <ReadOnlyField label="软镖分档" value={ratingToSkillLevel(softRating)} />
                  <label className="label lg:col-span-4">
                    备注
                    <textarea className="form-input min-h-24" name="bio" defaultValue={user.bio || ""} />
                  </label>
                </div>

                <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.1fr]">
                  <AdminLevelCard title="普通段位" rating={casualRating} stats={generalStats} level={generalLevel} tone="general" />
                  <AdminLevelCard title="赛事段位" rating={tournamentRating} stats={tournamentStats} level={tournamentLevel} tone="tournament" />
                  <SoftStatsCard rating={softRating} stats={softStats} />
                </div>

                <div className="flex justify-end">
                  <Button type="submit" variant="secondary">
                    保存用户
                  </Button>
                </div>
              </form>
            );
          })}
          {(users || []).length === 0 ? (
            <p className="text-sm text-muted">没有找到用户。</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="label">
      {label}
      <div className="flex min-h-11 items-center rounded-lg border border-wire bg-field px-3 text-sm font-bold text-ink">
        {value}
      </div>
    </div>
  );
}

function AdminLevelCard({
  title,
  rating,
  stats,
  level,
  tone
}: {
  title: string;
  rating: number;
  stats: DbStats | null;
  level: ReturnType<typeof calculatePlayerLevel>;
  tone: "general" | "tournament";
}) {
  const isGeneral = tone === "general";
  const wrapperClass = isGeneral ? "bg-emerald-50 text-emerald-950" : "bg-violet-50 text-violet-950";
  const barClass = isGeneral ? "bg-emerald-500" : "bg-violet-500";

  return (
    <div className={`rounded-lg p-4 ${wrapperClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-normal opacity-70">Rating {rating}</div>
          <h3 className="mt-1 text-base font-bold">{title}</h3>
        </div>
        <div className="text-right">
          <div className="text-xs opacity-70">综合分</div>
          <div className="text-xl font-bold">{level.score}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs opacity-70">当前段位</div>
          <div className="mt-1 text-xl font-bold">{level.label}</div>
        </div>
        <div className="text-right text-xs opacity-75">
          <div>{toNumber(stats?.matches_played)} 场</div>
          <div>胜率 {percent(stats?.wins, stats?.matches_played)}%</div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface/80">
        <div className={`h-full ${barClass}`} style={{ width: `${level.progressToNext}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs opacity-70">
        <span>可信度 {level.confidence}%</span>
        <span>{level.nextMajorRank ? `下一称号：${level.nextMajorRank}` : "已达最高称号"}</span>
      </div>
    </div>
  );
}

function SoftStatsCard({ rating, stats }: { rating: number; stats: DbSoftStats | null }) {
  return (
    <div className="rounded-lg bg-sky-50 p-4 text-sky-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-normal text-sky-700">Rating {rating}</div>
          <h3 className="mt-1 text-base font-bold">软镖补充</h3>
        </div>
        <div className="text-right text-xs text-sky-700">
          <div>{toNumber(stats?.matches_played)} 场</div>
          <div>胜率 {percent(stats?.wins, stats?.matches_played)}%</div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <MiniMetric label="均分" value={toNumber(stats?.average_score).toFixed(1)} />
        <MiniMetric label="MPR" value={toNumber(stats?.average_mpr).toFixed(2)} />
        <MiniMetric label="总标数" value={toNumber(stats?.total_marks)} />
        <MiniMetric label="TON80" value={toNumber(stats?.count_ton80)} />
        <MiniMetric label="帽子戏法" value={toNumber(stats?.count_hat_trick)} />
        <MiniMetric label="白马" value={toNumber(stats?.count_white_horse)} />
        <MiniMetric label="9 Mark" value={toNumber(stats?.count_9_marks)} />
      </dl>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-surface/70 p-2">
      <dt className="text-muted">{label}</dt>
      <dd className="mt-1 font-bold text-ink">{value}</dd>
    </div>
  );
}
