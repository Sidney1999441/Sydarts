export type PlayerLevelStats = {
  matchesPlayed?: number | null;
  wins?: number | null;
  losses?: number | null;
  legsPlayed?: number | null;
  legsWon?: number | null;
  totalScoredPoints?: number | null;
  totalDarts?: number | null;
  averagePer3Darts?: number | null;
  highestTurnScore?: number | null;
  highestCheckout?: number | null;
  bustCount?: number | null;
  countHighCheckout?: number | null;
  count80Plus?: number | null;
  count100Plus?: number | null;
  count140Plus?: number | null;
  count170Plus?: number | null;
  count180?: number | null;
};

export type SoftPlayerLevelStats = {
  matchesPlayed?: number | null;
  wins?: number | null;
  losses?: number | null;
  legsPlayed?: number | null;
  legsWon?: number | null;
  averageScore?: number | null;
  averageMpr?: number | null;
  highestCheckout?: number | null;
  countHighCheckout?: number | null;
  countTon80?: number | null;
  countHatTrick?: number | null;
  countWhiteHorse?: number | null;
};

export type MajorRank = "白丁" | "镖人" | "镖侠" | "镖王" | "镖仙" | "镖神" | "归一";
export type CoarseSkillLevel = "Beginner" | "Intermediate" | "Advanced" | "Pro";
export type InitialRatingTierId =
  | "tier_1"
  | "tier_2"
  | "tier_3"
  | "tier_4"
  | "tier_5"
  | "tier_6"
  | "tier_7"
  | "tier_8"
  | "tier_9";

export type PlayerLevelResult = {
  majorRank: MajorRank;
  level: number;
  score: number;
  confidence: number;
  label: string;
  nextMajorRank: MajorRank | null;
  progressToNext: number;
  components: {
    average: number;
    result: number;
    legs: number;
    rating: number;
    scoringPower: number;
    soft: number;
    disciplinePenalty: number;
  };
};

const rankBands: Array<{ name: MajorRank; minLevel: number }> = [
  { name: "白丁", minLevel: 1 },
  { name: "镖人", minLevel: 20 },
  { name: "镖侠", minLevel: 40 },
  { name: "镖王", minLevel: 55 },
  { name: "镖仙", minLevel: 70 },
  { name: "镖神", minLevel: 83 },
  { name: "归一", minLevel: 95 }
];

export function ratingToSkillLevel(rating?: number | null): CoarseSkillLevel {
  const value = numberOrZero(rating);
  if (value >= 1700) return "Pro";
  if (value >= 1400) return "Advanced";
  if (value >= 1100) return "Intermediate";
  return "Beginner";
}

export const initialRatingTiers: Array<{
  id: InitialRatingTierId;
  label: string;
  rating: number;
  targetLevel: number;
  description: string;
}> = [
  { id: "tier_1", label: "T1 新手体验", rating: 800, targetLevel: 1, description: "第一次参赛或完全新人" },
  { id: "tier_2", label: "T2 入门稳定", rating: 968, targetLevel: 16, description: "了解规则，偶尔练习" },
  { id: "tier_3", label: "T3 基础选手", rating: 1103, targetLevel: 28, description: "能稳定完成比赛" },
  { id: "tier_4", label: "T4 普通参赛", rating: 1238, targetLevel: 40, description: "有一定准度，适合常规分组" },
  { id: "tier_5", label: "T5 进阶选手", rating: 1372, targetLevel: 52, description: "稳定得分，具备小组竞争力" },
  { id: "tier_6", label: "T6 强力选手", rating: 1507, targetLevel: 64, description: "明显高于平均，分组需平衡" },
  { id: "tier_7", label: "T7 主力选手", rating: 1642, targetLevel: 76, description: "队伍核心战力" },
  { id: "tier_8", label: "T8 种子选手", rating: 1777, targetLevel: 88, description: "高水平选手，建议作为种子" },
  { id: "tier_9", label: "T9 顶尖种子", rating: 1900, targetLevel: 99, description: "赛事最高档初始评级" }
];

export function getInitialRatingTier(value: string | null | undefined) {
  return initialRatingTiers.find((tier) => tier.id === value) || null;
}

function numberOrZero(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalize(value: number, floor: number, ceiling: number) {
  if (ceiling <= floor) return 0;
  return clamp(((value - floor) / (ceiling - floor)) * 100, 0, 100);
}

export function calculatePlayerLevel(input: {
  rating?: number | null;
  stats?: PlayerLevelStats | null;
  softRating?: number | null;
  softStats?: SoftPlayerLevelStats | null;
}): PlayerLevelResult {
  const stats = input.stats || {};
  const matchesPlayed = numberOrZero(stats.matchesPlayed);
  const wins = numberOrZero(stats.wins);
  const legsPlayed = numberOrZero(stats.legsPlayed);
  const legsWon = numberOrZero(stats.legsWon);
  const totalDarts = numberOrZero(stats.totalDarts);
  const turnsEstimate = Math.max(1, Math.ceil(totalDarts / 3), matchesPlayed * 8);
  const averagePer3Darts = numberOrZero(stats.averagePer3Darts);
  const rating = input.rating ?? 1000;
  const hasSteelEvidence =
    matchesPlayed > 0 ||
    legsPlayed > 0 ||
    totalDarts > 0 ||
    averagePer3Darts > 0 ||
    numberOrZero(stats.highestTurnScore) > 0 ||
    numberOrZero(stats.highestCheckout) > 0;

  const winRate = matchesPlayed > 0 ? wins / matchesPlayed : 0;
  const legsWinRate = legsPlayed > 0 ? legsWon / legsPlayed : winRate;
  const averageScore = normalize(averagePer3Darts, 25, 82);
  const resultScore = normalize(winRate, 0.25, 0.82);
  const legsScore = normalize(legsWinRate, 0.25, 0.82);
  const ratingScore = normalize(rating, 950, 1850);
  const scoringPowerScore = clamp(
    normalize(numberOrZero(stats.highestTurnScore), 60, 180) * 0.18 +
      normalize(numberOrZero(stats.highestCheckout), 20, 160) * 0.18 +
      normalize(numberOrZero(stats.count100Plus) / turnsEstimate, 0.03, 0.25) * 0.24 +
      normalize(numberOrZero(stats.count140Plus) / turnsEstimate, 0.005, 0.09) * 0.18 +
      normalize(numberOrZero(stats.count170Plus) / turnsEstimate, 0, 0.035) * 0.12 +
      normalize(numberOrZero(stats.countHighCheckout) / Math.max(1, matchesPlayed), 0, 0.35) * 0.1,
    0,
    100
  );
  const disciplinePenalty = clamp(numberOrZero(stats.bustCount) / Math.max(1, matchesPlayed) * 2.5, 0, 9);
  const ratingOnlyScore = clamp(normalize(rating, 800, 1900) * 0.98 + 1, 1, 99);

  const rawScore =
    averageScore * 0.38 +
    resultScore * 0.2 +
    legsScore * 0.12 +
    ratingScore * 0.18 +
    scoringPowerScore * 0.12 -
    disciplinePenalty;
  const confidence = hasSteelEvidence ? clamp(0.25 + matchesPlayed / 24, 0.25, 1) : 0.25;
  const ratingBaseline = ratingOnlyScore;
  const steelScore = hasSteelEvidence
    ? clamp(rawScore * confidence + ratingBaseline * (1 - confidence), 0, 100)
    : ratingOnlyScore;
  const softStats = input.softStats || null;
  const softMatchesPlayed = numberOrZero(softStats?.matchesPlayed);
  const softWins = numberOrZero(softStats?.wins);
  const softLegsPlayed = numberOrZero(softStats?.legsPlayed);
  const softLegsWon = numberOrZero(softStats?.legsWon);
  const softRating = input.softRating ?? 1000;
  const softWinRate = softMatchesPlayed > 0 ? softWins / softMatchesPlayed : 0;
  const softLegsWinRate = softLegsPlayed > 0 ? softLegsWon / softLegsPlayed : softWinRate;
  const softAverageScore = Math.max(
    normalize(numberOrZero(softStats?.averageScore), 35, 105),
    normalize(numberOrZero(softStats?.averageMpr), 1.2, 4.8) * 0.95
  );
  const softResultScore = normalize(softWinRate, 0.25, 0.82);
  const softLegsScore = normalize(softLegsWinRate, 0.25, 0.82);
  const softRatingScore = normalize(softRating, 950, 1700);
  const softPowerScore = clamp(
    normalize(numberOrZero(softStats?.highestCheckout), 20, 160) * 0.22 +
      normalize(numberOrZero(softStats?.countHighCheckout) / Math.max(1, softMatchesPlayed), 0, 0.35) * 0.16 +
      normalize(numberOrZero(softStats?.countTon80) / Math.max(1, softMatchesPlayed), 0, 0.7) * 0.22 +
      normalize(numberOrZero(softStats?.countHatTrick) / Math.max(1, softMatchesPlayed), 0, 1.2) * 0.2 +
      normalize(numberOrZero(softStats?.countWhiteHorse) / Math.max(1, softMatchesPlayed), 0, 0.45) * 0.2,
    0,
    100
  );
  const softRawScore =
    softAverageScore * 0.34 +
    softResultScore * 0.18 +
    softLegsScore * 0.12 +
    softRatingScore * 0.18 +
    softPowerScore * 0.18;
  const softConfidence = softMatchesPlayed > 0 ? clamp(0.25 + softMatchesPlayed / 30, 0.25, 0.92) : 0;
  const softRatingBaseline = clamp(softRatingScore * 0.38 + 5, 0, 48);
  const softScore =
    softMatchesPlayed > 0
      ? clamp(softRawScore * softConfidence + softRatingBaseline * (1 - softConfidence), 0, 72)
      : 0;
  const softWeight =
    softMatchesPlayed <= 0
      ? 0
      : matchesPlayed <= 0
        ? 1
        : clamp((softMatchesPlayed / Math.max(1, matchesPlayed + softMatchesPlayed)) * 0.45, 0.08, 0.35);
  const blendedScore =
    softWeight <= 0
      ? steelScore
      : matchesPlayed <= 0
        ? softScore
        : steelScore * (1 - softWeight) + softScore * softWeight;
  const blendedConfidence =
    softWeight <= 0
      ? confidence
      : matchesPlayed <= 0
        ? softConfidence
        : clamp(confidence * (1 - softWeight) + softConfidence * softWeight, 0.25, 1);
  const score = Number(clamp(blendedScore, 0, 100).toFixed(1));

  const level = clamp(Math.round(score), 1, 99);
  const bandIndex = rankBands.reduce(
    (currentIndex, band, index) => (level >= band.minLevel ? index : currentIndex),
    0
  );
  const band = rankBands[bandIndex];
  const nextBand = rankBands[bandIndex + 1] || null;
  const nextThreshold = nextBand?.minLevel ?? 100;
  const progress = clamp(
    (level - band.minLevel) / Math.max(1, nextThreshold - band.minLevel),
    0,
    1
  );

  return {
    majorRank: band.name,
    level,
    score,
    confidence: Number((blendedConfidence * 100).toFixed(0)),
    label: `${level}级 · ${band.name}`,
    nextMajorRank: nextBand?.name ?? null,
    progressToNext: Number((progress * 100).toFixed(0)),
    components: {
      average: Number(averageScore.toFixed(1)),
      result: Number(resultScore.toFixed(1)),
      legs: Number(legsScore.toFixed(1)),
      rating: Number(ratingScore.toFixed(1)),
      scoringPower: Number(scoringPowerScore.toFixed(1)),
      soft: Number(softScore.toFixed(1)),
      disciplinePenalty: Number(disciplinePenalty.toFixed(1))
    }
  };
}
