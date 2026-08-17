import type { MatchDartMode } from "@/types/domain";

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type WeeklyStarIdentity = {
  name: string;
  avatarUrl: string | null;
  teamName: string;
};

export type WeeklyStarMatch = {
  id: string;
  status: string;
  updated_at?: string | null;
  participant_a_id: string | null;
  participant_b_id: string | null;
  winner_participant_id: string | null;
  dart_mode?: MatchDartMode | null;
  game_variant?: string | null;
  details?: Record<string, unknown> | null;
};

export type WeeklyStarMetrics = {
  matches: number;
  wins: number;
  legWins: number;
  bestAverage: number;
  bestMpr: number;
  count180: number;
  hats: number;
  whiteHorse: number;
  nineMarks: number;
  bestCheckout: number;
  bestHighScore: number;
};

export type WeeklyStar = {
  weekStart: string;
  weekEnd: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  teamName: string;
  source: "automatic" | "manual";
  score: number;
  reason: string;
  metrics: WeeklyStarMetrics;
};

export type WeeklyStarOverride = {
  week_start: string;
  user_id: string;
  reason?: string | null;
};

export type WeeklyStarEvaluation = {
  automaticStars: WeeklyStar[];
  candidatesByWeek: Map<string, WeeklyStar[]>;
};

type WeeklyStatEntry = {
  userId: string;
  dartMode: MatchDartMode;
  gameVariant?: string | number | null;
  winnerParticipantId?: string | null;
  stats: Record<string, unknown>;
};

export function evaluateWeeklyStars({
  matches,
  participantMembersById,
  identitiesByUserId,
  now = new Date()
}: {
  matches: WeeklyStarMatch[];
  participantMembersById: Map<string, Array<{ userId: string }>>;
  identitiesByUserId: Map<string, WeeklyStarIdentity>;
  now?: Date;
}): WeeklyStarEvaluation {
  const currentWeekStart = getShanghaiWeekStart(now);
  const metricsByWeek = new Map<string, Map<string, WeeklyStarMetrics>>();

  for (const match of matches) {
    if (match.status !== "completed" || !match.updated_at) continue;
    const weekStart = getShanghaiWeekStart(new Date(match.updated_at));
    if (weekStart >= currentWeekStart) continue;

    const entries = readWeeklyStatEntries(match);
    if (entries.length === 0) continue;

    const entriesByUserId = new Map<string, WeeklyStatEntry[]>();
    for (const entry of entries) {
      const userEntries = entriesByUserId.get(entry.userId) || [];
      userEntries.push(entry);
      entriesByUserId.set(entry.userId, userEntries);
    }

    const weekMetrics = metricsByWeek.get(weekStart) || new Map<string, WeeklyStarMetrics>();
    for (const [userId, userEntries] of entriesByUserId) {
      const metrics = weekMetrics.get(userId) || emptyMetrics();
      metrics.matches += 1;

      if (match.winner_participant_id && isUserInParticipant(userId, match.winner_participant_id, participantMembersById)) {
        metrics.wins += 1;
      }

      for (const entry of userEntries) {
        const stats = entry.stats;
        metrics.bestAverage = Math.max(metrics.bestAverage, statNumber(stats, ["averageScore", "averagePer3Darts"]));
        metrics.bestMpr = Math.max(metrics.bestMpr, statNumber(stats, ["averageMpr"]));
        metrics.count180 += statNumber(stats, ["count180", "countTon80"]);
        metrics.hats += statNumber(stats, ["countHatTrick"]);
        metrics.whiteHorse += statNumber(stats, ["countWhiteHorse"]);
        metrics.nineMarks += statNumber(stats, ["count9Marks"]);
        metrics.bestCheckout = Math.max(metrics.bestCheckout, statNumber(stats, ["highestCheckout"]));
        if (entry.dartMode === "soft" && String(entry.gameVariant || "") === "soft_high_score") {
          metrics.bestHighScore = Math.max(
            metrics.bestHighScore,
            statNumber(stats, ["highestTurnScore", "totalScoredPoints"])
          );
        }
        if (
          entry.winnerParticipantId &&
          isUserInParticipant(userId, entry.winnerParticipantId, participantMembersById)
        ) {
          metrics.legWins += 1;
        }
      }

      weekMetrics.set(userId, metrics);
    }
    metricsByWeek.set(weekStart, weekMetrics);
  }

  const candidatesByWeek = new Map<string, WeeklyStar[]>();
  for (const [weekStart, metricsByUserId] of metricsByWeek) {
    const candidates = [...metricsByUserId.entries()]
      .map(([userId, metrics]) => {
        const identity = identitiesByUserId.get(userId) || {
          name: `选手 ${userId.slice(0, 6)}`,
          avatarUrl: null,
          teamName: ""
        };
        return {
          weekStart,
          weekEnd: addDateParts(weekStart, 6),
          userId,
          name: identity.name,
          avatarUrl: identity.avatarUrl,
          teamName: identity.teamName,
          source: "automatic" as const,
          score: calculateWeeklyStarScore(metrics),
          reason: buildAutomaticReason(metrics),
          metrics: { ...metrics }
        };
      })
      .sort(compareCandidates);
    candidatesByWeek.set(weekStart, candidates);
  }

  const automaticStars = [...candidatesByWeek.values()]
    .map((candidates) => candidates[0])
    .filter((star): star is WeeklyStar => Boolean(star))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));

  return { automaticStars, candidatesByWeek };
}

export function mergeWeeklyStarOverrides({
  evaluation,
  overrides,
  identitiesByUserId,
  now = new Date()
}: {
  evaluation: WeeklyStarEvaluation;
  overrides: WeeklyStarOverride[];
  identitiesByUserId: Map<string, WeeklyStarIdentity>;
  now?: Date;
}) {
  const currentWeekStart = getShanghaiWeekStart(now);
  const starsByWeek = new Map(evaluation.automaticStars.map((star) => [star.weekStart, star]));

  for (const override of overrides) {
    const weekStart = normalizeDatePart(override.week_start);
    if (!weekStart || weekStart >= currentWeekStart) continue;
    const candidate = (evaluation.candidatesByWeek.get(weekStart) || []).find(
      (item) => item.userId === override.user_id
    );
    const identity = identitiesByUserId.get(override.user_id) || {
      name: `选手 ${override.user_id.slice(0, 6)}`,
      avatarUrl: null,
      teamName: ""
    };

    starsByWeek.set(weekStart, {
      weekStart,
      weekEnd: addDateParts(weekStart, 6),
      userId: override.user_id,
      name: identity.name,
      avatarUrl: identity.avatarUrl,
      teamName: identity.teamName,
      source: "manual",
      score: candidate?.score || 0,
      reason: override.reason?.trim() || candidate?.reason || "由赛事管理员综合评定。",
      metrics: candidate?.metrics ? { ...candidate.metrics } : emptyMetrics()
    });
  }

  return [...starsByWeek.values()].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

export function calculateWeeklyStarScore(metrics: WeeklyStarMetrics) {
  const pprForm = clamp(metrics.bestAverage / 110, 0, 1);
  const mprForm = clamp(metrics.bestMpr / 5, 0, 1);
  const formScore = Math.max(pprForm, mprForm) * 30;
  const versatilityBonus = metrics.bestAverage > 0 && metrics.bestMpr > 0 ? 5 : 0;
  const highlightScore = Math.min(
    metrics.count180 * 4 +
      metrics.hats * 3 +
      metrics.whiteHorse * 8 +
      metrics.nineMarks * 6 +
      clamp(metrics.bestCheckout / 170, 0, 1) * 8 +
      clamp(metrics.bestHighScore / 1000, 0, 1) * 6,
    25
  );
  const score =
    metrics.matches * 10 +
    metrics.wins * 18 +
    metrics.legWins * 3 +
    formScore +
    versatilityBonus +
    highlightScore;
  return Math.round(score * 10) / 10;
}

export function getShanghaiWeekStart(date = new Date()) {
  const shanghaiTime = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  const weekday = shanghaiTime.getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const mondayUtc = Date.UTC(
    shanghaiTime.getUTCFullYear(),
    shanghaiTime.getUTCMonth(),
    shanghaiTime.getUTCDate() - daysSinceMonday
  );
  return toDatePart(new Date(mondayUtc));
}

export function getPreviousWeekStart(date = new Date()) {
  return addDateParts(getShanghaiWeekStart(date), -7);
}

export function getPreviousWeekEnd(date = new Date()) {
  return addDateParts(getPreviousWeekStart(date), 6);
}

export function getTournamentWeekNumber(tournamentStartAt: string, weekStart: string) {
  const tournamentWeekStart = getShanghaiWeekStart(new Date(tournamentStartAt));
  const normalizedWeekStart = normalizeDatePart(weekStart);
  if (!normalizedWeekStart) return null;
  const difference = datePartTimestamp(normalizedWeekStart) - datePartTimestamp(tournamentWeekStart);
  if (difference < 0) return null;
  return Math.floor(difference / (7 * DAY_MS)) + 1;
}

export function normalizeWeekStart(datePart: string) {
  const normalized = normalizeDatePart(datePart);
  if (!normalized) return null;
  return getShanghaiWeekStart(new Date(`${normalized}T12:00:00+08:00`));
}

export function formatWeeklyStarWeek(weekStart: string) {
  const start = normalizeDatePart(weekStart);
  if (!start) return weekStart;
  const end = addDateParts(start, 6);
  return `${start.slice(5).replace("-", "/")} - ${end.slice(5).replace("-", "/")}`;
}

export function getWeeklyStarHighlights(metrics: WeeklyStarMetrics) {
  const items: string[] = [];
  if (metrics.matches > 0) items.push(`${metrics.matches} 场 ${metrics.wins} 胜`);
  if (metrics.bestAverage > 0) items.push(`最高 PPR ${metrics.bestAverage.toFixed(1)}`);
  if (metrics.bestMpr > 0) items.push(`最高 MPR ${metrics.bestMpr.toFixed(2)}`);
  if (metrics.count180 > 0) items.push(`${metrics.count180} 个 180/TON80`);
  if (metrics.hats > 0) items.push(`${metrics.hats} 个帽子`);
  if (metrics.whiteHorse > 0) items.push(`${metrics.whiteHorse} 次白马`);
  if (metrics.nineMarks > 0) items.push(`${metrics.nineMarks} 次 9 Mark`);
  if (metrics.bestCheckout > 0) items.push(`最高拆 ${metrics.bestCheckout}`);
  if (metrics.bestHighScore > 0) items.push(`高分赛 ${metrics.bestHighScore}`);
  return items.slice(0, 5);
}

function readWeeklyStatEntries(match: WeeklyStarMatch): WeeklyStatEntry[] {
  const details = asRecord(match.details);
  const legResults = Array.isArray(details?.legResults) ? details.legResults : [];
  const legEntries = legResults.flatMap((rawResult) => {
    const result = asRecord(rawResult);
    const userStats = asRecord(result?.userStats);
    if (!result || !userStats) return [];
    const dartMode: MatchDartMode = result.dartMode === "soft" ? "soft" : "steel";
    return Object.entries(userStats).flatMap(([userId, rawStats]) => {
      const stats = asRecord(rawStats);
      if (!stats) return [];
      return [{
        userId,
        dartMode,
        gameVariant:
          typeof result.gameVariant === "string" || typeof result.gameVariant === "number"
            ? result.gameVariant
            : null,
        winnerParticipantId:
          typeof result.winnerParticipantId === "string" ? result.winnerParticipantId : null,
        stats
      }];
    });
  });
  if (legEntries.length > 0) return legEntries;

  const userStats = asRecord(details?.userStats);
  if (!userStats) return [];
  const dartMode: MatchDartMode = match.dart_mode === "soft" ? "soft" : "steel";
  return Object.entries(userStats).flatMap(([userId, rawStats]) => {
    const stats = asRecord(rawStats);
    return stats
      ? [{ userId, dartMode, gameVariant: match.game_variant, winnerParticipantId: null, stats }]
      : [];
  });
}

function compareCandidates(a: WeeklyStar, b: WeeklyStar) {
  return (
    b.score - a.score ||
    b.metrics.wins - a.metrics.wins ||
    b.metrics.matches - a.metrics.matches ||
    Math.max(b.metrics.bestAverage / 110, b.metrics.bestMpr / 5) -
      Math.max(a.metrics.bestAverage / 110, a.metrics.bestMpr / 5) ||
    a.name.localeCompare(b.name, "zh-CN")
  );
}

function buildAutomaticReason(metrics: WeeklyStarMetrics) {
  const highlights = getWeeklyStarHighlights(metrics);
  return highlights.length > 0
    ? `综合胜负、出场与个人高光表现：本周 ${highlights.join("，")}。`
    : "根据本周完赛表现自动评选。";
}

function emptyMetrics(): WeeklyStarMetrics {
  return {
    matches: 0,
    wins: 0,
    legWins: 0,
    bestAverage: 0,
    bestMpr: 0,
    count180: 0,
    hats: 0,
    whiteHorse: 0,
    nineMarks: 0,
    bestCheckout: 0,
    bestHighScore: 0
  };
}

function isUserInParticipant(
  userId: string,
  participantId: string,
  participantMembersById: Map<string, Array<{ userId: string }>>
) {
  return (participantMembersById.get(participantId) || []).some((member) => member.userId === userId);
}

function statNumber(stats: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const rawValue = stats[key];
    const value = typeof rawValue === "number" ? rawValue : typeof rawValue === "string" ? Number(rawValue) : NaN;
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeDatePart(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function addDateParts(datePart: string, days: number) {
  return toDatePart(new Date(datePartTimestamp(datePart) + days * DAY_MS));
}

function datePartTimestamp(datePart: string) {
  const [year, month, day] = datePart.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function toDatePart(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
