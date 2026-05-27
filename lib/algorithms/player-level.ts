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

  const rawScore =
    averageScore * 0.38 +
    resultScore * 0.2 +
    legsScore * 0.12 +
    ratingScore * 0.18 +
    scoringPowerScore * 0.12 -
    disciplinePenalty;
  const confidence = clamp(0.25 + matchesPlayed / 24, 0.25, 1);
  const ratingBaseline = clamp(ratingScore * 0.45 + 4, 0, 55);
  const steelScore = clamp(rawScore * confidence + ratingBaseline * (1 - confidence), 0, 100);
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
