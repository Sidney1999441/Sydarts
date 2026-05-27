export type RatingResult = {
  winnerDelta: number;
  loserDelta: number;
  winnerRatingAfter: number;
  loserRatingAfter: number;
};

export function updateUserRating(input: {
  winnerRating: number;
  loserRating: number;
  weight?: number;
  ratingFloor?: number;
}): RatingResult {
  const ratingGap = input.loserRating - input.winnerRating;
  const upsetBonus = ratingGap > 0 ? Math.min(10, Math.floor(ratingGap / 100) * 2) : 0;
  const weight = input.weight ?? 1;
  const scaleDelta = (delta: number) => {
    if (weight === 1) return delta;
    const scaled = Math.round(Math.abs(delta) * weight);
    return Math.sign(delta) * Math.max(2, scaled);
  };
  const winnerDelta = scaleDelta(10 + upsetBonus);
  const loserDelta = scaleDelta(-Math.max(5, 10 - Math.floor(Math.max(0, ratingGap) / 200)));

  return {
    winnerDelta,
    loserDelta,
    winnerRatingAfter: input.winnerRating + winnerDelta,
    loserRatingAfter: Math.max(input.ratingFloor ?? 100, input.loserRating + loserDelta)
  };
}
