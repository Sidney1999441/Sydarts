import { calculateDartStats, type ScoreTurn } from "@/lib/algorithms/scoring";
import type { MatchLegResult } from "@/types/domain";

export type LegUserStats = {
  legNumber: number;
  userStats: Record<string, ReturnType<typeof calculateDartStats>>;
};

export function buildLegUserStatsFromTurns(turns: ScoreTurn[]): LegUserStats[] {
  const legNumbers = [...new Set(turns.map((turn) => turn.legNumber).filter((legNumber) => legNumber > 0))]
    .sort((a, b) => a - b);

  return legNumbers.flatMap((legNumber) => {
    const legTurns = turns.filter((turn) => turn.legNumber === legNumber);
    const userIds = [...new Set(legTurns.map((turn) => turn.userId).filter(Boolean))] as string[];
    if (userIds.length === 0) return [];

    return [{
      legNumber,
      userStats: Object.fromEntries(
        userIds.map((userId) => [
          userId,
          calculateDartStats(legTurns.filter((turn) => turn.userId === userId))
        ])
      )
    }];
  });
}

export function attachLegUserStatsFromTurns(legResults: MatchLegResult[], turns: ScoreTurn[]) {
  const statsByLeg = new Map(
    buildLegUserStatsFromTurns(turns).map((entry) => [entry.legNumber, entry.userStats])
  );

  return legResults.map((result) => {
    const userStats = statsByLeg.get(result.legNumber);
    return userStats ? { ...result, userStats } : result;
  });
}
