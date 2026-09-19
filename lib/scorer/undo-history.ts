import type { ScoringState } from "@/lib/algorithms/scoring";

export type ScoringHistoryEntry = {
  state: ScoringState;
  throwers: Record<string, string>;
};
export type UndoCheckpoint = Pick<
  ScoringState,
  "currentLeg" | "activeParticipantId" | "firstParticipantId" | "firstThrowMode"
> & {
  turnCount: number;
  legResultCount: number;
  throwers: Record<string, string>;
  participants: Array<{
    participantId: string;
    remaining: number;
    legsWon: number;
  }>;
};

// Store counters and prefixes, not hundreds of duplicate copies of every turn.
export function packUndoHistory(
  history: ScoringHistoryEntry[],
): UndoCheckpoint[] {
  return history.map(({ state, throwers }) => ({
    currentLeg: state.currentLeg,
    activeParticipantId: state.activeParticipantId,
    firstParticipantId: state.firstParticipantId,
    firstThrowMode: state.firstThrowMode,
    turnCount: state.turns.length,
    legResultCount: state.legResults.length,
    throwers,
    participants: state.participants.map(
      ({ participantId, remaining, legsWon }) => ({
        participantId,
        remaining,
        legsWon,
      }),
    ),
  }));
}

export function unpackUndoHistory(
  state: ScoringState,
  checkpoints: UndoCheckpoint[] = [],
): ScoringHistoryEntry[] {
  const ids = state.participants.map((p) => p.participantId);
  if (!Array.isArray(checkpoints)) return [];
  return checkpoints
    .filter(
      (c) =>
        c &&
        Number.isInteger(c.turnCount) &&
        c.turnCount >= 0 &&
        c.turnCount <= state.turns.length &&
        Number.isInteger(c.legResultCount) &&
        c.legResultCount >= 0 &&
        c.legResultCount <= state.legResults.length &&
        Number.isInteger(c.currentLeg) &&
        c.currentLeg > 0 &&
        c.currentLeg <= state.legRules.length &&
        ids.includes(c.activeParticipantId) &&
        ids.includes(c.firstParticipantId) &&
        ["alternate", "winner", "loser", "fixed"].includes(c.firstThrowMode) &&
        c.participants?.length === 2 &&
        c.participants.every(
          (p, i) =>
            p.participantId === ids[i] &&
            Number.isInteger(p.remaining) &&
            p.remaining >= 0 &&
            Number.isInteger(p.legsWon) &&
            p.legsWon >= 0,
        ),
    )
    .map((c) => {
      const turns = state.turns.slice(0, c.turnCount);
      return {
        throwers: c.throwers || {},
        state: {
          ...state,
          currentLeg: c.currentLeg,
          activeParticipantId: c.activeParticipantId,
          firstParticipantId: c.firstParticipantId,
          firstThrowMode: c.firstThrowMode,
          winnerParticipantId: null,
          turns,
          legResults: state.legResults.slice(0, c.legResultCount),
          participants: c.participants.map((p) => ({
            ...p,
            turns: turns.filter(
              (turn) => turn.participantId === p.participantId,
            ),
          })) as ScoringState["participants"],
        },
      };
    });
}
