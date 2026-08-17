import { CalendarDays, ChevronDown, Medal, Sparkles, Star } from "lucide-react";
import {
  formatWeeklyStarWeek,
  getPreviousWeekStart,
  getTournamentWeekNumber,
  getWeeklyStarHighlights,
  type WeeklyStar
} from "@/lib/tournaments/weekly-stars";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/ui/PlayerIdentity";

export function WeeklyStarBoard({ stars, tournamentStartAt }: { stars: WeeklyStar[]; tournamentStartAt: string }) {
  const previousWeekStart = getPreviousWeekStart();
  const featured = stars.find((star) => star.weekStart === previousWeekStart) || null;
  const history = stars.filter((star) => star.weekStart !== previousWeekStart);

  return (
    <section className="overflow-hidden rounded-lg border border-sky-200 bg-surface shadow-[0_18px_42px_rgb(14_127_190/0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 bg-sky-50/80 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-board text-white shadow-sm">
            <Star className="h-5 w-5 fill-current" aria-hidden />
          </span>
          <div>
            <h2 className="text-lg font-black text-ink">每周赛事之星</h2>
            <p className="text-xs font-semibold text-muted">每周结束后，根据正式完赛数据评选</p>
          </div>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-board ring-1 ring-sky-200">
          最新周置顶
        </span>
      </div>

      <div className="p-4 sm:p-5">
        {featured ? (
          <FeaturedWeeklyStar star={featured} tournamentStartAt={tournamentStartAt} />
        ) : (
          <div className="rounded-lg border border-dashed border-wire bg-field/65 px-4 py-5 text-center">
            <div className="font-black text-ink">最近一周暂无赛事之星</div>
            <p className="mt-1 text-sm font-semibold text-muted">该周没有带个人数据的已完赛对局，暂不进行评选。</p>
          </div>
        )}

        {history.length > 0 ? (
          <details className="mt-4 rounded-lg border border-wire bg-field/55">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-black text-ink marker:hidden">
              <span className="flex items-center gap-2">
                <Medal className="h-4 w-4 text-board" aria-hidden />
                过往赛事之星
                <span className="rounded-full bg-board/10 px-2 py-0.5 text-xs text-board">{history.length}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-muted" aria-hidden />
            </summary>
            <div className="grid gap-2 border-t border-wire p-3">
              {history.map((star) => (
                <HistoryStarRow key={`${star.weekStart}-${star.userId}`} star={star} tournamentStartAt={tournamentStartAt} />
              ))}
            </div>
          </details>
        ) : null}

        <details className="mt-3 text-xs font-semibold text-muted">
          <summary className="cursor-pointer text-board">评选原理</summary>
          <p className="mt-2 leading-6">
            只统计已经结束且有个人数据的正式比赛。系统综合出场、胜场、赢局、PPR/MPR，以及 180、帽子、白马、9 Mark、最高拆分和高分赛成绩；软硬镖指标会先按各自合理上限归一化，再进行比较。管理员可按实际贡献人工调整，并明确标记为“人工评定”。
          </p>
        </details>
      </div>
    </section>
  );
}

function FeaturedWeeklyStar({ star, tournamentStartAt }: { star: WeeklyStar; tournamentStartAt: string }) {
  const highlights = getWeeklyStarHighlights(star.metrics);
  const weekNumber = getTournamentWeekNumber(tournamentStartAt, star.weekStart);
  return (
    <article className="relative overflow-hidden rounded-lg border border-amber-300 bg-[linear-gradient(135deg,#fff8dc_0%,#ffffff_48%,#eef8ff_100%)] p-4 sm:p-5">
      <div className="absolute right-4 top-4 text-amber-300/35" aria-hidden>
        <Sparkles className="h-16 w-16" />
      </div>
      <div className="relative grid min-w-0 gap-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
        <PlayerAvatar
          name={star.name}
          avatarUrl={star.avatarUrl}
          size="xl"
          className="border-amber-300 ring-amber-200"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-400 px-2.5 py-1 text-xs font-black text-slate-950">
              {weekNumber ? `第 ${weekNumber} 周赛事之星` : "赛事之星"}
            </span>
            <SourceBadge source={star.source} />
          </div>
          <h3 className="mt-2 truncate text-2xl font-black text-ink">{star.name}</h3>
          {star.teamName ? <p className="mt-0.5 truncate text-sm font-bold text-board">{star.teamName}</p> : null}
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-muted">{star.reason}</p>
          {highlights.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {highlights.map((highlight) => (
                <span key={highlight} className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-black text-ink ring-1 ring-wire/70">
                  {highlight}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-white/85 px-3 py-2 text-sm font-black text-board ring-1 ring-wire sm:self-start">
          <CalendarDays className="h-4 w-4" aria-hidden />
          {formatWeeklyStarWeek(star.weekStart)}
        </div>
      </div>
    </article>
  );
}

function HistoryStarRow({ star, tournamentStartAt }: { star: WeeklyStar; tournamentStartAt: string }) {
  const highlights = getWeeklyStarHighlights(star.metrics);
  const weekNumber = getTournamentWeekNumber(tournamentStartAt, star.weekStart);
  return (
    <article className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg bg-surface p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <PlayerAvatar name={star.name} avatarUrl={star.avatarUrl} size="md" />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate font-black text-ink">{star.name}</span>
          <SourceBadge source={star.source} compact />
        </div>
        <div className="mt-0.5 truncate text-xs font-semibold text-muted">
          {[star.teamName, highlights.slice(0, 2).join(" · ")].filter(Boolean).join(" · ") || star.reason}
        </div>
      </div>
      <div className="col-span-2 whitespace-nowrap text-xs font-black text-board sm:col-span-1">
        {weekNumber ? `第 ${weekNumber} 周 · ` : ""}{formatWeeklyStarWeek(star.weekStart)}
      </div>
    </article>
  );
}

function SourceBadge({ source, compact = false }: { source: WeeklyStar["source"]; compact?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full font-black",
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        source === "manual" ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-board"
      )}
    >
      {source === "manual" ? "人工评定" : "系统评选"}
    </span>
  );
}
