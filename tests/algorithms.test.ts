import { describe, expect, it } from "vitest";
import { generateBalancedTeams, generateGroups, generatePreferredBalancedTeams } from "@/lib/algorithms/grouping";
import {
  expandMixedDartRoundRobinMatches,
  generateLeaguePlayoffBracket,
  generateRoundRobinMatches,
  generateSingleEliminationBracket
} from "@/lib/algorithms/schedule";
import { adjudicateCurrentLegWinner, applyTurn, calculateDartStats, createScoringState } from "@/lib/algorithms/scoring";
import { resolveFirstThrowHandicap } from "@/lib/algorithms/first-throw-handicap";
import { updateTournamentStandings } from "@/lib/algorithms/standings";
import { updateUserRating } from "@/lib/algorithms/rating";
import { calculatePlayerLevel, getInitialRatingTier, initialRatingTiers, ratingToSkillLevel } from "@/lib/algorithms/player-level";
import {
  resolveMatchLegRules,
  validateMatchLegRules,
  getMatchDartMode,
  getMatchGameVariant,
  getMatchRulesSummary
} from "@/lib/darts/variants";
import { getSoftStatFields, mergeManualStats, ppdToPpr, pprToPpd } from "@/lib/darts/soft-stats";

const players = [
  { id: "u1", name: "A", rating: 1600 },
  { id: "u2", name: "B", rating: 1500 },
  { id: "u3", name: "C", rating: 1300 },
  { id: "u4", name: "D", rating: 1200 },
  { id: "u5", name: "E", rating: 1100 },
  { id: "u6", name: "F", rating: 1000 }
];

describe("team-first tournament algorithms", () => {
  it("generates balanced doubles teams", () => {
    const teams = generateBalancedTeams(players, { teamSize: 2 });
    expect(teams).toHaveLength(3);
    expect(teams.every((team) => team.members.length === 2)).toBe(true);
    expect(Math.max(...teams.map((team) => team.totalRating))).toBeLessThanOrEqual(2700);
  });

  it("keeps preferred doubles partners together before balancing", () => {
    const teams = generatePreferredBalancedTeams(players, {
      teamSize: 2,
      preferredPartnerByPlayerId: {
        u1: "u6"
      }
    });
    const preferredTeam = teams.find((team) =>
      team.members.some((member) => member.id === "u1")
    );
    expect(preferredTeam?.members.map((member) => member.id).sort()).toEqual(["u1", "u6"]);
  });

  it("uses snake distribution for balanced groups", () => {
    const teams = generateBalancedTeams(players, { teamSize: 2 }).map((team) => ({
      id: team.id,
      name: team.name,
      rating: team.totalRating
    }));
    const groups = generateGroups(teams, { groupCount: 2, balanced: true });
    expect(groups).toHaveLength(2);
    expect(groups[0].members.length + groups[1].members.length).toBe(3);
  });

  it("sorts standings by points, leg difference, head-to-head, then wins", () => {
    const participants = [
      { id: "team-a", name: "Team A", rating: 1000 },
      { id: "team-b", name: "Team B", rating: 1000 },
      { id: "team-c", name: "Team C", rating: 1000 },
      { id: "team-d", name: "Team D", rating: 1000 }
    ];
    const standings = updateTournamentStandings(participants, [
      {
        id: "m1",
        participant_a_id: "team-c",
        participant_b_id: "team-b",
        winner_participant_id: "team-c",
        score_a: 4,
        score_b: 2,
        status: "completed"
      },
      {
        id: "m2",
        participant_a_id: "team-a",
        participant_b_id: "team-c",
        winner_participant_id: "team-a",
        score_a: 4,
        score_b: 2,
        status: "completed"
      },
      {
        id: "m3",
        participant_a_id: "team-b",
        participant_b_id: "team-d",
        winner_participant_id: "team-b",
        score_a: 4,
        score_b: 2,
        status: "completed"
      }
    ]);

    expect(standings.map((row) => row.participantId)).toEqual(["team-a", "team-c", "team-b", "team-d"]);
  });

  it("generates round robin matches", () => {
    const matches = generateRoundRobinMatches(players.slice(0, 4), { groupName: "A" });
    expect(matches).toHaveLength(6);
    expect(matches[0].stage).toBe("group");
  });

  it("expands mixed dart round robin into one soft and one steel match per pair", () => {
    const matches = generateRoundRobinMatches(players.slice(0, 4), { groupName: "A" });
    const expanded = expandMixedDartRoundRobinMatches(matches, { firstDartMode: "soft" });
    const pairModes = new Map<string, Set<string>>();

    for (const match of expanded) {
      const key = [match.participantAId, match.participantBId].sort().join(":");
      pairModes.set(key, pairModes.get(key) || new Set());
      pairModes.get(key)?.add(match.forceDartMode || "");
    }

    expect(expanded).toHaveLength(12);
    expect([...pairModes.values()].every((modes) => modes.has("soft") && modes.has("steel"))).toBe(true);
  });

  it("generates knockout matches with byes", () => {
    const matches = generateSingleEliminationBracket(players.slice(0, 6));
    expect(matches.filter((match) => match.roundNumber === 1)).toHaveLength(4);
    expect(matches.some((match) => match.status === "bye")).toBe(true);
  });

  it("scores a simple leg and calculates stats", () => {
    let state = createScoringState({
      participantAId: "team-1",
      participantBId: "team-2",
      startingScore: 501,
      bestOf: 3
    });
    state = applyTurn(state, 180);
    state = applyTurn(state, 45);
    state = applyTurn(state, 180);
    expect(state.participants[0].remaining).toBe(141);
    const stats = calculateDartStats(state.participants[0].turns);
    expect(stats.highestTurnScore).toBe(180);
    expect(stats.count180).toBe(2);
  });

  it("starts 01 scoring from the selected first participant", () => {
    let state = createScoringState({
      participantAId: "team-1",
      participantBId: "team-2",
      startingScore: 501,
      bestOf: 3,
      firstParticipantId: "team-2"
    });

    expect(state.activeParticipantId).toBe("team-2");

    state = applyTurn(state, 60);

    expect(state.turns[0].participantId).toBe("team-2");
    expect(state.activeParticipantId).toBe("team-1");
  });

  it("can adjudicate a leg at the round limit without recording a checkout", () => {
    let state = createScoringState({
      participantAId: "team-1",
      participantBId: "team-2",
      startingScore: 501,
      bestOf: 3
    });

    state = applyTurn(state, 60);
    state = applyTurn(state, 45);
    state = adjudicateCurrentLegWinner(state, "team-2", { roundLimit: 10 });

    expect(state.participants[1].legsWon).toBe(1);
    expect(state.currentLeg).toBe(2);
    expect(state.activeParticipantId).toBe("team-2");
    expect(state.legResults[0]).toMatchObject({
      winnerParticipantId: "team-2",
      checkoutScore: null,
      resolutionReason: "round_limit",
      roundLimit: 10,
      remainingA: 441,
      remainingB: 456
    });
  });

  it("lets the previous leg winner start next leg in winner-start mode", () => {
    let state = createScoringState({
      participantAId: "team-1",
      participantBId: "team-2",
      startingScore: 301,
      bestOf: 3,
      firstThrowMode: "winner"
    });

    state = applyTurn(state, 180);
    state = applyTurn(state, 0);
    state = applyTurn(state, 121);

    expect(state.participants[0].legsWon).toBe(1);
    expect(state.currentLeg).toBe(2);
    expect(state.activeParticipantId).toBe("team-1");
  });

  it("lets the previous leg loser start next leg in loser-start mode", () => {
    let state = createScoringState({
      participantAId: "team-1",
      participantBId: "team-2",
      startingScore: 301,
      bestOf: 3,
      firstThrowMode: "loser"
    });

    state = applyTurn(state, 180);
    state = applyTurn(state, 0);
    state = applyTurn(state, 121);

    expect(state.participants[0].legsWon).toBe(1);
    expect(state.currentLeg).toBe(2);
    expect(state.activeParticipantId).toBe("team-2");
  });

  it("keeps the selected first participant starting every leg in fixed-start mode", () => {
    let state = createScoringState({
      participantAId: "team-1",
      participantBId: "team-2",
      startingScore: 301,
      bestOf: 3,
      firstParticipantId: "team-2",
      firstThrowMode: "fixed"
    });

    state = applyTurn(state, 180);
    state = applyTurn(state, 0);
    state = applyTurn(state, 121);

    expect(state.participants[1].legsWon).toBe(1);
    expect(state.currentLeg).toBe(2);
    expect(state.activeParticipantId).toBe("team-2");
  });

  it("recommends the weaker side first when first-throw handicap is triggered", () => {
    const handicap = resolveFirstThrowHandicap({
      participantA: { id: "strong", rating: 1900 },
      participantB: { id: "weaker", rating: 1000 },
      threshold: 10
    });

    expect(handicap.strongerParticipantId).toBe("strong");
    expect(handicap.firstParticipantId).toBe("weaker");
    expect(handicap.levelGap).toBeGreaterThanOrEqual(10);
  });

  it("does not recommend first-throw handicap below the threshold", () => {
    const handicap = resolveFirstThrowHandicap({
      participantA: { id: "team-1", rating: 1200 },
      participantB: { id: "team-2", rating: 1250 },
      threshold: 10
    });

    expect(handicap.firstParticipantId).toBeNull();
    expect(handicap.strongerParticipantId).toBeNull();
  });

  it("records the exact thrower for team scoring turns", () => {
    const legRules = [
      { legNumber: 1, participantMode: "team", dartMode: "steel", gameVariant: "501" },
      { legNumber: 2, participantMode: "team", dartMode: "steel", gameVariant: "501" },
      { legNumber: 3, participantMode: "team", dartMode: "steel", gameVariant: "501" }
    ] as const;
    let state = createScoringState({
      participantAId: "team-1",
      participantBId: "team-2",
      legRules: [...legRules],
      legLineups: [
        {
          legNumber: 1,
          participantAUserIds: ["u1", "u2"],
          participantBUserIds: ["u3", "u4"]
        }
      ]
    });

    state = applyTurn(state, 100, 3, "u1");

    expect(state.turns[0].userId).toBe("u1");
    expect(() => applyTurn(state, 60, 3, "u1")).toThrow(/lineup/i);
  });

  it("records checkout darts for accurate averages", () => {
    let state = createScoringState({
      participantAId: "team-1",
      participantBId: "team-2",
      startingScore: 501,
      bestOf: 3
    });
    state = applyTurn(state, 180);
    state = applyTurn(state, 0);
    state = applyTurn(state, 180);
    state = applyTurn(state, 0);
    state = applyTurn(state, 141, 2);
    const stats = calculateDartStats(state.participants[0].turns);
    expect(state.participants[0].legsWon).toBe(1);
    expect(stats.totalDarts).toBe(8);
    expect(stats.averagePer3Darts).toBe(187.88);
    expect(stats.highestCheckout).toBe(141);
    expect(stats.countHighCheckout).toBe(1);
    expect(stats.count100Plus).toBe(3);
    expect(stats.count170Plus).toBe(2);
  });

  it("supports hard dart 301 scoring", () => {
    let state = createScoringState({
      participantAId: "team-1",
      participantBId: "team-2",
      startingScore: 301,
      bestOf: 3
    });
    state = applyTurn(state, 180);
    state = applyTurn(state, 0);
    state = applyTurn(state, 121, 2);

    expect(state.participants[0].legsWon).toBe(1);
    expect(state.participants[0].remaining).toBe(301);
    expect(state.turns[2].legNumber).toBe(1);
  });

  it("runs a custom 501, 501, 301 sequence and plays all legs", () => {
    const legRules = [
      { legNumber: 1, participantMode: "doubles", dartMode: "steel", gameVariant: "501" },
      { legNumber: 2, participantMode: "singles", dartMode: "steel", gameVariant: "501" },
      { legNumber: 3, participantMode: "singles", dartMode: "steel", gameVariant: "301" }
    ] as const;
    let state = createScoringState({
      participantAId: "team-1",
      participantBId: "team-2",
      legRules: [...legRules],
      matchFinishMode: "play_all"
    });

    state = applyTurn(state, 180);
    state = applyTurn(state, 0);
    state = applyTurn(state, 180);
    state = applyTurn(state, 0);
    state = applyTurn(state, 141);
    expect(state.currentLeg).toBe(2);
    expect(state.participants[0].remaining).toBe(501);

    state = applyTurn(state, 180);
    state = applyTurn(state, 0);
    state = applyTurn(state, 180);
    state = applyTurn(state, 0);
    state = applyTurn(state, 141);
    expect(state.currentLeg).toBe(3);
    expect(state.participants[0].remaining).toBe(301);

    state = applyTurn(state, 180);
    state = applyTurn(state, 0);
    state = applyTurn(state, 121);

    expect(state.winnerParticipantId).toBe("team-1");
    expect(state.participants[0].legsWon).toBe(2);
    expect(state.participants[1].legsWon).toBe(1);
    expect(state.legResults.map((result) => result.gameVariant)).toEqual(["501", "501", "301"]);
  });

  it("validates no mixed dart modes and snow games as doubles only", () => {
    expect(
      validateMatchLegRules({
        dartMode: "steel",
        rules: [
          { legNumber: 1, participantMode: "doubles", dartMode: "steel", gameVariant: "501" },
          { legNumber: 2, participantMode: "doubles", dartMode: "soft", gameVariant: "soft_501" },
          { legNumber: 3, participantMode: "doubles", dartMode: "steel", gameVariant: "301" }
        ]
      })
    ).toContain("不能混合");
    expect(
      validateMatchLegRules({
        dartMode: "soft",
        rules: [
          { legNumber: 1, participantMode: "singles", dartMode: "soft", gameVariant: "snow_501" },
          { legNumber: 2, participantMode: "singles", dartMode: "soft", gameVariant: "soft_501" },
          { legNumber: 3, participantMode: "singles", dartMode: "soft", gameVariant: "soft_301" }
        ]
      })
    ).toContain("仅限双人");
  });

  it("resolves custom match rules for generated matches", () => {
    const rules = resolveMatchLegRules({
      matchRuleMode: "custom_legs",
      dartMode: "steel",
      customRules: [
        { legNumber: 1, participantMode: "doubles", dartMode: "steel", gameVariant: "501" },
        { legNumber: 2, participantMode: "singles", dartMode: "steel", gameVariant: "501" },
        { legNumber: 3, participantMode: "singles", dartMode: "steel", gameVariant: "301" }
      ]
    });

    expect(rules.map((rule) => `${rule.participantMode}-${rule.gameVariant}`)).toEqual([
      "doubles-501",
      "singles-501",
      "singles-301"
    ]);
  });

  it("adds upset bonus for lower-rated winners", () => {
    const result = updateUserRating({ winnerRating: 1000, loserRating: 1500 });
    expect(result.winnerDelta).toBeGreaterThan(10);
    expect(result.loserRatingAfter).toBeLessThan(1500);
  });

  it("can scale rating movement for lower-weight soft dart results", () => {
    const full = updateUserRating({ winnerRating: 1000, loserRating: 1400 });
    const soft = updateUserRating({ winnerRating: 1000, loserRating: 1400, weight: 0.45 });
    expect(soft.winnerDelta).toBeGreaterThan(0);
    expect(soft.winnerDelta).toBeLessThan(full.winnerDelta);
    expect(Math.abs(soft.loserDelta)).toBeLessThan(Math.abs(full.loserDelta));
  });

  it("alternates mixed tournaments by round", () => {
    const roundOne = getMatchDartMode({
      dartMode: "mixed_alternating",
      mixedFirstDartMode: "soft",
      roundNumber: 1
    });
    const roundTwo = getMatchDartMode({
      dartMode: "mixed_alternating",
      mixedFirstDartMode: "soft",
      roundNumber: 2
    });

    expect(roundOne).toBe("soft");
    expect(roundTwo).toBe("steel");
    expect(getMatchGameVariant({ matchDartMode: roundOne, softGame: "soft_cricket" })).toBe("soft_cricket");
  });

  it("builds CODL league playoff bracket from ranked standings", () => {
    const ranked = Array.from({ length: 8 }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Rank ${index + 1}`,
      rating: 1000,
      rank: index + 1
    }));
    const bracket = generateLeaguePlayoffBracket(ranked);

    expect(bracket).toHaveLength(7);
    expect(bracket.map((match) => `${match.roundNumber}-${match.matchNumber}:${match.participantAId || "TBD"}-${match.participantBId || "TBD"}`)).toEqual([
      "1-1:p5-p8",
      "1-2:p6-p7",
      "2-1:p4-TBD",
      "2-2:p3-TBD",
      "3-1:p1-TBD",
      "3-2:p2-TBD",
      "4-1:TBD-TBD"
    ]);
    expect(bracket[0].nextMatchTempId).toBe("P-R2-M1");
    expect(bracket[0].nextMatchSlot).toBe("B");
    expect(bracket[4].nextMatchTempId).toBe("P-R4-M1");
    expect(bracket[4].nextMatchSlot).toBe("A");
  });

  it("uses separate custom templates for mixed alternating rounds", () => {
    const templates = {
      steel: [
        { legNumber: 1, participantMode: "doubles", dartMode: "steel", gameVariant: "501" },
        { legNumber: 2, participantMode: "singles", dartMode: "steel", gameVariant: "501" },
        { legNumber: 3, participantMode: "singles", dartMode: "steel", gameVariant: "301" }
      ],
      soft: [
        { legNumber: 1, participantMode: "singles", dartMode: "soft", gameVariant: "soft_501" },
        { legNumber: 2, participantMode: "doubles", dartMode: "soft", gameVariant: "soft_501" },
        { legNumber: 3, participantMode: "singles", dartMode: "soft", gameVariant: "soft_cricket" },
        { legNumber: 4, participantMode: "doubles", dartMode: "soft", gameVariant: "soft_half_it" },
        { legNumber: 5, participantMode: "singles", dartMode: "soft", gameVariant: "soft_501" },
        { legNumber: 6, participantMode: "singles", dartMode: "soft", gameVariant: "soft_high_score" },
        { legNumber: 7, participantMode: "doubles", dartMode: "soft", gameVariant: "soft_701" }
      ]
    } as const;

    const roundOne = resolveMatchLegRules({
      matchRuleMode: "custom_legs",
      dartMode: "mixed_alternating",
      mixedFirstDartMode: "soft",
      roundNumber: 1,
      customRules: templates
    });
    const roundTwo = resolveMatchLegRules({
      matchRuleMode: "custom_legs",
      dartMode: "mixed_alternating",
      mixedFirstDartMode: "soft",
      roundNumber: 2,
      customRules: templates
    });

    expect(new Set(roundOne.map((rule) => rule.dartMode))).toEqual(new Set(["soft"]));
    expect(validateMatchLegRules({ dartMode: "soft", rules: [...roundOne] })).toBeNull();
    expect(roundOne.map((rule) => rule.gameVariant)).toEqual([
      "soft_501",
      "soft_501",
      "soft_cricket",
      "soft_half_it",
      "soft_501",
      "soft_high_score",
      "soft_701"
    ]);
    expect(new Set(roundTwo.map((rule) => rule.dartMode))).toEqual(new Set(["steel"]));
    expect(roundTwo.map((rule) => rule.gameVariant)).toEqual(["501", "501", "301"]);
  });

  it("summarizes mixed leg rules instead of naming only one stored match variant", () => {
    const summary = getMatchRulesSummary({
      dartMode: "soft",
      gameVariant: "soft_501",
      legRules: [
        { legNumber: 1, participantMode: "singles", dartMode: "soft", gameVariant: "soft_501" },
        { legNumber: 2, participantMode: "doubles", dartMode: "soft", gameVariant: "soft_cricket" },
        { legNumber: 3, participantMode: "singles", dartMode: "soft", gameVariant: "soft_high_score" }
      ]
    });

    expect(summary).toContain("混合赛制");
    expect(summary).toContain("3 局");
    expect(summary).toContain("501");
    expect(summary).toContain("Cricket");
    expect(summary).toContain("HIGH SCORE");
  });

  it("shows only variant-specific soft dart stat fields", () => {
    expect(getSoftStatFields("soft_501").map((field) => field.key)).toEqual([
      "averageScore",
      "countHatTrick",
      "countTon80",
      "highestCheckout",
      "countHighCheckout"
    ]);
    expect(getSoftStatFields("soft_cricket").map((field) => field.key)).toEqual([
      "averageMpr",
      "totalMarks",
      "count5Marks",
      "count6Marks",
      "count7Marks",
      "count9Marks",
      "countWhiteHorse"
    ]);
    expect(getSoftStatFields("soft_high_score").map((field) => field.key)).toEqual([
      "highestTurnScore",
      "countHatTrick",
      "countTon80"
    ]);
  });

  it("aggregates soft dart per-leg stats without losing 9 Mark", () => {
    expect(
      mergeManualStats([
        { averageMpr: 3, count9Marks: 1, countWhiteHorse: 0 },
        { averageMpr: 4, count9Marks: 2, countWhiteHorse: 1 }
      ])
    ).toMatchObject({
      averageMpr: 3.5,
      count9Marks: 3,
      countWhiteHorse: 1
    });
  });

  it("converts soft dart PPD to PPR for manual entry helpers", () => {
    expect(ppdToPpr(25.47)).toBe(76.41);
    expect(pprToPpd(76.41)).toBe(25.47);
  });

  it("keeps new players in the entry rank until enough data exists", () => {
    const level = calculatePlayerLevel({
      rating: 1000,
      stats: {
        matchesPlayed: 0,
        averagePer3Darts: 0
      }
    });

    expect(level.majorRank).toBe("白丁");
    expect(level.level).toBeLessThan(20);
    expect(level.level).toBeGreaterThanOrEqual(1);
    expect(level.level).toBeLessThanOrEqual(99);
  });

  it("does not cap steel 01 average at office-league high averages", () => {
    const strongOfficeAverage = calculatePlayerLevel({
      rating: 1000,
      stats: {
        averagePer3Darts: 82
      }
    });
    const eliteAverage = calculatePlayerLevel({
      rating: 1000,
      stats: {
        averagePer3Darts: 110
      }
    });

    expect(strongOfficeAverage.components.average).toBe(67.1);
    expect(eliteAverage.components.average).toBe(100);
  });

  it("maps rating tracks to the legacy coarse skill buckets consistently", () => {
    expect(ratingToSkillLevel(1000)).toBe("Beginner");
    expect(ratingToSkillLevel(1100)).toBe("Intermediate");
    expect(ratingToSkillLevel(1400)).toBe("Advanced");
    expect(ratingToSkillLevel(1700)).toBe("Pro");
  });

  it("offers nine initial rating tiers tied to the current rating buckets", () => {
    expect(initialRatingTiers).toHaveLength(9);
    expect(initialRatingTiers.map((tier) => tier.rating)).toEqual([
      800,
      968,
      1103,
      1238,
      1372,
      1507,
      1642,
      1777,
      1900
    ]);
    expect(initialRatingTiers.map((tier) => tier.targetLevel)).toEqual([
      1,
      16,
      28,
      40,
      52,
      64,
      76,
      88,
      99
    ]);
    expect(initialRatingTiers.map((tier) => ratingToSkillLevel(tier.rating))).toEqual([
      "Beginner",
      "Beginner",
      "Intermediate",
      "Intermediate",
      "Intermediate",
      "Advanced",
      "Advanced",
      "Pro",
      "Pro"
    ]);
    expect(initialRatingTiers.map((tier) => calculatePlayerLevel({ rating: tier.rating }).level)).toEqual([
      1,
      16,
      28,
      40,
      52,
      64,
      76,
      88,
      99
    ]);
    expect(getInitialRatingTier("tier_6")?.rating).toBe(1507);
    expect(getInitialRatingTier("missing")).toBeNull();
  });

  it("promotes strong players with high averages and win rates", () => {
    const level = calculatePlayerLevel({
      rating: 1680,
      stats: {
        matchesPlayed: 36,
        wins: 29,
        legsPlayed: 140,
        legsWon: 107,
        totalDarts: 2400,
        averagePer3Darts: 77,
        highestTurnScore: 180,
        highestCheckout: 151,
        countHighCheckout: 9,
        count100Plus: 190,
        count140Plus: 54,
        count170Plus: 14,
        count180: 9,
        bustCount: 7
      }
    });

    expect(level.score).toBeGreaterThan(75);
    expect(level.level).toBeGreaterThan(75);
    expect(["镖仙", "镖神", "归一"]).toContain(level.majorRank);
  });

  it("lets soft-only players earn a matching but capped level", () => {
    const level = calculatePlayerLevel({
      rating: 1000,
      stats: {
        matchesPlayed: 0
      },
      softRating: 1500,
      softStats: {
        matchesPlayed: 42,
        wins: 31,
        legsPlayed: 120,
        legsWon: 88,
        averageScore: 92,
        averageMpr: 3.6,
        highestCheckout: 140,
        countHighCheckout: 12,
        countTon80: 18,
        countHatTrick: 44,
        countWhiteHorse: 8
      }
    });

    expect(level.level).toBeGreaterThan(45);
    expect(level.level).toBeLessThanOrEqual(72);
  });
});
