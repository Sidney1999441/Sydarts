import { describe, expect, it } from "vitest";
import { buildAchievements, summarizeAchievements } from "@/lib/achievements";

describe("achievements", () => {
  it("unlocks CODL achievements from existing stats", () => {
    const achievements = buildAchievements({
      generalStats: {
        matches_played: 12,
        wins: 8,
        legs_played: 40,
        legs_won: 26,
        average_per_3_darts: 72,
        highest_turn_score: 180,
        highest_checkout: 121,
        count_high_checkout: 6,
        count_100_plus: 24,
        count_140_plus: 11,
        count_170_plus: 3,
        count_180: 5
      },
      tournamentStats: {
        matches_played: 6,
        wins: 3,
        highest_checkout: 100
      },
      softStats: {
        matches_played: 4,
        wins: 2,
        average_score: 61,
        count_hat_trick: 1,
        count_white_horse: 1,
        count_9_marks: 1,
        count_ton80: 1,
        total_marks: 220
      }
    });

    const unlockedIds = achievements.filter((achievement) => achievement.unlocked).map((achievement) => achievement.id);
    expect(unlockedIds).toContain("first-match");
    expect(unlockedIds).toContain("first-win");
    expect(unlockedIds).toContain("max-score");
    expect(unlockedIds).toContain("checkout-master");
    expect(unlockedIds).toContain("white-horse");
    expect(unlockedIds).toContain("nine-mark");
    expect(unlockedIds).toContain("soft-engine");

    const summary = summarizeAchievements(achievements);
    expect(summary.unlockedCount).toBeGreaterThan(10);
    expect(summary.completion).toBeGreaterThan(50);
  });
});
