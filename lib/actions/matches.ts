"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { calculateDartStats, type ScoreTurn } from "@/lib/algorithms/scoring";
import { updateUserRating } from "@/lib/algorithms/rating";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { getLegStartingScore } from "@/lib/darts/variants";
import { hasSameResultSubmission } from "@/lib/results/submission";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fromFormString } from "@/lib/utils";
import type { MatchDartMode, MatchLegLineup, MatchLegResult, MatchLegRule } from "@/types/domain";

const SOFT_RATING_WEIGHT = 0.45;
const resultSubmissionIdSchema = z.string().uuid();

const manualStatsSchema = z.object({
  averageScore: z.number().min(0).optional(),
  averageMpr: z.number().min(0).optional(),
  countTon80: z.number().int().min(0).optional(),
  countHatTrick: z.number().int().min(0).optional(),
  highestCheckout: z.number().int().min(0).optional(),
  countHighCheckout: z.number().int().min(0).optional(),
  countWhiteHorse: z.number().int().min(0).optional(),
  totalMarks: z.number().int().min(0).optional(),
  count5Marks: z.number().int().min(0).optional(),
  count6Marks: z.number().int().min(0).optional(),
  count7Marks: z.number().int().min(0).optional(),
  count9Marks: z.number().int().min(0).optional(),
  averagePer3Darts: z.number().min(0).optional(),
  totalScoredPoints: z.number().int().min(0).optional(),
  totalDarts: z.number().int().min(0).optional(),
  highestTurnScore: z.number().int().min(0).optional(),
  bustCount: z.number().int().min(0).optional(),
  checkoutCount: z.number().int().min(0).optional(),
  count60Plus: z.number().int().min(0).optional(),
  count80Plus: z.number().int().min(0).optional(),
  count180: z.number().int().min(0).optional(),
  count100Plus: z.number().int().min(0).optional(),
  count140Plus: z.number().int().min(0).optional(),
  count170Plus: z.number().int().min(0).optional()
});

type ManualSoftStats = {
  averageScore?: number;
  averageMpr?: number;
  countTon80?: number;
  countHatTrick?: number;
  highestCheckout?: number;
  countHighCheckout?: number;
  countWhiteHorse?: number;
  totalMarks?: number;
  count5Marks?: number;
  count6Marks?: number;
  count7Marks?: number;
  count9Marks?: number;
  averagePer3Darts?: number;
  totalScoredPoints?: number;
  totalDarts?: number;
  highestTurnScore?: number;
  bustCount?: number;
  checkoutCount?: number;
  count60Plus?: number;
  count80Plus?: number;
  count180?: number;
  count100Plus?: number;
  count140Plus?: number;
  count170Plus?: number;
};

type ManualStatsById = Record<string, ManualSoftStats>;
type ResultStatsById = Record<string, ManualSoftStats | ReturnType<typeof calculateDartStats>>;
type SettlementStatsScope = "tournament" | "general" | "soft";

type SettlementRatingLog = {
  userId: string;
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
  reason: "match_win" | "match_loss";
  ratingScope: "tournament" | "general" | "soft";
  matchSource: "tournament" | "tournament_soft";
};

type SettlementStatEvent = {
  userId: string;
  statsScope: SettlementStatsScope;
  won: boolean;
  legsWon: number;
  legsLost: number;
  totalScoredPoints?: number;
  totalDarts?: number;
  highestTurnScore?: number;
  bustCount?: number;
  checkoutCount?: number;
  highestCheckout?: number;
  countHighCheckout?: number;
  count60Plus?: number;
  count80Plus?: number;
  count180?: number;
  count100Plus?: number;
  count140Plus?: number;
  count170Plus?: number;
  averageScore?: number | null;
  averageScoreSamples?: number;
  averageMpr?: number | null;
  averageMprSamples?: number;
  countTon80?: number;
  countHatTrick?: number;
  countWhiteHorse?: number;
  totalMarks?: number;
  count5Marks?: number;
  count6Marks?: number;
  count7Marks?: number;
  count9Marks?: number;
};

function submissionIdFromForm(formData: FormData) {
  const raw = fromFormString(formData.get("submission_id"));
  return raw ? resultSubmissionIdSchema.parse(raw) : undefined;
}

const completeMatchSchema = z.object({
  matchId: z.string().uuid(),
  submissionId: z.string().uuid().optional(),
  winnerParticipantId: z.string().uuid(),
  scoreA: z.number().int().min(0),
  scoreB: z.number().int().min(0),
  turns: z.array(
    z.object({
      participantId: z.string(),
      userId: z.string().uuid().optional(),
      score: z.number(),
      darts: z.number().optional(),
      legNumber: z.number().int().min(1).default(1),
      remainingBefore: z.number(),
      remainingAfter: z.number(),
      isBust: z.boolean(),
      isCheckout: z.boolean()
    })
  ),
  legResults: z.array(
    z.object({
      legNumber: z.number().int().min(1),
      winnerParticipantId: z.string().uuid(),
      participantMode: z.enum(["singles", "doubles", "team"]),
      dartMode: z.enum(["steel", "soft"]),
      gameVariant: z.string(),
      participantAUserIds: z.array(z.string().uuid()).default([]),
      participantBUserIds: z.array(z.string().uuid()).default([]),
      checkoutScore: z.number().nullable().optional(),
      scoreA: z.number().nullable().optional(),
      scoreB: z.number().nullable().optional(),
      resolutionReason: z.enum(["checkout", "round_limit"]).optional(),
      roundLimit: z.number().int().positive().nullable().optional(),
      remainingA: z.number().int().min(0).nullable().optional(),
      remainingB: z.number().int().min(0).nullable().optional(),
      userStats: z.record(z.string().uuid(), manualStatsSchema).optional()
    })
  ).default([]),
  legLineups: z.array(
    z.object({
      legNumber: z.number().int().min(1),
      participantAUserIds: z.array(z.string().uuid()).default([]),
      participantBUserIds: z.array(z.string().uuid()).default([])
    })
  ).default([]),
  userStats: z.record(z.string().uuid(), manualStatsSchema).default({})
});

const completeCasualMatchSchema = z.object({
  submissionId: z.string().uuid().optional(),
  opponentName: z.string().trim().min(1).max(80),
  opponentUserId: z.string().uuid().optional().nullable(),
  startingScore: z.union([z.literal(301), z.literal(501), z.literal(701)]),
  bestOf: z.union([z.literal(3), z.literal(5), z.literal(7)]),
  participantMode: z.enum(["singles", "doubles"]).default("singles"),
  participantMembers: z.object({
    A: z.array(z.object({
      userId: z.string().trim().min(1).max(120),
      name: z.string().trim().min(1).max(80),
      linked: z.boolean().optional().default(false)
    })).default([]),
    B: z.array(z.object({
      userId: z.string().trim().min(1).max(120),
      name: z.string().trim().min(1).max(80),
      linked: z.boolean().optional().default(false)
    })).default([])
  }).default({ A: [], B: [] }),
  winnerSide: z.enum(["A", "B"]),
  scoreA: z.number().int().min(0),
  scoreB: z.number().int().min(0),
  legResults: z.array(
    z.object({
      legNumber: z.number().int().min(1),
      winnerParticipantId: z.enum(["me", "opponent"]),
      participantMode: z.enum(["singles", "doubles", "team"]),
      dartMode: z.enum(["steel", "soft"]),
      gameVariant: z.string(),
      participantAUserIds: z.array(z.string()).default([]),
      participantBUserIds: z.array(z.string()).default([]),
      checkoutScore: z.number().nullable().optional(),
      scoreA: z.number().nullable().optional(),
      scoreB: z.number().nullable().optional(),
      resolutionReason: z.enum(["checkout", "round_limit"]).optional(),
      roundLimit: z.number().int().positive().nullable().optional(),
      remainingA: z.number().int().min(0).nullable().optional(),
      remainingB: z.number().int().min(0).nullable().optional()
    })
  ).default([]),
  legLineups: z.array(
    z.object({
      legNumber: z.number().int().min(1),
      participantAUserIds: z.array(z.string()).default([]),
      participantBUserIds: z.array(z.string()).default([])
    })
  ).default([]),
  turns: z.array(
    z.object({
      participantId: z.enum(["me", "opponent"]),
      userId: z.string().trim().min(1).max(120).optional(),
      score: z.number(),
      darts: z.number().optional(),
      legNumber: z.number().int().min(1).default(1),
      remainingBefore: z.number(),
      remainingAfter: z.number(),
      isBust: z.boolean(),
      isCheckout: z.boolean()
    })
  )
});

type CasualMatchInput = z.infer<typeof completeCasualMatchSchema>;
type CasualTurnInput = CasualMatchInput["turns"][number];
type CasualSide = "A" | "B";
type CasualMemberInput = CasualMatchInput["participantMembers"]["A"][number];
type CasualProfile = {
  id: string;
  display_name: string | null;
  rating: number | null;
  casual_rating: number | null;
};
type CasualRatingOutcome = {
  side: CasualSide;
  name: string;
  before: number;
  after: number;
  delta: number;
};
type CasualTurnMetaEntry = {
  turnNumber?: number;
  side?: CasualSide;
  legNumber?: number;
  userId?: string | null;
};
type CasualTurnRow = {
  side: CasualSide;
  turn_number: number;
  score: number;
  darts?: number | null;
  remaining_before: number;
  remaining_after: number;
  is_bust: boolean;
  is_checkout: boolean;
};

function personalCasualTurns(turns: CasualTurnInput[], participantId: "me" | "opponent", userId: string) {
  const sideTurns = turns.filter((turn) => turn.participantId === participantId);
  const userTurns = sideTurns.filter((turn) => turn.userId === userId);
  return userTurns.length > 0 ? userTurns : sideTurns;
}

function casualTurnMeta(values: CasualMatchInput) {
  const memberNameByUserId = new Map<string, string>();
  for (const member of [...values.participantMembers.A, ...values.participantMembers.B]) {
    memberNameByUserId.set(member.userId, member.name);
  }
  return values.turns.map((turn, index) => ({
    turnNumber: index + 1,
    side: turn.participantId === "me" ? "A" : "B",
    legNumber: turn.legNumber,
    userId: turn.userId || null,
    userName: turn.userId ? memberNameByUserId.get(turn.userId) || null : null
  }));
}

function isUuidValue(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function participantIdForCasualSide(side: CasualSide) {
  return side === "A" ? "me" : "opponent";
}

function linkedCasualMembers(values: CasualMatchInput, side: CasualSide) {
  return (values.participantMembers[side] || []).filter(
    (member) => member.linked && isUuidValue(member.userId)
  );
}

function allLinkedCasualMemberIds(values: CasualMatchInput) {
  return [...linkedCasualMembers(values, "A"), ...linkedCasualMembers(values, "B")].map((member) => member.userId);
}

function ratingFromCasualProfile(profile?: CasualProfile | null) {
  return profile?.casual_rating ?? profile?.rating ?? 1000;
}

function normalizeCasualMembers(
  values: CasualMatchInput,
  profileById: Map<string, CasualProfile>
): CasualMatchInput["participantMembers"] {
  const normalize = (members: CasualMemberInput[]) =>
    members.map((member) => {
      const profile = member.linked ? profileById.get(member.userId) : null;
      return {
        ...member,
        name: profile?.display_name || member.name
      };
    });

  return {
    A: normalize(values.participantMembers.A || []),
    B: normalize(values.participantMembers.B || [])
  };
}

function averageCasualRating(members: CasualMemberInput[], profileById: Map<string, CasualProfile>) {
  if (members.length === 0) return 1000;
  const total = members.reduce((sum, member) => sum + ratingFromCasualProfile(profileById.get(member.userId)), 0);
  return Math.round(total / members.length);
}

function buildCasualMemberRatingOutcomes(input: {
  winnerSide: CasualSide;
  membersA: CasualMemberInput[];
  membersB: CasualMemberInput[];
  profileById: Map<string, CasualProfile>;
}) {
  const opponentAverageBySide: Record<CasualSide, number> = {
    A: averageCasualRating(input.membersB, input.profileById),
    B: averageCasualRating(input.membersA, input.profileById)
  };
  const outcomes: Record<string, CasualRatingOutcome> = {};

  for (const side of ["A", "B"] as CasualSide[]) {
    const members = side === "A" ? input.membersA : input.membersB;
    for (const member of members) {
      const before = ratingFromCasualProfile(input.profileById.get(member.userId));
      const result =
        side === input.winnerSide
          ? updateUserRating({ winnerRating: before, loserRating: opponentAverageBySide[side] })
          : updateUserRating({ winnerRating: opponentAverageBySide[side], loserRating: before });
      const after = side === input.winnerSide ? result.winnerRatingAfter : result.loserRatingAfter;
      outcomes[member.userId] = {
        side,
        name: member.name,
        before,
        after,
        delta: after - before
      };
    }
  }

  return outcomes;
}

function buildCasualMemberStats(values: CasualMatchInput, members: CasualMemberInput[], side: CasualSide) {
  return Object.fromEntries(
    members.map((member) => [
      member.userId,
      calculateDartStats(personalCasualTurns(values.turns, participantIdForCasualSide(side), member.userId))
    ])
  );
}

async function applyCasualLinkedMemberSettlement(input: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  casualMatchId: string;
  userId: string;
  won: boolean;
  legsWon: number;
  legsLost: number;
  stats: ReturnType<typeof calculateDartStats>;
  ratingOutcome: CasualRatingOutcome;
  note: string;
}) {
  const { error: profileError } = await input.admin
    .from("profiles")
    .update({ casual_rating: input.ratingOutcome.after })
    .eq("id", input.userId);
  if (profileError) throw new Error(profileError.message);

  const { error: ratingLogError } = await input.admin.from("rating_logs").insert({
    user_id: input.userId,
    casual_match_id: input.casualMatchId,
    rating_before: input.ratingOutcome.before,
    rating_after: input.ratingOutcome.after,
    delta: input.ratingOutcome.delta,
    reason: input.won ? "match_win" : "match_loss",
    note: input.note,
    rating_scope: "general",
    match_source: "casual"
  });
  if (ratingLogError) throw new Error(ratingLogError.message);

  const { error: statsError } = await input.admin.rpc(
    "upsert_general_match_stats",
    buildStatsRpcPayload({
      userId: input.userId,
      won: input.won,
      legsWon: input.legsWon,
      legsLost: input.legsLost,
      stats: input.stats
    })
  );
  if (statsError) throw new Error(statsError.message);
}

function statsFromCasualRowsForMember(rows: CasualTurnRow[], turnMeta: CasualTurnMetaEntry[], userId: string) {
  const hasPersonalTurnMeta = turnMeta.some((item) => item.side === "B" && item.userId === userId);
  const personalRows = hasPersonalTurnMeta
    ? rows.filter((turn) =>
        turnMeta.some((item) => item.side === "B" && item.turnNumber === turn.turn_number && item.userId === userId)
      )
    : rows;

  return calculateDartStats(
    personalRows.map((turn) => {
      const meta = turnMeta.find((item) => item.side === "B" && item.turnNumber === turn.turn_number);
      return {
        participantId: "opponent",
        userId: meta?.userId || undefined,
        legNumber: meta?.legNumber || 1,
        score: turn.score,
        darts: turn.darts || 3,
        remainingBefore: turn.remaining_before,
        remainingAfter: turn.remaining_after,
        isBust: turn.is_bust,
        isCheckout: turn.is_checkout
      };
    })
  );
}

async function assertMatchMember(matchId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("is_match_member", {
    check_user_id: userId,
    check_match_id: matchId
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("You are not a participant in this match.");
}

async function getTeamUserIds(admin: ReturnType<typeof createSupabaseAdminClient>, participantId: string) {
  const { data: participant, error } = await admin
    .from("tournament_participants")
    .select("user_id, team_id, participant_type")
    .eq("id", participantId)
    .single();

  if (error) throw new Error(error.message);
  if (participant.participant_type === "user") return participant.user_id ? [participant.user_id] : [];

  const { data: members, error: memberError } = await admin
    .from("team_members")
    .select("user_id")
    .eq("team_id", participant.team_id);

  if (memberError) throw new Error(memberError.message);
  return (members || []).map((member) => member.user_id);
}

function userIdsFromLineups(input: {
  participantId: string;
  participantAId: string;
  participantBId: string;
  fallbackUserIds: string[];
  lineups?: MatchLegLineup[];
}) {
  const selected = new Set<string>();
  for (const lineup of input.lineups || []) {
    const ids =
      input.participantId === input.participantAId
        ? lineup.participantAUserIds
        : input.participantId === input.participantBId
          ? lineup.participantBUserIds
          : [];
    ids.forEach((id) => selected.add(id));
  }
  return selected.size > 0 ? [...selected] : input.fallbackUserIds;
}

function turnLineupUserIds(input: {
  turn: Pick<ScoreTurn, "participantId" | "legNumber">;
  participantAId: string;
  participantBId: string;
  lineups: MatchLegLineup[];
}) {
  const lineup = input.lineups.find((item) => item.legNumber === input.turn.legNumber);
  if (!lineup) return [];
  if (input.turn.participantId === input.participantAId) return lineup.participantAUserIds || [];
  if (input.turn.participantId === input.participantBId) return lineup.participantBUserIds || [];
  return [];
}

function assertTurnUsersInLineups(input: {
  turns: ScoreTurn[];
  participantAId: string;
  participantBId: string;
  lineups: MatchLegLineup[];
}) {
  for (const turn of input.turns) {
    if (!turn.userId) continue;
    const allowedUserIds = turnLineupUserIds({ ...input, turn });
    if (!allowedUserIds.includes(turn.userId)) {
      throw new Error("A scored turn references a player outside this leg lineup.");
    }
  }
}

function parseLineupsFromForm(input: {
  formData: FormData;
  legRules: MatchLegRule[];
  participantAUserIds: string[];
  participantBUserIds: string[];
}) {
  return input.legRules.map((rule) => {
    const aSelected = fromFormString(input.formData.get(`leg_${rule.legNumber}_participant_a_user_id`));
    const bSelected = fromFormString(input.formData.get(`leg_${rule.legNumber}_participant_b_user_id`));
    return {
      legNumber: rule.legNumber,
      participantAUserIds: rule.participantMode === "singles" ? [aSelected].filter(Boolean) : input.participantAUserIds,
      participantBUserIds: rule.participantMode === "singles" ? [bSelected].filter(Boolean) : input.participantBUserIds
    };
  });
}

function optionalNumberFromForm(formData: FormData, key: string) {
  const raw = fromFormString(formData.get(key));
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function optionalIntegerFromForm(formData: FormData, key: string) {
  const value = optionalNumberFromForm(formData, key);
  return value === undefined ? undefined : Math.max(0, Math.floor(value));
}

function compactManualStats(stats: ManualSoftStats) {
  return Object.fromEntries(
    Object.entries(stats).filter(([, value]) => value !== undefined && value !== null)
  ) as ManualSoftStats;
}

function parseManualStatsForUsers(formData: FormData, userIds: string[]): ManualStatsById {
  return Object.fromEntries(
    userIds.map((userId) => [
      userId,
      compactManualStats({
        averageScore: optionalNumberFromForm(formData, `stats_${userId}_average_score`),
        averagePer3Darts: optionalNumberFromForm(formData, `stats_${userId}_average_score`),
        averageMpr: optionalNumberFromForm(formData, `stats_${userId}_average_mpr`),
        countTon80: optionalIntegerFromForm(formData, `stats_${userId}_count_ton80`),
        countHatTrick: optionalIntegerFromForm(formData, `stats_${userId}_count_hat_trick`),
        highestCheckout: optionalIntegerFromForm(formData, `stats_${userId}_highest_checkout`),
        countHighCheckout: optionalIntegerFromForm(formData, `stats_${userId}_count_high_checkout`),
        countWhiteHorse: optionalIntegerFromForm(formData, `stats_${userId}_count_white_horse`),
        totalMarks: optionalIntegerFromForm(formData, `stats_${userId}_total_marks`),
        count5Marks: optionalIntegerFromForm(formData, `stats_${userId}_count_5_marks`),
        count6Marks: optionalIntegerFromForm(formData, `stats_${userId}_count_6_marks`),
        count7Marks: optionalIntegerFromForm(formData, `stats_${userId}_count_7_marks`),
        count9Marks: optionalIntegerFromForm(formData, `stats_${userId}_count_9_marks`),
        count60Plus: optionalIntegerFromForm(formData, `stats_${userId}_count_60_plus`),
        count80Plus: optionalIntegerFromForm(formData, `stats_${userId}_count_80_plus`),
        count180:
          optionalIntegerFromForm(formData, `stats_${userId}_count_180`) ??
          optionalIntegerFromForm(formData, `stats_${userId}_count_ton80`),
        count100Plus: optionalIntegerFromForm(formData, `stats_${userId}_count_100_plus`),
        count140Plus: optionalIntegerFromForm(formData, `stats_${userId}_count_140_plus`),
        count170Plus: optionalIntegerFromForm(formData, `stats_${userId}_count_170_plus`)
      })
    ]).filter(([, stats]) => Object.keys(stats).length > 0)
  );
}

function buildSoftStatsRpcPayload(input: {
  userId: string;
  won: boolean;
  legsWon: number;
  legsLost: number;
  stats?: ManualSoftStats;
}) {
  return {
    p_user_id: input.userId,
    p_won: input.won,
    p_legs_won: input.legsWon,
    p_legs_lost: input.legsLost,
    p_average_score: input.stats?.averageScore ?? input.stats?.averagePer3Darts ?? null,
    p_average_mpr: input.stats?.averageMpr ?? null,
    p_highest_checkout: input.stats?.highestCheckout || 0,
    p_count_high_checkout: input.stats?.countHighCheckout || 0,
    p_count_ton80: input.stats?.countTon80 || 0,
    p_count_hat_trick: input.stats?.countHatTrick || 0,
    p_count_white_horse: input.stats?.countWhiteHorse || 0,
    p_total_marks: input.stats?.totalMarks || 0,
    p_count_5_marks: input.stats?.count5Marks || 0,
    p_count_6_marks: input.stats?.count6Marks || 0,
    p_count_7_marks: input.stats?.count7Marks || 0,
    p_count_9_marks: input.stats?.count9Marks || 0
  };
}

function buildStatsRpcPayload(input: {
  userId: string;
  won: boolean;
  legsWon: number;
  legsLost: number;
  stats?: ReturnType<typeof calculateDartStats>;
}) {
  return {
    p_user_id: input.userId,
    p_won: input.won,
    p_legs_won: input.legsWon,
    p_legs_lost: input.legsLost,
    p_total_scored_points: input.stats?.totalScoredPoints || 0,
    p_total_darts: input.stats?.totalDarts || 0,
    p_highest_turn_score: input.stats?.highestTurnScore || 0,
    p_bust_count: input.stats?.bustCount || 0,
    p_checkout_count: input.stats?.checkoutCount || 0,
    p_highest_checkout: input.stats?.highestCheckout || 0,
    p_count_high_checkout: input.stats?.countHighCheckout || 0,
    p_count_60_plus: input.stats?.count60Plus || 0,
    p_count_80_plus: input.stats?.count80Plus || 0,
    p_count_180: input.stats?.count180 || 0,
    p_count_100_plus: input.stats?.count100Plus || 0,
    p_count_140_plus: input.stats?.count140Plus || 0,
    p_count_170_plus: input.stats?.count170Plus || 0
  };
}

function hasManualStats(stats?: ManualSoftStats) {
  return Boolean(stats && Object.keys(stats).length > 0);
}

function buildManualSteelStatsRpcPayload(input: {
  userId: string;
  won: boolean;
  legsWon: number;
  legsLost: number;
  stats?: ManualSoftStats;
}) {
  const average = input.stats?.averagePer3Darts ?? input.stats?.averageScore;
  return {
    p_user_id: input.userId,
    p_won: input.won,
    p_legs_won: input.legsWon,
    p_legs_lost: input.legsLost,
    p_total_scored_points:
      average !== undefined ? Math.max(0, Math.round(average)) : input.stats?.totalScoredPoints || 0,
    p_total_darts: average !== undefined ? 3 : input.stats?.totalDarts || 0,
    p_highest_turn_score: input.stats?.highestTurnScore || 0,
    p_bust_count: input.stats?.bustCount || 0,
    p_checkout_count: input.stats?.checkoutCount || 0,
    p_highest_checkout: input.stats?.highestCheckout || 0,
    p_count_high_checkout: input.stats?.countHighCheckout || 0,
    p_count_60_plus: input.stats?.count60Plus || 0,
    p_count_80_plus: input.stats?.count80Plus || 0,
    p_count_180: input.stats?.count180 ?? input.stats?.countTon80 ?? 0,
    p_count_100_plus: input.stats?.count100Plus || 0,
    p_count_140_plus: input.stats?.count140Plus || 0,
    p_count_170_plus: input.stats?.count170Plus || 0
  };
}

function buildSteelStatEvent(input: {
  userId: string;
  statsScope: Extract<SettlementStatsScope, "tournament" | "general">;
  won: boolean;
  legsWon: number;
  legsLost: number;
  stats?: ReturnType<typeof calculateDartStats>;
  manualStats?: ManualSoftStats;
}): SettlementStatEvent {
  const payload = hasManualStats(input.manualStats)
    ? buildManualSteelStatsRpcPayload({
        userId: input.userId,
        won: input.won,
        legsWon: input.legsWon,
        legsLost: input.legsLost,
        stats: input.manualStats
      })
    : buildStatsRpcPayload({
        userId: input.userId,
        won: input.won,
        legsWon: input.legsWon,
        legsLost: input.legsLost,
        stats: input.stats
      });

  return {
    userId: input.userId,
    statsScope: input.statsScope,
    won: input.won,
    legsWon: input.legsWon,
    legsLost: input.legsLost,
    totalScoredPoints: payload.p_total_scored_points,
    totalDarts: payload.p_total_darts,
    highestTurnScore: payload.p_highest_turn_score,
    bustCount: payload.p_bust_count,
    checkoutCount: payload.p_checkout_count,
    highestCheckout: payload.p_highest_checkout,
    countHighCheckout: payload.p_count_high_checkout,
    count60Plus: payload.p_count_60_plus,
    count80Plus: payload.p_count_80_plus,
    count180: payload.p_count_180,
    count100Plus: payload.p_count_100_plus,
    count140Plus: payload.p_count_140_plus,
    count170Plus: payload.p_count_170_plus
  };
}

function buildSoftStatEvent(input: {
  userId: string;
  won: boolean;
  legsWon: number;
  legsLost: number;
  stats?: ManualSoftStats;
}): SettlementStatEvent {
  const payload = buildSoftStatsRpcPayload(input);
  return {
    userId: input.userId,
    statsScope: "soft",
    won: input.won,
    legsWon: input.legsWon,
    legsLost: input.legsLost,
    averageScore: payload.p_average_score,
    averageScoreSamples: payload.p_average_score === null ? 0 : 1,
    averageMpr: payload.p_average_mpr,
    averageMprSamples: payload.p_average_mpr === null ? 0 : 1,
    highestCheckout: payload.p_highest_checkout,
    countHighCheckout: payload.p_count_high_checkout,
    countTon80: payload.p_count_ton80,
    countHatTrick: payload.p_count_hat_trick,
    countWhiteHorse: payload.p_count_white_horse,
    totalMarks: payload.p_total_marks,
    count5Marks: payload.p_count_5_marks,
    count6Marks: payload.p_count_6_marks,
    count7Marks: payload.p_count_7_marks,
    count9Marks: payload.p_count_9_marks,
    totalScoredPoints: input.stats?.totalScoredPoints || 0,
    highestTurnScore: input.stats?.highestTurnScore || 0
  };
}

function buildParticipantStatsFromTurns(input: {
  participantAId: string;
  participantBId: string;
  turns: ScoreTurn[];
}) {
  return {
    [input.participantAId]: calculateDartStats(
      input.turns.filter((turn) => turn.participantId === input.participantAId)
    ),
    [input.participantBId]: calculateDartStats(
      input.turns.filter((turn) => turn.participantId === input.participantBId)
    )
  };
}

function buildUserStatsFromTurns(turns: ScoreTurn[]): ResultStatsById {
  const userIds = [...new Set(turns.map((turn) => turn.userId).filter(Boolean))] as string[];
  return Object.fromEntries(
    userIds.map((userId) => [
      userId,
      calculateDartStats(turns.filter((turn) => turn.userId === userId))
    ])
  );
}

function buildManualResultDetails(input: {
  source: string;
  dartMode: MatchDartMode;
  gameVariant?: string | null;
  legRules?: MatchLegRule[];
  legLineups?: MatchLegLineup[];
  legResults?: MatchLegResult[];
  participantStats?: Record<string, ReturnType<typeof calculateDartStats> | ManualSoftStats>;
  userStats?: ResultStatsById;
  submissionId?: string | null;
}) {
  return {
    source: input.source,
    submissionId: input.submissionId || null,
    dartMode: input.dartMode,
    gameVariant: input.gameVariant,
    legRules: input.legRules || [],
    legLineups: input.legLineups || [],
    legResults: input.legResults || [],
    participantStats: input.participantStats || {},
    userStats: input.userStats || {}
  };
}

function averageDefined(values: Array<number | undefined>) {
  const defined = values.filter((value): value is number => value !== undefined);
  if (defined.length === 0) return undefined;
  return Number((defined.reduce((total, value) => total + value, 0) / defined.length).toFixed(2));
}

function buildParticipantManualStats(userIds: string[], userStats: ManualStatsById): ManualSoftStats {
  const stats = userIds.map((userId) => userStats[userId]).filter(Boolean);
  if (stats.length === 0) return {};

  const averageScore = averageDefined(stats.map((stat) => stat.averageScore ?? stat.averagePer3Darts));
  return compactManualStats({
    averageScore,
    averagePer3Darts: averageScore,
    averageMpr: averageDefined(stats.map((stat) => stat.averageMpr)),
    countTon80: stats.reduce((total, stat) => total + (stat.countTon80 || 0), 0),
    countHatTrick: stats.reduce((total, stat) => total + (stat.countHatTrick || 0), 0),
    highestCheckout: Math.max(0, ...stats.map((stat) => stat.highestCheckout || 0)),
    countHighCheckout: stats.reduce((total, stat) => total + (stat.countHighCheckout || 0), 0),
    countWhiteHorse: stats.reduce((total, stat) => total + (stat.countWhiteHorse || 0), 0),
    totalMarks: stats.reduce((total, stat) => total + (stat.totalMarks || 0), 0),
    count5Marks: stats.reduce((total, stat) => total + (stat.count5Marks || 0), 0),
    count6Marks: stats.reduce((total, stat) => total + (stat.count6Marks || 0), 0),
    count7Marks: stats.reduce((total, stat) => total + (stat.count7Marks || 0), 0),
    count9Marks: stats.reduce((total, stat) => total + (stat.count9Marks || 0), 0),
    totalScoredPoints: stats.reduce((total, stat) => total + (stat.totalScoredPoints || 0), 0),
    highestTurnScore: Math.max(0, ...stats.map((stat) => stat.highestTurnScore || 0))
  });
}

async function buildSettlementSideEffects(input: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  matchId: string;
  tournamentId: string;
  participantAId: string;
  participantBId: string;
  winnerParticipantId: string;
  scoreA: number;
  scoreB: number;
  turns: ScoreTurn[];
  dartMode?: MatchDartMode;
  userStats?: ManualStatsById;
  legLineups?: MatchLegLineup[];
  recalculate?: boolean;
}): Promise<{ ratingLogs: SettlementRatingLog[]; statEvents: SettlementStatEvent[] }> {
  const { admin } = input;
  const ratingLogs: SettlementRatingLog[] = [];
  const statEvents: SettlementStatEvent[] = [];
  const dartMode = input.dartMode || "steel";
  const loserParticipantId =
    input.winnerParticipantId === input.participantAId
      ? input.participantBId
      : input.participantAId;
  const winnerFallbackUserIds = await getTeamUserIds(admin, input.winnerParticipantId);
  const loserFallbackUserIds = await getTeamUserIds(admin, loserParticipantId);
  const winnerUserIds = userIdsFromLineups({
    participantId: input.winnerParticipantId,
    participantAId: input.participantAId,
    participantBId: input.participantBId,
    fallbackUserIds: winnerFallbackUserIds,
    lineups: input.legLineups
  });
  const loserUserIds = userIdsFromLineups({
    participantId: loserParticipantId,
    participantAId: input.participantAId,
    participantBId: input.participantBId,
    fallbackUserIds: loserFallbackUserIds,
    lineups: input.legLineups
  });
  const allUserIds = [...winnerUserIds, ...loserUserIds];
  if (allUserIds.length === 0) return { ratingLogs, statEvents };

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, rating, tournament_rating, casual_rating, soft_rating")
    .in("id", allUserIds);

  if (profileError) throw new Error(profileError.message);
  const tournamentRatingByUser = new Map(
    (profiles || []).map((profile) => [profile.id, profile.tournament_rating ?? profile.rating ?? 1000])
  );
  const casualRatingByUser = new Map(
    (profiles || []).map((profile) => [profile.id, profile.casual_rating ?? profile.rating ?? 1000])
  );
  const softRatingByUser = new Map(
    (profiles || []).map((profile) => [profile.id, profile.soft_rating ?? profile.rating ?? 1000])
  );

  if (input.recalculate) {
    const { data: previousRatingLogs, error: previousRatingError } = await admin
      .from("rating_logs")
      .select("user_id, rating_scope, delta")
      .eq("match_id", input.matchId);

    if (previousRatingError) throw new Error(previousRatingError.message);
    for (const log of previousRatingLogs || []) {
      if (log.rating_scope === "soft") {
        softRatingByUser.set(log.user_id, (softRatingByUser.get(log.user_id) || 1000) - log.delta);
      } else if (log.rating_scope === "general") {
        casualRatingByUser.set(log.user_id, (casualRatingByUser.get(log.user_id) || 1000) - log.delta);
      } else if (log.rating_scope === "tournament") {
        tournamentRatingByUser.set(log.user_id, (tournamentRatingByUser.get(log.user_id) || 1000) - log.delta);
      }
    }
  }

  if (dartMode === "soft") {
    const winnerSoftAverage =
      winnerUserIds.reduce((total, id) => total + (softRatingByUser.get(id) || 1000), 0) /
      Math.max(1, winnerUserIds.length);
    const loserSoftAverage =
      loserUserIds.reduce((total, id) => total + (softRatingByUser.get(id) || 1000), 0) /
      Math.max(1, loserUserIds.length);

    for (const userId of winnerUserIds) {
      const currentSoftRating = softRatingByUser.get(userId) || 1000;
      const softRating = updateUserRating({
        winnerRating: currentSoftRating,
        loserRating: Math.round(loserSoftAverage),
        weight: SOFT_RATING_WEIGHT
      });
      const legsWon = input.winnerParticipantId === input.participantAId ? input.scoreA : input.scoreB;
      const legsLost = input.winnerParticipantId === input.participantAId ? input.scoreB : input.scoreA;
      const stats = input.userStats?.[userId];

      ratingLogs.push({
        userId,
        ratingBefore: currentSoftRating,
        ratingAfter: softRating.winnerRatingAfter,
        delta: softRating.winnerDelta,
        reason: "match_win",
        ratingScope: "soft",
        matchSource: "tournament_soft"
      });
      statEvents.push(buildSoftStatEvent({ userId, won: true, legsWon, legsLost, stats }));
    }

    for (const userId of loserUserIds) {
      const currentSoftRating = softRatingByUser.get(userId) || 1000;
      const softRating = updateUserRating({
        winnerRating: Math.round(winnerSoftAverage),
        loserRating: currentSoftRating,
        weight: SOFT_RATING_WEIGHT
      });
      const legsWon = loserParticipantId === input.participantAId ? input.scoreA : input.scoreB;
      const legsLost = loserParticipantId === input.participantAId ? input.scoreB : input.scoreA;
      const stats = input.userStats?.[userId];

      ratingLogs.push({
        userId,
        ratingBefore: currentSoftRating,
        ratingAfter: softRating.loserRatingAfter,
        delta: softRating.loserDelta,
        reason: "match_loss",
        ratingScope: "soft",
        matchSource: "tournament_soft"
      });
      statEvents.push(buildSoftStatEvent({ userId, won: false, legsWon, legsLost, stats }));
    }

    return { ratingLogs, statEvents };
  }

  const winnerTournamentAverage =
    winnerUserIds.reduce((total, id) => total + (tournamentRatingByUser.get(id) || 1000), 0) /
    Math.max(1, winnerUserIds.length);
  const loserTournamentAverage =
    loserUserIds.reduce((total, id) => total + (tournamentRatingByUser.get(id) || 1000), 0) /
    Math.max(1, loserUserIds.length);
  const winnerCasualAverage =
    winnerUserIds.reduce((total, id) => total + (casualRatingByUser.get(id) || 1000), 0) /
    Math.max(1, winnerUserIds.length);
  const loserCasualAverage =
    loserUserIds.reduce((total, id) => total + (casualRatingByUser.get(id) || 1000), 0) /
    Math.max(1, loserUserIds.length);

  const statsByParticipant = new Map<string, ReturnType<typeof calculateDartStats>>();
  [input.participantAId, input.participantBId].forEach((participantId) => {
    statsByParticipant.set(
      participantId,
      calculateDartStats(input.turns.filter((turn) => turn.participantId === participantId))
    );
  });
  const hasUserTurnStats = input.turns.some((turn) => Boolean(turn.userId));
  const statsByUser = new Map<string, ReturnType<typeof calculateDartStats>>();
  if (hasUserTurnStats) {
    for (const userId of allUserIds) {
      statsByUser.set(userId, calculateDartStats(input.turns.filter((turn) => turn.userId === userId)));
    }
  }

  for (const userId of winnerUserIds) {
    const currentTournamentRating = tournamentRatingByUser.get(userId) || 1000;
    const currentCasualRating = casualRatingByUser.get(userId) || 1000;
    const tournamentRating = updateUserRating({
      winnerRating: currentTournamentRating,
      loserRating: Math.round(loserTournamentAverage)
    });
    const casualRating = updateUserRating({
      winnerRating: currentCasualRating,
      loserRating: Math.round(loserCasualAverage)
    });
    const stats = hasUserTurnStats
      ? statsByUser.get(userId)
      : statsByParticipant.get(input.winnerParticipantId);
    const manualStats = input.userStats?.[userId];
    const legsWon = input.winnerParticipantId === input.participantAId ? input.scoreA : input.scoreB;
    const legsLost = input.winnerParticipantId === input.participantAId ? input.scoreB : input.scoreA;

    ratingLogs.push(
      {
        userId,
        ratingBefore: currentTournamentRating,
        ratingAfter: tournamentRating.winnerRatingAfter,
        delta: tournamentRating.winnerDelta,
        reason: "match_win",
        ratingScope: "tournament",
        matchSource: "tournament"
      },
      {
        userId,
        ratingBefore: currentCasualRating,
        ratingAfter: casualRating.winnerRatingAfter,
        delta: casualRating.winnerDelta,
        reason: "match_win",
        ratingScope: "general",
        matchSource: "tournament"
      }
    );
    statEvents.push(
      buildSteelStatEvent({
        userId,
        statsScope: "tournament",
        won: true,
        legsWon,
        legsLost,
        stats,
        manualStats
      }),
      buildSteelStatEvent({
        userId,
        statsScope: "general",
        won: true,
        legsWon,
        legsLost,
        stats,
        manualStats
      })
    );
  }

  for (const userId of loserUserIds) {
    const currentTournamentRating = tournamentRatingByUser.get(userId) || 1000;
    const currentCasualRating = casualRatingByUser.get(userId) || 1000;
    const tournamentRating = updateUserRating({
      winnerRating: Math.round(winnerTournamentAverage),
      loserRating: currentTournamentRating
    });
    const casualRating = updateUserRating({
      winnerRating: Math.round(winnerCasualAverage),
      loserRating: currentCasualRating
    });
    const stats = hasUserTurnStats
      ? statsByUser.get(userId)
      : statsByParticipant.get(loserParticipantId);
    const manualStats = input.userStats?.[userId];
    const legsWon = loserParticipantId === input.participantAId ? input.scoreA : input.scoreB;
    const legsLost = loserParticipantId === input.participantAId ? input.scoreB : input.scoreA;

    ratingLogs.push(
      {
        userId,
        ratingBefore: currentTournamentRating,
        ratingAfter: tournamentRating.loserRatingAfter,
        delta: tournamentRating.loserDelta,
        reason: "match_loss",
        ratingScope: "tournament",
        matchSource: "tournament"
      },
      {
        userId,
        ratingBefore: currentCasualRating,
        ratingAfter: casualRating.loserRatingAfter,
        delta: casualRating.loserDelta,
        reason: "match_loss",
        ratingScope: "general",
        matchSource: "tournament"
      }
    );
    statEvents.push(
      buildSteelStatEvent({
        userId,
        statsScope: "tournament",
        won: false,
        legsWon,
        legsLost,
        stats,
        manualStats
      }),
      buildSteelStatEvent({
        userId,
        statsScope: "general",
        won: false,
        legsWon,
        legsLost,
        stats,
        manualStats
      })
    );
  }

  return { ratingLogs, statEvents };
}

async function settleTournamentMatch(input: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  matchId: string;
  winnerParticipantId?: string | null;
  scoreA: number;
  scoreB: number;
  details: Record<string, unknown>;
  legResults?: MatchLegResult[];
  turns?: ScoreTurn[];
  ratingLogs: SettlementRatingLog[];
  statEvents: SettlementStatEvent[];
  confirmationId?: string | null;
  recalculate?: boolean;
}) {
  const { error } = await input.admin.rpc("settle_tournament_match", {
    p_match_id: input.matchId,
    p_winner_participant_id: input.winnerParticipantId || null,
    p_score_a: input.scoreA,
    p_score_b: input.scoreB,
    p_details: input.details,
    p_leg_results: (input.legResults || []).map((result) => ({
      ...result,
      startingScore: getLegStartingScore(result)
    })),
    p_turns: input.turns || [],
    p_rating_logs: input.ratingLogs,
    p_stat_events: input.statEvents,
    p_confirmation_id: input.confirmationId || null,
    p_recalculate: Boolean(input.recalculate)
  });

  if (error) throw new Error(error.message);
}

export async function completeScoredMatchAction(payload: unknown) {
  const { user } = await requireUser();
  const values = completeMatchSchema.parse(payload);
  await assertMatchMember(values.matchId, user.id);

  const admin = createSupabaseAdminClient();
  const { data: match, error: matchError } = await admin
    .from("matches")
    .select("id, tournament_id, participant_a_id, participant_b_id, status, dart_mode, game_variant, leg_rules, match_finish_mode, details")
    .eq("id", values.matchId)
    .single();

  if (matchError) throw new Error(matchError.message);
  if (match.status === "bye") {
    throw new Error("This match has already been settled.");
  }
  if (match.status === "completed" && !hasSameResultSubmission(match.details, values.submissionId)) {
    throw new Error("This match has already been settled.");
  }
  if (!match.participant_a_id || !match.participant_b_id) {
    throw new Error("Match does not have two participants.");
  }
  const dartMode = ((match.dart_mode || "steel") === "soft" ? "soft" : "steel") as MatchDartMode;
  const userStats = values.userStats as ManualStatsById;
  if (values.turns.length > 0) {
    assertTurnUsersInLineups({
      turns: values.turns,
      participantAId: match.participant_a_id,
      participantBId: match.participant_b_id,
      lineups: values.legLineups as MatchLegLineup[]
    });
  }

  const participantAUserIds = await getTeamUserIds(admin, match.participant_a_id);
  const participantBUserIds = await getTeamUserIds(admin, match.participant_b_id);
  const participantAPlayedUserIds = userIdsFromLineups({
    participantId: match.participant_a_id,
    participantAId: match.participant_a_id,
    participantBId: match.participant_b_id,
    fallbackUserIds: participantAUserIds,
    lineups: values.legLineups as MatchLegLineup[]
  });
  const participantBPlayedUserIds = userIdsFromLineups({
    participantId: match.participant_b_id,
    participantAId: match.participant_a_id,
    participantBId: match.participant_b_id,
    fallbackUserIds: participantBUserIds,
    lineups: values.legLineups as MatchLegLineup[]
  });

  const details = buildManualResultDetails({
    source: dartMode === "soft" ? "soft_scorer" : "scorer",
    dartMode,
    gameVariant: match.game_variant,
    legRules: (match.leg_rules || []) as MatchLegRule[],
    legLineups: values.legLineups as MatchLegLineup[],
    legResults: values.legResults as MatchLegResult[],
    submissionId: values.submissionId,
    participantStats:
      dartMode === "soft"
        ? {
            [match.participant_a_id]: buildParticipantManualStats(participantAPlayedUserIds, userStats),
            [match.participant_b_id]: buildParticipantManualStats(participantBPlayedUserIds, userStats)
          }
        : buildParticipantStatsFromTurns({
            participantAId: match.participant_a_id,
            participantBId: match.participant_b_id,
            turns: values.turns
          }),
    userStats: dartMode === "soft" ? userStats : buildUserStatsFromTurns(values.turns)
  });

  const settlement = await buildSettlementSideEffects({
    admin,
    matchId: values.matchId,
    tournamentId: match.tournament_id,
    participantAId: match.participant_a_id,
    participantBId: match.participant_b_id,
    winnerParticipantId: values.winnerParticipantId,
    scoreA: values.scoreA,
    scoreB: values.scoreB,
    turns: values.turns,
    dartMode,
    userStats: dartMode === "soft" ? userStats : undefined,
    legLineups: values.legLineups as MatchLegLineup[]
  });
  await settleTournamentMatch({
    admin,
    matchId: values.matchId,
    winnerParticipantId: values.winnerParticipantId,
    scoreA: values.scoreA,
    scoreB: values.scoreB,
    details,
    legResults: values.legResults as MatchLegResult[],
    turns: values.turns,
    ratingLogs: settlement.ratingLogs,
    statEvents: settlement.statEvents
  });

  revalidatePath(`/scorer/${values.matchId}`);
  revalidatePath(`/tournaments/${match.tournament_id}`);
}

export async function completeCasualMatchAction(payload: unknown) {
  const { user, profile } = await requireUser();
  const values = completeCasualMatchSchema.parse(payload);
  const opponentUserId = values.opponentUserId || null;

  if (opponentUserId === user.id) {
    throw new Error("Opponent cannot be the same as the current user.");
  }

  const admin = createSupabaseAdminClient();
  if (values.submissionId) {
    const { data: existingCasualMatch, error: existingCasualMatchError } = await admin
      .from("casual_matches")
      .select("id")
      .eq("created_by", user.id)
      .contains("details", { submissionId: values.submissionId })
      .maybeSingle();
    if (existingCasualMatchError) throw new Error(existingCasualMatchError.message);
    if (existingCasualMatch) {
      revalidatePath("/scorer");
      revalidatePath("/profile");
      return { casualMatchId: existingCasualMatch.id };
    }
  }

  const linkedMemberIds = allLinkedCasualMemberIds(values);
  if (!linkedMemberIds.includes(user.id)) {
    throw new Error("当前账号必须在我方出场名单中。");
  }
  if (opponentUserId && !linkedCasualMembers(values, "B").some((member) => member.userId === opponentUserId)) {
    throw new Error("对手账号必须在对方出场名单中。");
  }
  if (new Set(linkedMemberIds).size !== linkedMemberIds.length) {
    throw new Error("同一个账号不能同时作为多个出场人。");
  }

  const profileIds = [...new Set([user.id, opponentUserId, ...linkedMemberIds].filter(Boolean))] as string[];
  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, display_name, rating, casual_rating")
    .in("id", profileIds);

  if (profileError) throw new Error(profileError.message);
  const profileById = new Map((profiles || []).map((item) => [item.id, item]));
  const opponentProfile = opponentUserId ? profileById.get(opponentUserId) : null;
  if (opponentUserId && !opponentProfile) {
    throw new Error("Opponent profile was not found.");
  }
  for (const userId of linkedMemberIds) {
    if (!profileById.has(userId)) throw new Error("出场账号中有用户资料不存在，请重新选择。");
  }

  const playerAName =
    profile?.display_name || profileById.get(user.id)?.display_name || user.email?.split("@")[0] || "Me";
  const normalizedValues: CasualMatchInput = {
    ...values,
    participantMembers: normalizeCasualMembers(values, profileById)
  };
  const linkedMembersA = linkedCasualMembers(normalizedValues, "A");
  const linkedMembersB = linkedCasualMembers(normalizedValues, "B");
  const playerBName = opponentProfile?.display_name || normalizedValues.opponentName;
  const turnsA = normalizedValues.turns.filter((turn) => turn.participantId === "me");
  const turnsB = normalizedValues.turns.filter((turn) => turn.participantId === "opponent");
  const participantStatsA = calculateDartStats(turnsA);
  const participantStatsB = calculateDartStats(turnsB);
  const statsA = calculateDartStats(personalCasualTurns(normalizedValues.turns, "me", user.id));
  const statsB = opponentUserId
    ? calculateDartStats(personalCasualTurns(normalizedValues.turns, "opponent", opponentUserId))
    : participantStatsB;
  const memberStats = {
    ...buildCasualMemberStats(normalizedValues, linkedMembersA, "A"),
    ...buildCasualMemberStats(normalizedValues, linkedMembersB, "B")
  };
  const playerARating = averageCasualRating(linkedMembersA, profileById);
  const playerBRating = averageCasualRating(linkedMembersB, profileById);
  const ratingResult =
    normalizedValues.winnerSide === "A"
      ? updateUserRating({ winnerRating: playerARating, loserRating: playerBRating })
      : updateUserRating({ winnerRating: playerBRating, loserRating: playerARating });
  const playerARatingAfter =
    normalizedValues.winnerSide === "A" ? ratingResult.winnerRatingAfter : ratingResult.loserRatingAfter;
  const playerBRatingAfter =
    normalizedValues.winnerSide === "B" ? ratingResult.winnerRatingAfter : ratingResult.loserRatingAfter;
  const playerADelta = playerARatingAfter - playerARating;
  const playerBDelta = playerBRatingAfter - playerBRating;
  const memberRatingOutcomes = buildCasualMemberRatingOutcomes({
    winnerSide: normalizedValues.winnerSide,
    membersA: linkedMembersA,
    membersB: linkedMembersB,
    profileById
  });

  const { data: casualMatch, error: casualMatchError } = await admin
    .from("casual_matches")
    .insert({
      created_by: user.id,
      player_a_user_id: user.id,
      player_b_user_id: opponentUserId,
      player_a_name: playerAName,
      player_b_name: playerBName,
      starting_score: normalizedValues.startingScore,
      best_of: normalizedValues.bestOf,
      winner_side: normalizedValues.winnerSide,
      score_a: normalizedValues.scoreA,
      score_b: normalizedValues.scoreB,
      confirmation_status: opponentUserId ? "pending" : "not_required",
      details: {
        source: "casual_scorer",
        submissionId: normalizedValues.submissionId || null,
        participantMode: normalizedValues.participantMode,
        participantMembers: normalizedValues.participantMembers,
        legLineups: normalizedValues.legLineups,
        turnMeta: casualTurnMeta(normalizedValues),
        participantStats: {
          A: participantStatsA,
          B: participantStatsB
        },
        personalStats: {
          A: statsA,
          B: statsB
        },
        memberStats,
        legResults: normalizedValues.legResults,
        ratingOutcome: {
          A: {
            before: playerARating,
            after: playerARatingAfter,
            delta: playerADelta
          },
          B: {
            before: playerBRating,
            after: playerBRatingAfter,
            delta: playerBDelta
          },
          members: memberRatingOutcomes
        }
      }
    })
    .select("id")
    .single();

  if (casualMatchError) {
    if (values.submissionId) {
      const { data: existingCasualMatch, error: existingCasualMatchError } = await admin
        .from("casual_matches")
        .select("id")
        .eq("created_by", user.id)
        .contains("details", { submissionId: values.submissionId })
        .limit(1)
        .maybeSingle();
      if (existingCasualMatchError) throw new Error(existingCasualMatchError.message);
      if (existingCasualMatch) {
        revalidatePath("/scorer");
        revalidatePath("/profile");
        return { casualMatchId: existingCasualMatch.id };
      }
    }
    throw new Error(casualMatchError.message);
  }

  if (normalizedValues.turns.length > 0) {
    const { error: turnError } = await admin.from("casual_match_turns").insert(
      normalizedValues.turns.map((turn, index) => ({
        casual_match_id: casualMatch.id,
        side: turn.participantId === "me" ? "A" : "B",
        turn_number: index + 1,
        score: turn.score,
        darts: turn.darts || 3,
        remaining_before: turn.remainingBefore,
        remaining_after: turn.remainingAfter,
        is_bust: turn.isBust,
        is_checkout: turn.isCheckout
      }))
    );
    if (turnError) throw new Error(turnError.message);
  }

  for (const member of linkedMembersA) {
    const outcome = memberRatingOutcomes[member.userId];
    if (!outcome) continue;
    await applyCasualLinkedMemberSettlement({
      admin,
      casualMatchId: casualMatch.id,
      userId: member.userId,
      won: normalizedValues.winnerSide === "A",
      legsWon: normalizedValues.scoreA,
      legsLost: normalizedValues.scoreB,
      stats: memberStats[member.userId] || statsA,
      ratingOutcome: outcome,
      note: member.userId === user.id ? "casual_sparring" : "casual_sparring_teammate"
    });
  }

  revalidatePath("/scorer");
  revalidatePath("/profile");
  return { casualMatchId: casualMatch.id };
}

export async function confirmCasualMatchAction(formData: FormData) {
  const { user } = await requireUser();
  const casualMatchId = fromFormString(formData.get("casual_match_id"));
  const decision = fromFormString(formData.get("decision"));
  const admin = createSupabaseAdminClient();

  const { data: casualMatch, error } = await admin
    .from("casual_matches")
    .select("*")
    .eq("id", casualMatchId)
    .single();

  if (error) throw new Error(error.message);
  if (casualMatch.player_b_user_id !== user.id) {
    throw new Error("Only the selected opponent can confirm this casual match.");
  }
  if (casualMatch.confirmation_status !== "pending") {
    throw new Error("This casual match is not waiting for confirmation.");
  }

  if (decision !== "confirmed") {
    await admin
      .from("casual_matches")
      .update({
        confirmation_status: "rejected",
        opponent_rejected_at: new Date().toISOString(),
        opponent_reject_reason: "Rejected by opponent"
      })
      .eq("id", casualMatchId);
    revalidatePath("/profile");
    revalidatePath(`/profile/history/casual/${casualMatchId}`);
    return;
  }

  const { data: turns, error: turnError } = await admin
    .from("casual_match_turns")
    .select("*")
    .eq("casual_match_id", casualMatchId)
    .eq("side", "B")
    .order("turn_number");

  if (turnError) throw new Error(turnError.message);
  const details = casualMatch.details as {
    participantMembers?: { A?: CasualMemberInput[]; B?: CasualMemberInput[] };
    turnMeta?: CasualTurnMetaEntry[];
    ratingOutcome?: {
      B?: { delta?: number };
      members?: Record<string, CasualRatingOutcome>;
    };
  } | null;
  const turnMeta = details?.turnMeta || [];
  const linkedMembersB = (details?.participantMembers?.B || []).filter(
    (member) => member.linked && isUuidValue(member.userId)
  );
  if (!linkedMembersB.some((member) => member.userId === user.id)) {
    linkedMembersB.unshift({ userId: user.id, name: casualMatch.player_b_name, linked: true });
  }
  const linkedMemberIdsB = [...new Set(linkedMembersB.map((member) => member.userId))];
  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, display_name, rating, casual_rating")
    .in("id", linkedMemberIdsB);
  if (profileError) throw new Error(profileError.message);
  const profileById = new Map((profiles || []).map((item) => [item.id, item]));
  const ratingDelta =
    details?.ratingOutcome?.B?.delta ??
    (casualMatch.winner_side === "B" ? 10 : -10);

  for (const member of linkedMembersB) {
    const profile = profileById.get(member.userId);
    const ratingBefore = ratingFromCasualProfile(profile);
    const fallbackOutcome: CasualRatingOutcome = {
      side: "B",
      name: profile?.display_name || member.name,
      before: ratingBefore,
      after: Math.max(100, ratingBefore + ratingDelta),
      delta: Math.max(100, ratingBefore + ratingDelta) - ratingBefore
    };
    await applyCasualLinkedMemberSettlement({
      admin,
      casualMatchId,
      userId: member.userId,
      won: casualMatch.winner_side === "B",
      legsWon: casualMatch.score_b,
      legsLost: casualMatch.score_a,
      stats: statsFromCasualRowsForMember((turns || []) as CasualTurnRow[], turnMeta, member.userId),
      ratingOutcome: details?.ratingOutcome?.members?.[member.userId] || fallbackOutcome,
      note: member.userId === user.id ? "casual_sparring_confirmed" : "casual_sparring_teammate_confirmed"
    });
  }
  await admin
    .from("casual_matches")
    .update({
      confirmation_status: "confirmed",
      opponent_confirmed_at: new Date().toISOString()
    })
    .eq("id", casualMatchId);

  revalidatePath("/profile");
  revalidatePath(`/profile/history/casual/${casualMatchId}`);
}

export async function submitManualResultAction(formData: FormData) {
  const { user, profile } = await requireUser();
  const matchId = fromFormString(formData.get("match_id"));
  const submissionId = submissionIdFromForm(formData);
  const winnerParticipantId = fromFormString(formData.get("winner_participant_id"));
  const scoreA = Number(formData.get("score_a"));
  const scoreB = Number(formData.get("score_b"));
  const isAdmin = profile?.role === "admin";
  if (!isAdmin) {
    await assertMatchMember(matchId, user.id);
  }

  const admin = createSupabaseAdminClient();
  const { data: match, error: matchError } = await admin
    .from("matches")
    .select("id, tournament_id, participant_a_id, participant_b_id, status, dart_mode, game_variant, leg_rules, details")
    .eq("id", matchId)
    .single();
  if (matchError) throw new Error(matchError.message);
  if (match.status === "bye") {
    throw new Error("This match has already been settled.");
  }
  if (match.status === "completed") {
    if (!isAdmin && hasSameResultSubmission(match.details, submissionId)) {
      revalidatePath(`/tournaments/${match.tournament_id}`);
      return;
    }
    if (!hasSameResultSubmission(match.details, submissionId)) {
      throw new Error("This match has already been settled.");
    }
  }
  if (!match.participant_a_id || !match.participant_b_id) {
    throw new Error("Manual result requires two participants.");
  }
  if (!isAdmin && submissionId) {
    const { data: existingConfirmation, error: existingConfirmationError } = await admin
      .from("match_result_confirmations")
      .select("id, status")
      .eq("match_id", matchId)
      .eq("submitted_by", user.id)
      .contains("details", { submissionId })
      .limit(1)
      .maybeSingle();
    if (existingConfirmationError) throw new Error(existingConfirmationError.message);
    if (existingConfirmation) {
      revalidatePath(`/tournaments/${match.tournament_id}`);
      return;
    }
  }
  if (!isAdmin && match.status === "pending_confirmation") {
    throw new Error("This match is already waiting for result confirmation.");
  }

  const participantAUserIds = await getTeamUserIds(admin, match.participant_a_id);
  const participantBUserIds = await getTeamUserIds(admin, match.participant_b_id);
  const allUserIds = [...new Set([...participantAUserIds, ...participantBUserIds])];
  const userStats = parseManualStatsForUsers(formData, allUserIds);
  const dartMode = ((match.dart_mode || "steel") === "soft" ? "soft" : "steel") as MatchDartMode;
  const legRules = (Array.isArray(match.leg_rules) && match.leg_rules.length > 0
    ? match.leg_rules
    : [
        {
          legNumber: 1,
          participantMode: "doubles",
          dartMode,
          gameVariant: match.game_variant || (dartMode === "soft" ? "soft_501" : "501")
        }
      ]) as MatchLegRule[];
  const legLineups = parseLineupsFromForm({
    formData,
    legRules,
    participantAUserIds,
    participantBUserIds
  });
  const participantAPlayedUserIds = userIdsFromLineups({
    participantId: match.participant_a_id,
    participantAId: match.participant_a_id,
    participantBId: match.participant_b_id,
    fallbackUserIds: participantAUserIds,
    lineups: legLineups
  });
  const participantBPlayedUserIds = userIdsFromLineups({
    participantId: match.participant_b_id,
    participantAId: match.participant_a_id,
    participantBId: match.participant_b_id,
    fallbackUserIds: participantBUserIds,
    lineups: legLineups
  });

  const details = buildManualResultDetails({
    source: isAdmin ? "admin_public_manual" : "manual_submission",
    dartMode,
    gameVariant: match.game_variant,
    legRules,
    legLineups,
    submissionId,
    participantStats: {
      [match.participant_a_id]: buildParticipantManualStats(participantAPlayedUserIds, userStats),
      [match.participant_b_id]: buildParticipantManualStats(participantBPlayedUserIds, userStats)
    },
    userStats
  });

  if (isAdmin) {
    const settlement = winnerParticipantId
      ? await buildSettlementSideEffects({
          admin,
          matchId,
          tournamentId: match.tournament_id,
          participantAId: match.participant_a_id,
          participantBId: match.participant_b_id,
          winnerParticipantId,
          scoreA,
          scoreB,
          turns: [],
          dartMode,
          userStats,
          legLineups
        })
      : { ratingLogs: [], statEvents: [] };

    await settleTournamentMatch({
      admin,
      matchId,
      winnerParticipantId: winnerParticipantId || null,
      scoreA,
      scoreB,
      details,
      ratingLogs: settlement.ratingLogs,
      statEvents: settlement.statEvents
    });
    revalidatePath(`/tournaments/${match.tournament_id}`);
    revalidatePath(`/admin/tournaments/${match.tournament_id}/results`);
    return;
  }

  const opponentParticipantId =
    winnerParticipantId === match.participant_a_id ? match.participant_b_id : match.participant_a_id;
  const opponentUserIds = opponentParticipantId
    ? await getTeamUserIds(admin, opponentParticipantId)
    : [];
  const requiredConfirmBy = opponentUserIds[0];
  if (!requiredConfirmBy) throw new Error("Could not find an opponent user to confirm.");

  const { data: insertedConfirmation, error: confirmationInsertError } = await admin
    .from("match_result_confirmations")
    .insert({
      match_id: matchId,
      submitted_by: user.id,
      required_confirm_by: requiredConfirmBy,
      proposed_winner_participant_id: winnerParticipantId,
      proposed_score_a: scoreA,
      proposed_score_b: scoreB,
      status: "pending",
      details
    })
    .select("id")
    .single();
  if (confirmationInsertError) {
    if (submissionId) {
      const { data: existingConfirmation, error: existingConfirmationError } = await admin
        .from("match_result_confirmations")
        .select("id")
        .eq("match_id", matchId)
        .eq("submitted_by", user.id)
        .contains("details", { submissionId })
        .limit(1)
        .maybeSingle();
      if (existingConfirmationError) throw new Error(existingConfirmationError.message);
      if (existingConfirmation) {
        revalidatePath(`/tournaments/${match.tournament_id}`);
        return;
      }
    }
    throw new Error(confirmationInsertError.message);
  }
  if (!insertedConfirmation) throw new Error("Could not create result confirmation.");

  const { data: pendingMatch, error: pendingMatchError } = await admin
    .from("matches")
    .update({ status: "pending_confirmation" })
    .eq("id", matchId)
    .neq("status", "completed")
    .neq("status", "bye")
    .select("id")
    .maybeSingle();
  if (pendingMatchError) throw new Error(pendingMatchError.message);
  if (!pendingMatch) {
    await admin
      .from("match_result_confirmations")
      .update({ status: "disputed", reject_reason: "Match was settled before confirmation started." })
      .eq("id", insertedConfirmation.id);
    throw new Error("This match has already been settled.");
  }
  revalidatePath(`/tournaments/${match.tournament_id}`);
}

export async function confirmManualResultAction(formData: FormData) {
  const { user } = await requireUser();
  const confirmationId = fromFormString(formData.get("confirmation_id"));
  const decision = fromFormString(formData.get("decision"));
  const admin = createSupabaseAdminClient();

  const { data: confirmation, error } = await admin
    .from("match_result_confirmations")
    .select("id, match_id, required_confirm_by, proposed_winner_participant_id, proposed_score_a, proposed_score_b, status, details")
    .eq("id", confirmationId)
    .single();

  if (error) throw new Error(error.message);
  if (confirmation.required_confirm_by !== user.id) {
    throw new Error("Only the required opponent can confirm this result.");
  }
  if (confirmation.status !== "pending") {
    throw new Error("This confirmation has already been handled.");
  }

  if (decision === "confirmed") {
    const { data: match, error: matchError } = await admin
      .from("matches")
      .select("id, tournament_id, participant_a_id, participant_b_id, status, dart_mode, game_variant")
      .eq("id", confirmation.match_id)
      .single();

    if (matchError) throw new Error(matchError.message);
    if (!match.participant_a_id || !match.participant_b_id || !confirmation.proposed_winner_participant_id) {
      throw new Error("Manual result confirmation is missing match participants.");
    }
    if (match.status === "completed" || match.status === "bye") {
      throw new Error("This match has already been settled.");
    }

    const details = {
      ...((confirmation.details as Record<string, unknown> | null) || {}),
      source: "manual_confirmation",
      dartMode: match.dart_mode || "steel",
      gameVariant: match.game_variant
    };
    const settlement = await buildSettlementSideEffects({
      admin,
      matchId: confirmation.match_id,
      tournamentId: match.tournament_id,
      participantAId: match.participant_a_id,
      participantBId: match.participant_b_id,
      winnerParticipantId: confirmation.proposed_winner_participant_id,
      scoreA: confirmation.proposed_score_a,
      scoreB: confirmation.proposed_score_b,
      turns: [],
      dartMode: ((match.dart_mode || "steel") === "soft" ? "soft" : "steel") as MatchDartMode,
      userStats:
        ((confirmation.details as { userStats?: ManualStatsById } | null)?.userStats || {}) as ManualStatsById,
      legLineups:
        ((confirmation.details as { legLineups?: MatchLegLineup[] } | null)?.legLineups || []) as MatchLegLineup[]
    });
    await settleTournamentMatch({
      admin,
      matchId: confirmation.match_id,
      winnerParticipantId: confirmation.proposed_winner_participant_id,
      scoreA: confirmation.proposed_score_a,
      scoreB: confirmation.proposed_score_b,
      details,
      ratingLogs: settlement.ratingLogs,
      statEvents: settlement.statEvents,
      confirmationId
    });
    revalidatePath(`/tournaments/${match.tournament_id}`);
  } else {
    const { data: updatedConfirmation, error: confirmationUpdateError } = await admin
      .from("match_result_confirmations")
      .update({ status: "rejected", reject_reason: "Rejected by opponent" })
      .eq("id", confirmationId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (confirmationUpdateError) throw new Error(confirmationUpdateError.message);
    if (!updatedConfirmation) throw new Error("This confirmation has already been handled.");
    await admin
      .from("matches")
      .update({ status: "disputed" })
      .eq("id", confirmation.match_id)
      .neq("status", "completed");
  }
  revalidatePath("/profile");
}

export async function adminUpdateMatchResultAction(formData: FormData) {
  await requireAdmin();
  const matchId = fromFormString(formData.get("match_id"));
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const submissionId = submissionIdFromForm(formData);
  const winnerParticipantId = fromFormString(formData.get("winner_participant_id"));
  const scoreA = Number(formData.get("score_a"));
  const scoreB = Number(formData.get("score_b"));
  const admin = createSupabaseAdminClient();
  const { data: match, error: matchError } = await admin
    .from("matches")
    .select("id, tournament_id, participant_a_id, participant_b_id, winner_participant_id, status, dart_mode, game_variant, leg_rules, details")
    .eq("id", matchId)
    .single();

  if (matchError) throw new Error(matchError.message);
  if (!match.participant_a_id || !match.participant_b_id) {
    throw new Error("Cannot update a match without two participants.");
  }

  const participantAUserIds = await getTeamUserIds(admin, match.participant_a_id);
  const participantBUserIds = await getTeamUserIds(admin, match.participant_b_id);
  const userStats = parseManualStatsForUsers(formData, [
    ...new Set([...participantAUserIds, ...participantBUserIds])
  ]);
  const dartMode = ((match.dart_mode || "steel") === "soft" ? "soft" : "steel") as MatchDartMode;
  const legRules = (Array.isArray(match.leg_rules) && match.leg_rules.length > 0
    ? match.leg_rules
    : [
        {
          legNumber: 1,
          participantMode: "doubles",
          dartMode,
          gameVariant: match.game_variant || (dartMode === "soft" ? "soft_501" : "501")
        }
      ]) as MatchLegRule[];
  const legLineups = parseLineupsFromForm({
    formData,
    legRules,
    participantAUserIds,
    participantBUserIds
  });
  const participantAPlayedUserIds = userIdsFromLineups({
    participantId: match.participant_a_id,
    participantAId: match.participant_a_id,
    participantBId: match.participant_b_id,
    fallbackUserIds: participantAUserIds,
    lineups: legLineups
  });
  const participantBPlayedUserIds = userIdsFromLineups({
    participantId: match.participant_b_id,
    participantAId: match.participant_a_id,
    participantBId: match.participant_b_id,
    fallbackUserIds: participantBUserIds,
    lineups: legLineups
  });
  const details = buildManualResultDetails({
    source: "admin_override",
    dartMode,
    gameVariant: match.game_variant,
    legRules,
    legLineups,
    submissionId,
    participantStats: {
      [match.participant_a_id]: buildParticipantManualStats(participantAPlayedUserIds, userStats),
      [match.participant_b_id]: buildParticipantManualStats(participantBPlayedUserIds, userStats)
    },
    userStats
  });
  const recalculate = match.status === "completed";
  const settlement = winnerParticipantId
    ? await buildSettlementSideEffects({
        admin,
        matchId,
        tournamentId: match.tournament_id,
        participantAId: match.participant_a_id,
        participantBId: match.participant_b_id,
        winnerParticipantId,
        scoreA,
        scoreB,
        turns: [],
        dartMode,
        userStats,
        legLineups,
        recalculate
      })
    : { ratingLogs: [], statEvents: [] };

  await settleTournamentMatch({
    admin,
    matchId,
    winnerParticipantId: winnerParticipantId || null,
    scoreA,
    scoreB,
    details,
    ratingLogs: settlement.ratingLogs,
    statEvents: settlement.statEvents,
    recalculate
  });
  revalidatePath(`/admin/tournaments/${tournamentId}/results`);
  revalidatePath(`/tournaments/${tournamentId}`);
}
