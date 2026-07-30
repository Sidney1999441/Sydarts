import { getLegStartingScore } from "@/lib/darts/variants";
import type { FirstThrowMode, MatchFinishMode, MatchLegLineup, MatchLegResult, MatchLegRule } from "@/types/domain";

export type ScoreTurn = {
  participantId: string;
  userId?: string;
  legNumber: number;
  score: number;
  darts?: number;
  remainingBefore: number;
  remainingAfter: number;
  isBust: boolean;
  isCheckout: boolean;
};

export type ScoringParticipant = {
  participantId: string;
  remaining: number;
  legsWon: number;
  turns: ScoreTurn[];
};

export type ScoringState = {
  startingScore: 301 | 501 | 701;
  bestOf: 3 | 5 | 7;
  matchFinishMode: MatchFinishMode;
  firstParticipantId: string;
  firstThrowMode: FirstThrowMode;
  legRules: MatchLegRule[];
  legLineups: MatchLegLineup[];
  legResults: MatchLegResult[];
  currentLeg: number;
  activeParticipantId: string;
  winnerParticipantId: string | null;
  turns: ScoreTurn[];
  participants: [ScoringParticipant, ScoringParticipant];
};

export function legsNeeded(bestOf: number) {
  return Math.floor(bestOf / 2) + 1;
}

function buildFallbackRules(input: {
  startingScore: 301 | 501 | 701;
  bestOf: 3 | 5 | 7;
}): MatchLegRule[] {
  return Array.from({ length: input.bestOf }, (_, index) => ({
    legNumber: index + 1,
    participantMode: "doubles",
    dartMode: "steel",
    gameVariant: String(input.startingScore) as "301" | "501" | "701"
  }));
}

function getCurrentRule(state: ScoringState) {
  return state.legRules[state.currentLeg - 1] || state.legRules[0];
}

function getLineupForLeg(lineups: MatchLegLineup[], legNumber: number): MatchLegLineup {
  return (
    lineups.find((lineup) => lineup.legNumber === legNumber) || {
      legNumber,
      participantAUserIds: [],
      participantBUserIds: []
    }
  );
}

function getLineupUserIdsForParticipant(input: {
  state: ScoringState;
  participantId: string;
  legNumber: number;
}) {
  const lineup = getLineupForLeg(input.state.legLineups, input.legNumber);
  if (input.participantId === input.state.participants[0].participantId) {
    return lineup.participantAUserIds || [];
  }
  if (input.participantId === input.state.participants[1].participantId) {
    return lineup.participantBUserIds || [];
  }
  return [];
}

function shouldFinishMatch(state: ScoringState, currentParticipant: ScoringParticipant) {
  if (state.matchFinishMode === "majority") {
    return currentParticipant.legsWon >= legsNeeded(state.legRules.length);
  }

  if (state.currentLeg < state.legRules.length) return false;
  const other = state.participants.find(
    (participant) => participant.participantId !== currentParticipant.participantId
  );
  return Boolean(other && currentParticipant.legsWon > other.legsWon);
}

function otherParticipantId(state: ScoringState, participantId: string) {
  return state.participants.find((participant) => participant.participantId !== participantId)?.participantId || participantId;
}

function getStarterForLeg(state: ScoringState, legNumber: number, previousWinnerParticipantId?: string | null) {
  if (state.firstThrowMode === "winner" && previousWinnerParticipantId) {
    return previousWinnerParticipantId;
  }

  return legNumber % 2 === 1
    ? state.firstParticipantId
    : otherParticipantId(state, state.firstParticipantId);
}

function advanceToNextLeg(state: ScoringState, previousWinnerParticipantId: string) {
  state.currentLeg += 1;
  const nextRule = getCurrentRule(state);
  const nextStartingScore = getLegStartingScore(nextRule);
  state.startingScore = nextStartingScore;
  state.participants = state.participants.map((participant) => ({
    ...participant,
    remaining: nextStartingScore
  })) as [ScoringParticipant, ScoringParticipant];
  state.activeParticipantId = getStarterForLeg(state, state.currentLeg, previousWinnerParticipantId);
}

export function createScoringState(input: {
  participantAId: string;
  participantBId: string;
  startingScore?: 301 | 501 | 701;
  bestOf?: 3 | 5 | 7;
  legRules?: MatchLegRule[];
  matchFinishMode?: MatchFinishMode;
  legLineups?: MatchLegLineup[];
  firstParticipantId?: string | null;
  firstThrowMode?: FirstThrowMode | null;
}): ScoringState {
  const startingScore = input.startingScore || 501;
  const bestOf = input.bestOf || 3;
  const legRules =
    input.legRules && input.legRules.length > 0
      ? input.legRules
      : buildFallbackRules({ startingScore, bestOf });
  const firstStartingScore = getLegStartingScore(legRules[0]);
  const firstParticipantId =
    input.firstParticipantId === input.participantBId ? input.participantBId : input.participantAId;
  const firstThrowMode = input.firstThrowMode === "winner" ? "winner" : "alternate";

  return {
    startingScore: firstStartingScore,
    bestOf,
    matchFinishMode: input.matchFinishMode || "majority",
    firstParticipantId,
    firstThrowMode,
    legRules,
    legLineups: input.legLineups || [],
    legResults: [],
    currentLeg: 1,
    activeParticipantId: firstParticipantId,
    winnerParticipantId: null,
    turns: [],
    participants: [
      {
        participantId: input.participantAId,
        remaining: firstStartingScore,
        legsWon: 0,
        turns: []
      },
      {
        participantId: input.participantBId,
        remaining: firstStartingScore,
        legsWon: 0,
        turns: []
      }
    ]
  };
}

export function adjudicateCurrentLegWinner(
  state: ScoringState,
  winnerParticipantId: string,
  options: {
    roundLimit?: number | null;
  } = {}
) {
  if (state.winnerParticipantId) return state;

  const next: ScoringState = structuredClone(state);
  const currentRule = getCurrentRule(next);
  const winner = next.participants.find(
    (participant) => participant.participantId === winnerParticipantId
  );
  const loser = next.participants.find(
    (participant) => participant.participantId !== winnerParticipantId
  );

  if (!winner || !loser || !currentRule) {
    throw new Error("Invalid leg winner.");
  }

  winner.legsWon += 1;
  const lineup = getLineupForLeg(next.legLineups, next.currentLeg);
  next.legResults.push({
    ...lineup,
    legNumber: next.currentLeg,
    winnerParticipantId: winner.participantId,
    participantMode: currentRule.participantMode,
    dartMode: currentRule.dartMode,
    gameVariant: currentRule.gameVariant,
    checkoutScore: null,
    resolutionReason: "round_limit",
    roundLimit: options.roundLimit ?? null,
    remainingA: next.participants[0].remaining,
    remainingB: next.participants[1].remaining
  });

  if (shouldFinishMatch(next, winner)) {
    next.winnerParticipantId = winner.participantId;
    return next;
  }

  advanceToNextLeg(next, winner.participantId);

  return next;
}

export function applyTurn(state: ScoringState, rawScore: number, darts = 3, throwerUserId?: string | null) {
  if (state.winnerParticipantId) return state;
  if (!Number.isInteger(rawScore) || rawScore < 0 || rawScore > 180) {
    throw new Error("Score must be an integer from 0 to 180.");
  }
  if (!Number.isInteger(darts) || darts < 1 || darts > 3) {
    throw new Error("Darts must be an integer from 1 to 3.");
  }

  const next: ScoringState = structuredClone(state);
  const currentRule = getCurrentRule(next);
  const current = next.participants.find(
    (participant) => participant.participantId === next.activeParticipantId
  );
  const other = next.participants.find(
    (participant) => participant.participantId !== next.activeParticipantId
  );

  if (!current || !other || !currentRule) {
    throw new Error("Invalid scoring state.");
  }

  const allowedUserIds = getLineupUserIdsForParticipant({
    state: next,
    participantId: current.participantId,
    legNumber: next.currentLeg
  });
  if (throwerUserId && allowedUserIds.length > 0 && !allowedUserIds.includes(throwerUserId)) {
    throw new Error("Selected thrower is not in this leg lineup.");
  }
  const userId = throwerUserId || (allowedUserIds.length === 1 ? allowedUserIds[0] : undefined);

  const remainingBefore = current.remaining;
  const proposedRemaining = remainingBefore - rawScore;
  const isBust = proposedRemaining < 0;
  const isCheckout = proposedRemaining === 0;

  const turn = {
    participantId: current.participantId,
    userId,
    legNumber: next.currentLeg,
    score: rawScore,
    darts,
    remainingBefore,
    remainingAfter: isBust ? remainingBefore : proposedRemaining,
    isBust,
    isCheckout
  };
  current.turns.push(turn);
  next.turns.push(turn);

  if (!isBust) {
    current.remaining = proposedRemaining;
  }

  if (isCheckout) {
    current.legsWon += 1;
    const lineup = getLineupForLeg(next.legLineups, next.currentLeg);
    next.legResults.push({
      ...lineup,
      legNumber: next.currentLeg,
      winnerParticipantId: current.participantId,
      participantMode: currentRule.participantMode,
      dartMode: currentRule.dartMode,
      gameVariant: currentRule.gameVariant,
      checkoutScore: rawScore,
      resolutionReason: "checkout"
    });

    if (shouldFinishMatch(next, current)) {
      next.winnerParticipantId = current.participantId;
      return next;
    }

    advanceToNextLeg(next, current.participantId);
    return next;
  }

  next.activeParticipantId = other.participantId;
  return next;
}

export function calculateDartStats(turns: ScoreTurn[]) {
  const scoringTurns = turns.filter((turn) => !turn.isBust);
  const checkoutTurns = turns.filter((turn) => turn.isCheckout);
  const totalScoredPoints = scoringTurns.reduce((total, turn) => total + turn.score, 0);
  const totalDarts = turns.reduce((total, turn) => total + (turn.darts || 3), 0);
  const highestTurnScore = turns.reduce(
    (highest, turn) => Math.max(highest, turn.score),
    0
  );
  const highestCheckout = checkoutTurns.reduce(
    (highest, turn) => Math.max(highest, turn.score),
    0
  );

  return {
    turnsThrown: turns.length,
    totalScoredPoints,
    totalDarts,
    averagePer3Darts:
      totalDarts > 0 ? Number(((totalScoredPoints / totalDarts) * 3).toFixed(2)) : 0,
    highestTurnScore,
    bustCount: turns.filter((turn) => turn.isBust).length,
    checkoutCount: checkoutTurns.length,
    highestCheckout,
    countHighCheckout: checkoutTurns.filter((turn) => turn.score >= 100).length,
    count60Plus: turns.filter((turn) => turn.score >= 60).length,
    count80Plus: turns.filter((turn) => turn.score >= 80).length,
    count180: turns.filter((turn) => turn.score === 180).length,
    count100Plus: turns.filter((turn) => turn.score >= 100).length,
    count140Plus: turns.filter((turn) => turn.score >= 140).length,
    count170Plus: turns.filter((turn) => turn.score >= 170).length,
    checkoutScore:
      [...turns].reverse().find((turn) => turn.isCheckout)?.score ?? null
  };
}
