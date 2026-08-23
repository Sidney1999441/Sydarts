import { describe, expect, it } from "vitest";
import {
  calculateWeeklyStarExpectationAdjustment,
  evaluateWeeklyStars,
  getPreviousWeekStart,
  getShanghaiWeekStart,
  getTournamentWeekNumber,
  mergeWeeklyStarOverrides
} from "@/lib/tournaments/weekly-stars";

const identities = new Map([
  ["u1", { name: "甲", avatarUrl: null, teamName: "一队" }],
  ["u2", { name: "乙", avatarUrl: null, teamName: "二队" }]
]);
const members = new Map([
  ["p1", [{ userId: "u1" }]],
  ["p2", [{ userId: "u2" }]]
]);

describe("weekly tournament stars", () => {
  it("uses Shanghai Monday boundaries and finalizes only past weeks", () => {
    const now = new Date("2026-08-17T04:00:00.000Z");
    expect(getShanghaiWeekStart(now)).toBe("2026-08-17");
    expect(getPreviousWeekStart(now)).toBe("2026-08-10");
    expect(getTournamentWeekNumber("2026-08-11T00:30:00+08:00", "2026-08-10")).toBe(1);
    expect(getTournamentWeekNumber("2026-08-11T00:30:00+08:00", "2026-08-17")).toBe(2);

    const evaluation = evaluateWeeklyStars({
      now,
      participantMembersById: members,
      identitiesByUserId: identities,
      matches: [
        {
          id: "last-week",
          status: "completed",
          updated_at: "2026-08-16T15:30:00.000Z",
          participant_a_id: "p1",
          participant_b_id: "p2",
          winner_participant_id: "p1",
          dart_mode: "steel",
          details: {
            legResults: [{
              legNumber: 1,
              dartMode: "steel",
              winnerParticipantId: "p1",
              userStats: { u1: { averagePer3Darts: 72 }, u2: { averagePer3Darts: 68 } }
            }]
          }
        },
        {
          id: "current-week",
          status: "completed",
          updated_at: "2026-08-16T16:30:00.000Z",
          participant_a_id: "p1",
          participant_b_id: "p2",
          winner_participant_id: "p2",
          dart_mode: "steel",
          details: {
            legResults: [{
              legNumber: 1,
              dartMode: "steel",
              winnerParticipantId: "p2",
              userStats: { u1: { averagePer3Darts: 80 }, u2: { averagePer3Darts: 82 } }
            }]
          }
        }
      ]
    });

    expect(evaluation.automaticStars).toHaveLength(1);
    expect(evaluation.automaticStars[0]).toMatchObject({ weekStart: "2026-08-10", userId: "u1" });
  });

  it("compares soft and steel form on normalized scales", () => {
    const evaluation = evaluateWeeklyStars({
      now: new Date("2026-08-17T04:00:00.000Z"),
      participantMembersById: members,
      identitiesByUserId: identities,
      matches: [
        {
          id: "mixed-week",
          status: "completed",
          updated_at: "2026-08-13T12:00:00.000Z",
          participant_a_id: "p1",
          participant_b_id: "p2",
          winner_participant_id: "p2",
          dart_mode: "soft",
          details: {
            legResults: [{
              legNumber: 1,
              dartMode: "soft",
              gameVariant: "soft_cricket",
              winnerParticipantId: "p2",
              userStats: {
                u1: { averageMpr: 3.2, countWhiteHorse: 1 },
                u2: { averageScore: 75, countHatTrick: 2 }
              }
            }]
          }
        }
      ]
    });

    expect(evaluation.automaticStars[0].userId).toBe("u2");
    expect(evaluation.automaticStars[0].reason).toContain("本周 1 场 1 胜");
  });

  it("lets an administrator override a week and restore actual metrics when available", () => {
    const now = new Date("2026-08-17T04:00:00.000Z");
    const evaluation = evaluateWeeklyStars({
      now,
      participantMembersById: members,
      identitiesByUserId: identities,
      matches: [
        {
          id: "m1",
          status: "completed",
          updated_at: "2026-08-13T12:00:00.000Z",
          participant_a_id: "p1",
          participant_b_id: "p2",
          winner_participant_id: "p1",
          dart_mode: "steel",
          details: {
            legResults: [{
              legNumber: 1,
              dartMode: "steel",
              winnerParticipantId: "p1",
              userStats: { u1: { averagePer3Darts: 75 }, u2: { averagePer3Darts: 91, count180: 1 } }
            }]
          }
        }
      ]
    });

    const merged = mergeWeeklyStarOverrides({
      evaluation,
      identitiesByUserId: identities,
      now,
      overrides: [{ week_start: "2026-08-10", user_id: "u2", reason: "关键局表现突出" }]
    });

    expect(merged[0]).toMatchObject({ userId: "u2", source: "manual", reason: "关键局表现突出" });
    expect(merged[0].metrics.bestAverage).toBe(91);
  });

  it("derives a hard-dart weekly peak from a single leg instead of the match summary", () => {
    const evaluation = evaluateWeeklyStars({
      now: new Date("2026-08-17T04:00:00.000Z"),
      participantMembersById: members,
      identitiesByUserId: identities,
      turnsByMatchId: new Map([
        ["m-turns", [
          { participantId: "p1", userId: "u1", legNumber: 1, score: 60, darts: 3, remainingBefore: 501, remainingAfter: 441, isBust: false, isCheckout: false },
          { participantId: "p1", userId: "u1", legNumber: 2, score: 120, darts: 3, remainingBefore: 501, remainingAfter: 381, isBust: false, isCheckout: false },
          { participantId: "p2", userId: "u2", legNumber: 1, score: 45, darts: 3, remainingBefore: 501, remainingAfter: 456, isBust: false, isCheckout: false }
        ]]
      ]),
      matches: [{
        id: "m-turns",
        status: "completed",
        updated_at: "2026-08-13T12:00:00.000Z",
        participant_a_id: "p1",
        participant_b_id: "p2",
        winner_participant_id: "p1",
        dart_mode: "steel",
        details: { userStats: { u1: { averagePer3Darts: 90 } } }
      }]
    });

    expect(evaluation.automaticStars[0].metrics.bestAverage).toBe(120);
  });

  it("raises the automatic selection bar only for an isolated high-level outlier", () => {
    expect(calculateWeeklyStarExpectationAdjustment(70, [70, 36, 21, 9, 7])).toBeGreaterThan(15);
    expect(calculateWeeklyStarExpectationAdjustment(36, [70, 36, 21, 9, 7])).toBe(0);
    expect(calculateWeeklyStarExpectationAdjustment(70, [70, 66, 21, 9, 7])).toBe(0);

    const adjustedIdentities = new Map([
      ["u1", { name: "强者", avatarUrl: null, teamName: "一队", strengthLevel: 70 }],
      ["u2", { name: "进步选手", avatarUrl: null, teamName: "二队", strengthLevel: 36 }],
      ["u3", { name: "丙", avatarUrl: null, teamName: "三队", strengthLevel: 21 }],
      ["u4", { name: "丁", avatarUrl: null, teamName: "四队", strengthLevel: 9 }]
    ]);
    const adjustedMembers = new Map([
      ["p1", [{ userId: "u1" }]],
      ["p2", [{ userId: "u2" }]],
      ["p3", [{ userId: "u3" }]],
      ["p4", [{ userId: "u4" }]]
    ]);
    const evaluation = evaluateWeeklyStars({
      now: new Date("2026-08-17T04:00:00.000Z"),
      participantMembersById: adjustedMembers,
      identitiesByUserId: adjustedIdentities,
      matches: [
        completedSteelMatch("strong-routine", "p1", "p3", "p1", { u1: 90, u3: 52 }),
        completedSteelMatch("improver-win", "p2", "p4", "p2", { u2: 75, u4: 40 })
      ]
    });

    const candidates = evaluation.candidatesByWeek.get("2026-08-10") || [];
    const strongCandidate = candidates.find((candidate) => candidate.userId === "u1");
    expect(strongCandidate?.rawScore).toBeGreaterThan(
      candidates.find((candidate) => candidate.userId === "u2")?.rawScore || 0
    );
    expect(strongCandidate?.expectationAdjustment).toBeGreaterThan(15);
    expect(evaluation.automaticStars[0].userId).toBe("u2");
  });

  it("still allows an isolated high-level player to win with an exceptional week", () => {
    const adjustedIdentities = new Map([
      ["u1", { name: "强者", avatarUrl: null, teamName: "一队", strengthLevel: 70 }],
      ["u2", { name: "乙", avatarUrl: null, teamName: "二队", strengthLevel: 36 }],
      ["u3", { name: "丙", avatarUrl: null, teamName: "三队", strengthLevel: 21 }],
      ["u4", { name: "丁", avatarUrl: null, teamName: "四队", strengthLevel: 9 }]
    ]);
    const adjustedMembers = new Map([
      ["p1", [{ userId: "u1" }]],
      ["p2", [{ userId: "u2" }]],
      ["p3", [{ userId: "u3" }]],
      ["p4", [{ userId: "u4" }]]
    ]);
    const evaluation = evaluateWeeklyStars({
      now: new Date("2026-08-17T04:00:00.000Z"),
      participantMembersById: adjustedMembers,
      identitiesByUserId: adjustedIdentities,
      matches: [
        completedSteelMatch("strong-win-1", "p1", "p3", "p1", { u1: 104, u3: 52 }),
        completedSteelMatch("strong-win-2", "p1", "p4", "p1", { u1: 110, u4: 40 }),
        completedSteelMatch("other-win", "p2", "p3", "p2", { u2: 75, u3: 52 })
      ]
    });

    expect(evaluation.automaticStars[0].userId).toBe("u1");
    expect(evaluation.automaticStars[0].reason).toContain("更高表现预期");
  });
});

function completedSteelMatch(
  id: string,
  participantAId: string,
  participantBId: string,
  winnerParticipantId: string,
  averagesByUserId: Record<string, number>
) {
  return {
    id,
    status: "completed",
    updated_at: "2026-08-13T12:00:00.000Z",
    participant_a_id: participantAId,
    participant_b_id: participantBId,
    winner_participant_id: winnerParticipantId,
    dart_mode: "steel" as const,
    details: {
      legResults: [{
        legNumber: 1,
        dartMode: "steel",
        winnerParticipantId,
        userStats: Object.fromEntries(
          Object.entries(averagesByUserId).map(([userId, averagePer3Darts]) => [
            userId,
            { averagePer3Darts }
          ])
        )
      }]
    }
  };
}
