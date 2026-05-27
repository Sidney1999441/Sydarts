"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { calculateDartStats, type ScoreTurn } from "@/lib/algorithms/scoring";
import { updateUserRating } from "@/lib/algorithms/rating";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { getLegStartingScore } from "@/lib/darts/variants";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fromFormString } from "@/lib/utils";
import type { MatchDartMode, MatchLegLineup, MatchLegResult, MatchLegRule } from "@/types/domain";

const SOFT_RATING_WEIGHT = 0.45;

type ManualSoftStats = {
  averageScore?: number;
  averageMpr?: number;
  countTon80?: number;
  countHatTrick?: number;
  highestCheckout?: number;
  countHighCheckout?: number;
  countWhiteHorse?: number;
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

const completeMatchSchema = z.object({
  matchId: z.string().uuid(),
  winnerParticipantId: z.string().uuid(),
  scoreA: z.number().int().min(0),
  scoreB: z.number().int().min(0),
  turns: z.array(
    z.object({
      participantId: z.string(),
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
      checkoutScore: z.number().nullable().optional()
    })
  ).default([]),
  legLineups: z.array(
    z.object({
      legNumber: z.number().int().min(1),
      participantAUserIds: z.array(z.string().uuid()).default([]),
      participantBUserIds: z.array(z.string().uuid()).default([])
    })
  ).default([])
});

const completeCasualMatchSchema = z.object({
  opponentName: z.string().trim().min(1).max(80),
  opponentUserId: z.string().uuid().optional().nullable(),
  startingScore: z.union([z.literal(301), z.literal(501), z.literal(701)]),
  bestOf: z.union([z.literal(3), z.literal(5), z.literal(7)]),
  winnerSide: z.enum(["A", "B"]),
  scoreA: z.number().int().min(0),
  scoreB: z.number().int().min(0),
  turns: z.array(
    z.object({
      participantId: z.enum(["me", "opponent"]),
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
        countWhiteHorse: optionalIntegerFromForm(formData, `stats_${userId}_count_white_horse`)
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
    p_count_white_horse: input.stats?.countWhiteHorse || 0
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

function buildManualResultDetails(input: {
  source: string;
  dartMode: MatchDartMode;
  gameVariant?: string | null;
  legRules?: MatchLegRule[];
  legLineups?: MatchLegLineup[];
  legResults?: MatchLegResult[];
  participantStats?: Record<string, ReturnType<typeof calculateDartStats> | ManualSoftStats>;
  userStats?: ManualStatsById;
}) {
  return {
    source: input.source,
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
    countWhiteHorse: stats.reduce((total, stat) => total + (stat.countWhiteHorse || 0), 0)
  });
}

async function applyStatsAndRating(input: {
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
}) {
  const { admin } = input;
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
  if (allUserIds.length === 0) return;

  const { data: profiles, error: profileError } = await admin
    .from("profiles")
    .select("id, rating, tournament_rating, casual_rating, soft_rating")
    .in("id", allUserIds);

  if (profileError) throw new Error(profileError.message);
  const softRatingByUser = new Map(
    (profiles || []).map((profile) => [profile.id, profile.soft_rating ?? profile.rating ?? 1000])
  );

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

      await admin.from("profiles").update({ soft_rating: softRating.winnerRatingAfter }).eq("id", userId);
      await admin.from("rating_logs").insert({
        user_id: userId,
        tournament_id: input.tournamentId,
        match_id: input.matchId,
        rating_before: currentSoftRating,
        rating_after: softRating.winnerRatingAfter,
        delta: softRating.winnerDelta,
        reason: "match_win",
        rating_scope: "soft",
        match_source: "tournament_soft"
      });
      await admin.rpc(
        "upsert_soft_match_stats",
        buildSoftStatsRpcPayload({
          userId,
          won: true,
          legsWon,
          legsLost,
          stats
        })
      );
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

      await admin.from("profiles").update({ soft_rating: softRating.loserRatingAfter }).eq("id", userId);
      await admin.from("rating_logs").insert({
        user_id: userId,
        tournament_id: input.tournamentId,
        match_id: input.matchId,
        rating_before: currentSoftRating,
        rating_after: softRating.loserRatingAfter,
        delta: softRating.loserDelta,
        reason: "match_loss",
        rating_scope: "soft",
        match_source: "tournament_soft"
      });
      await admin.rpc(
        "upsert_soft_match_stats",
        buildSoftStatsRpcPayload({
          userId,
          won: false,
          legsWon,
          legsLost,
          stats
        })
      );
    }

    return;
  }

  const tournamentRatingByUser = new Map(
    (profiles || []).map((profile) => [profile.id, profile.tournament_rating ?? profile.rating ?? 1000])
  );
  const casualRatingByUser = new Map(
    (profiles || []).map((profile) => [profile.id, profile.casual_rating ?? profile.rating ?? 1000])
  );
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
    const stats = statsByParticipant.get(input.winnerParticipantId);
    const legsWon = input.winnerParticipantId === input.participantAId ? input.scoreA : input.scoreB;
    const legsLost = input.winnerParticipantId === input.participantAId ? input.scoreB : input.scoreA;

    await admin
      .from("profiles")
      .update({
        rating: tournamentRating.winnerRatingAfter,
        tournament_rating: tournamentRating.winnerRatingAfter,
        casual_rating: casualRating.winnerRatingAfter
      })
      .eq("id", userId);
    await admin.from("rating_logs").insert([
      {
        user_id: userId,
        tournament_id: input.tournamentId,
        match_id: input.matchId,
        rating_before: currentTournamentRating,
        rating_after: tournamentRating.winnerRatingAfter,
        delta: tournamentRating.winnerDelta,
        reason: "match_win",
        rating_scope: "tournament",
        match_source: "tournament"
      },
      {
        user_id: userId,
        tournament_id: input.tournamentId,
        match_id: input.matchId,
        rating_before: currentCasualRating,
        rating_after: casualRating.winnerRatingAfter,
        delta: casualRating.winnerDelta,
        reason: "match_win",
        rating_scope: "general",
        match_source: "tournament"
      }
    ]);
    const statsPayload = buildStatsRpcPayload({
      userId,
      won: true,
      legsWon,
      legsLost,
      stats
    });
    await admin.rpc("upsert_user_match_stats", statsPayload);
    await admin.rpc("upsert_general_match_stats", statsPayload);
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
    const stats = statsByParticipant.get(loserParticipantId);
    const legsWon = loserParticipantId === input.participantAId ? input.scoreA : input.scoreB;
    const legsLost = loserParticipantId === input.participantAId ? input.scoreB : input.scoreA;

    await admin
      .from("profiles")
      .update({
        rating: tournamentRating.loserRatingAfter,
        tournament_rating: tournamentRating.loserRatingAfter,
        casual_rating: casualRating.loserRatingAfter
      })
      .eq("id", userId);
    await admin.from("rating_logs").insert([
      {
        user_id: userId,
        tournament_id: input.tournamentId,
        match_id: input.matchId,
        rating_before: currentTournamentRating,
        rating_after: tournamentRating.loserRatingAfter,
        delta: tournamentRating.loserDelta,
        reason: "match_loss",
        rating_scope: "tournament",
        match_source: "tournament"
      },
      {
        user_id: userId,
        tournament_id: input.tournamentId,
        match_id: input.matchId,
        rating_before: currentCasualRating,
        rating_after: casualRating.loserRatingAfter,
        delta: casualRating.loserDelta,
        reason: "match_loss",
        rating_scope: "general",
        match_source: "tournament"
      }
    ]);
    const statsPayload = buildStatsRpcPayload({
      userId,
      won: false,
      legsWon,
      legsLost,
      stats
    });
    await admin.rpc("upsert_user_match_stats", statsPayload);
    await admin.rpc("upsert_general_match_stats", statsPayload);
  }
}

async function advanceKnockoutWinner(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  matchId: string,
  winnerParticipantId: string
) {
  const { data: match, error } = await admin
    .from("matches")
    .select("id, stage, next_match_id, next_match_slot")
    .eq("id", matchId)
    .single();

  if (error) throw new Error(error.message);
  if (match.stage !== "knockout" || !match.next_match_id || !match.next_match_slot) {
    return;
  }

  const nextSlotColumn =
    match.next_match_slot === "A" ? "participant_a_id" : "participant_b_id";
  const { error: advanceError } = await admin
    .from("matches")
    .update({ [nextSlotColumn]: winnerParticipantId })
    .eq("id", match.next_match_id);

  if (advanceError) throw new Error(advanceError.message);
}

async function insertScoredLegsAndTurns(input: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  matchId: string;
  legResults: MatchLegResult[];
  turns: ScoreTurn[];
}) {
  if (input.legResults.length === 0) {
    if (input.turns.length > 0) {
      await input.admin.from("match_turns").insert(
        input.turns.map((turn, index) => ({
          match_id: input.matchId,
          participant_id: turn.participantId,
          leg_number: turn.legNumber || 1,
          turn_number: index + 1,
          score: turn.score,
          darts: turn.darts || 3,
          remaining_before: turn.remainingBefore,
          remaining_after: turn.remainingAfter,
          is_bust: turn.isBust,
          is_checkout: turn.isCheckout
        }))
      );
    }
    return;
  }

  const { data: insertedLegs, error: legError } = await input.admin
    .from("match_legs")
    .insert(
      input.legResults.map((result) => ({
        match_id: input.matchId,
        leg_number: result.legNumber,
        starting_score: getLegStartingScore(result),
        participant_mode: result.participantMode,
        dart_mode: result.dartMode,
        game_variant: result.gameVariant,
        participant_a_user_ids: result.participantAUserIds || [],
        participant_b_user_ids: result.participantBUserIds || [],
        winner_participant_id: result.winnerParticipantId,
        checkout_score: result.checkoutScore || null,
        status: "completed"
      }))
    )
    .select("id, leg_number");

  if (legError) throw new Error(legError.message);
  const legIdByNumber = new Map((insertedLegs || []).map((leg) => [leg.leg_number, leg.id]));

  if (input.turns.length > 0) {
    const { error: turnError } = await input.admin.from("match_turns").insert(
      input.turns.map((turn, index) => ({
        match_id: input.matchId,
        leg_id: legIdByNumber.get(turn.legNumber) || null,
        participant_id: turn.participantId,
        leg_number: turn.legNumber || 1,
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
}

export async function completeScoredMatchAction(payload: unknown) {
  const { user } = await requireUser();
  const values = completeMatchSchema.parse(payload);
  await assertMatchMember(values.matchId, user.id);

  const admin = createSupabaseAdminClient();
  const { data: match, error: matchError } = await admin
    .from("matches")
    .select("id, tournament_id, participant_a_id, participant_b_id, dart_mode, game_variant, leg_rules, match_finish_mode")
    .eq("id", values.matchId)
    .single();

  if (matchError) throw new Error(matchError.message);
  if (!match.participant_a_id || !match.participant_b_id) {
    throw new Error("Match does not have two participants.");
  }
  if ((match.dart_mode || "steel") === "soft") {
    throw new Error("Soft dart matches are manual-entry only for now.");
  }

  const details = buildManualResultDetails({
    source: "scorer",
    dartMode: "steel",
    gameVariant: match.game_variant,
    legRules: (match.leg_rules || []) as MatchLegRule[],
    legLineups: values.legLineups as MatchLegLineup[],
    legResults: values.legResults as MatchLegResult[],
    participantStats: buildParticipantStatsFromTurns({
      participantAId: match.participant_a_id,
      participantBId: match.participant_b_id,
      turns: values.turns
    })
  });

  const { error } = await admin
    .from("matches")
    .update({
      winner_participant_id: values.winnerParticipantId,
      score_a: values.scoreA,
      score_b: values.scoreB,
      status: "completed",
      details
    })
    .eq("id", values.matchId);

  if (error) throw new Error(error.message);

  await insertScoredLegsAndTurns({
    admin,
    matchId: values.matchId,
    legResults: values.legResults as MatchLegResult[],
    turns: values.turns
  });

  await applyStatsAndRating({
    admin,
    matchId: values.matchId,
    tournamentId: match.tournament_id,
    participantAId: match.participant_a_id,
    participantBId: match.participant_b_id,
    winnerParticipantId: values.winnerParticipantId,
    scoreA: values.scoreA,
    scoreB: values.scoreB,
    turns: values.turns,
    dartMode: "steel",
    legLineups: values.legLineups as MatchLegLineup[]
  });
  await advanceKnockoutWinner(admin, values.matchId, values.winnerParticipantId);

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
  const profileIds = [user.id, opponentUserId].filter(Boolean) as string[];
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

  const playerAName =
    profile?.display_name || profileById.get(user.id)?.display_name || user.email?.split("@")[0] || "Me";
  const playerBName = opponentProfile?.display_name || values.opponentName;
  const turnsA = values.turns.filter((turn) => turn.participantId === "me");
  const turnsB = values.turns.filter((turn) => turn.participantId === "opponent");
  const statsA = calculateDartStats(turnsA);
  const statsB = calculateDartStats(turnsB);
  const playerARating = profileById.get(user.id)?.casual_rating ?? profileById.get(user.id)?.rating ?? 1000;
  const playerBRating = opponentProfile?.casual_rating ?? opponentProfile?.rating ?? 1000;
  const ratingResult =
    values.winnerSide === "A"
      ? updateUserRating({ winnerRating: playerARating, loserRating: playerBRating })
      : updateUserRating({ winnerRating: playerBRating, loserRating: playerARating });
  const playerARatingAfter =
    values.winnerSide === "A" ? ratingResult.winnerRatingAfter : ratingResult.loserRatingAfter;
  const playerBRatingAfter =
    values.winnerSide === "B" ? ratingResult.winnerRatingAfter : ratingResult.loserRatingAfter;
  const playerADelta = playerARatingAfter - playerARating;
  const playerBDelta = playerBRatingAfter - playerBRating;

  const { data: casualMatch, error: casualMatchError } = await admin
    .from("casual_matches")
    .insert({
      created_by: user.id,
      player_a_user_id: user.id,
      player_b_user_id: opponentUserId,
      player_a_name: playerAName,
      player_b_name: playerBName,
      starting_score: values.startingScore,
      best_of: values.bestOf,
      winner_side: values.winnerSide,
      score_a: values.scoreA,
      score_b: values.scoreB,
      confirmation_status: opponentUserId ? "pending" : "not_required",
      details: {
        source: "casual_scorer",
        participantStats: {
          A: statsA,
          B: statsB
        },
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
          }
        }
      }
    })
    .select("id")
    .single();

  if (casualMatchError) throw new Error(casualMatchError.message);

  if (values.turns.length > 0) {
    const { error: turnError } = await admin.from("casual_match_turns").insert(
      values.turns.map((turn, index) => ({
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

  await admin.from("profiles").update({ casual_rating: playerARatingAfter }).eq("id", user.id);
  await admin.from("rating_logs").insert({
    user_id: user.id,
    casual_match_id: casualMatch.id,
    rating_before: playerARating,
    rating_after: playerARatingAfter,
    delta: playerADelta,
    reason: values.winnerSide === "A" ? "match_win" : "match_loss",
    note: "casual_sparring",
    rating_scope: "general",
    match_source: "casual"
  });
  await admin.rpc(
    "upsert_general_match_stats",
    buildStatsRpcPayload({
      userId: user.id,
      won: values.winnerSide === "A",
      legsWon: values.scoreA,
      legsLost: values.scoreB,
      stats: statsA
    })
  );

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
    return;
  }

  const { data: turns, error: turnError } = await admin
    .from("casual_match_turns")
    .select("*")
    .eq("casual_match_id", casualMatchId)
    .eq("side", "B")
    .order("turn_number");

  if (turnError) throw new Error(turnError.message);
  const stats = calculateDartStats(
    (turns || []).map((turn) => ({
      participantId: "opponent",
      legNumber: 1,
      score: turn.score,
      darts: turn.darts || 3,
      remainingBefore: turn.remaining_before,
      remainingAfter: turn.remaining_after,
      isBust: turn.is_bust,
      isCheckout: turn.is_checkout
    }))
  );
  const ratingDelta =
    (casualMatch.details as { ratingOutcome?: { B?: { delta?: number } } } | null)?.ratingOutcome?.B?.delta ??
    (casualMatch.winner_side === "B" ? 10 : -10);
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("casual_rating, rating")
    .eq("id", user.id)
    .single();

  if (profileError) throw new Error(profileError.message);
  const ratingBefore = profile.casual_rating ?? profile.rating ?? 1000;
  const ratingAfter = Math.max(100, ratingBefore + ratingDelta);

  await admin.from("profiles").update({ casual_rating: ratingAfter }).eq("id", user.id);
  await admin.from("rating_logs").insert({
    user_id: user.id,
    casual_match_id: casualMatchId,
    rating_before: ratingBefore,
    rating_after: ratingAfter,
    delta: ratingAfter - ratingBefore,
    reason: casualMatch.winner_side === "B" ? "match_win" : "match_loss",
    note: "casual_sparring_confirmed",
    rating_scope: "general",
    match_source: "casual"
  });
  await admin.rpc(
    "upsert_general_match_stats",
    buildStatsRpcPayload({
      userId: user.id,
      won: casualMatch.winner_side === "B",
      legsWon: casualMatch.score_b,
      legsLost: casualMatch.score_a,
      stats
    })
  );
  await admin
    .from("casual_matches")
    .update({
      confirmation_status: "confirmed",
      opponent_confirmed_at: new Date().toISOString()
    })
    .eq("id", casualMatchId);

  revalidatePath("/profile");
}

export async function submitManualResultAction(formData: FormData) {
  const { user } = await requireUser();
  const matchId = fromFormString(formData.get("match_id"));
  const winnerParticipantId = fromFormString(formData.get("winner_participant_id"));
  const scoreA = Number(formData.get("score_a"));
  const scoreB = Number(formData.get("score_b"));
  await assertMatchMember(matchId, user.id);

  const admin = createSupabaseAdminClient();
  const { data: match, error: matchError } = await admin
    .from("matches")
    .select("id, tournament_id, participant_a_id, participant_b_id, dart_mode, game_variant, leg_rules")
    .eq("id", matchId)
    .single();
  if (matchError) throw new Error(matchError.message);
  if (!match.participant_a_id || !match.participant_b_id) {
    throw new Error("Manual result requires two participants.");
  }

  const opponentParticipantId =
    winnerParticipantId === match.participant_a_id ? match.participant_b_id : match.participant_a_id;
  const opponentUserIds = opponentParticipantId
    ? await getTeamUserIds(admin, opponentParticipantId)
    : [];
  const requiredConfirmBy = opponentUserIds[0];
  if (!requiredConfirmBy) throw new Error("Could not find an opponent user to confirm.");
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

  await admin.from("match_result_confirmations").insert({
    match_id: matchId,
    submitted_by: user.id,
    required_confirm_by: requiredConfirmBy,
    proposed_winner_participant_id: winnerParticipantId,
    proposed_score_a: scoreA,
    proposed_score_b: scoreB,
    status: "pending",
    details: buildManualResultDetails({
      source: "manual_submission",
      dartMode,
      gameVariant: match.game_variant,
      legRules,
      legLineups,
      participantStats: {
        [match.participant_a_id]: buildParticipantManualStats(participantAPlayedUserIds, userStats),
        [match.participant_b_id]: buildParticipantManualStats(participantBPlayedUserIds, userStats)
      },
      userStats
    })
  });

  await admin.from("matches").update({ status: "pending_confirmation" }).eq("id", matchId);
  revalidatePath(`/tournaments/${match.tournament_id}`);
}

export async function confirmManualResultAction(formData: FormData) {
  const { user } = await requireUser();
  const confirmationId = fromFormString(formData.get("confirmation_id"));
  const decision = fromFormString(formData.get("decision"));
  const admin = createSupabaseAdminClient();

  const { data: confirmation, error } = await admin
    .from("match_result_confirmations")
    .select("id, match_id, required_confirm_by, proposed_winner_participant_id, proposed_score_a, proposed_score_b, details")
    .eq("id", confirmationId)
    .single();

  if (error) throw new Error(error.message);
  if (confirmation.required_confirm_by !== user.id) {
    throw new Error("Only the required opponent can confirm this result.");
  }

  if (decision === "confirmed") {
    const { data: match, error: matchError } = await admin
      .from("matches")
      .select("id, tournament_id, participant_a_id, participant_b_id, dart_mode, game_variant")
      .eq("id", confirmation.match_id)
      .single();

    if (matchError) throw new Error(matchError.message);
    if (!match.participant_a_id || !match.participant_b_id || !confirmation.proposed_winner_participant_id) {
      throw new Error("Manual result confirmation is missing match participants.");
    }

    await admin
      .from("match_result_confirmations")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", confirmationId);
    await admin
      .from("matches")
      .update({
        winner_participant_id: confirmation.proposed_winner_participant_id,
        score_a: confirmation.proposed_score_a,
        score_b: confirmation.proposed_score_b,
        status: "completed",
        details: {
          ...((confirmation.details as Record<string, unknown> | null) || {}),
          source: "manual_confirmation",
          dartMode: match.dart_mode || "steel",
          gameVariant: match.game_variant
        }
      })
      .eq("id", confirmation.match_id);
    await applyStatsAndRating({
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
    await advanceKnockoutWinner(admin, confirmation.match_id, confirmation.proposed_winner_participant_id);
    revalidatePath(`/tournaments/${match.tournament_id}`);
  } else {
    await admin
      .from("match_result_confirmations")
      .update({ status: "rejected", reject_reason: "Rejected by opponent" })
      .eq("id", confirmationId);
    await admin.from("matches").update({ status: "disputed" }).eq("id", confirmation.match_id);
  }
  revalidatePath("/profile");
}

export async function adminUpdateMatchResultAction(formData: FormData) {
  await requireAdmin();
  const matchId = fromFormString(formData.get("match_id"));
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const winnerParticipantId = fromFormString(formData.get("winner_participant_id"));
  const scoreA = Number(formData.get("score_a"));
  const scoreB = Number(formData.get("score_b"));
  const admin = createSupabaseAdminClient();
  const { data: match, error: matchError } = await admin
    .from("matches")
    .select("id, tournament_id, participant_a_id, participant_b_id, winner_participant_id, status, dart_mode, game_variant, leg_rules")
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
  const shouldApplyStatsAndRating = Boolean(winnerParticipantId) && match.status !== "completed";

  const { error } = await admin
    .from("matches")
    .update({
      winner_participant_id: winnerParticipantId || null,
      score_a: scoreA,
      score_b: scoreB,
      status: "completed",
      details: buildManualResultDetails({
        source: "admin_override",
        dartMode,
        gameVariant: match.game_variant,
        legRules,
        legLineups,
        participantStats: {
          [match.participant_a_id]: buildParticipantManualStats(participantAPlayedUserIds, userStats),
          [match.participant_b_id]: buildParticipantManualStats(participantBPlayedUserIds, userStats)
        },
        userStats
      })
    })
    .eq("id", matchId);

  if (error) throw new Error(error.message);
  if (shouldApplyStatsAndRating && winnerParticipantId) {
    await applyStatsAndRating({
      admin,
      matchId,
      tournamentId,
      participantAId: match.participant_a_id,
      participantBId: match.participant_b_id,
      winnerParticipantId,
      scoreA,
      scoreB,
      turns: [],
      dartMode,
      userStats,
      legLineups
    });
  }
  if (winnerParticipantId) {
    await advanceKnockoutWinner(admin, matchId, winnerParticipantId);
  }
  revalidatePath(`/admin/tournaments/${tournamentId}/results`);
  revalidatePath(`/tournaments/${tournamentId}`);
}
