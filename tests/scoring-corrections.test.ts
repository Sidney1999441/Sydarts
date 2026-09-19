import { describe, expect, it } from "vitest";
import { applyTurn, createScoringState } from "@/lib/algorithms/scoring";
import {
  correctSoftLeg,
  type SoftLegEntry,
} from "@/lib/scorer/soft-leg-correction";
import { packUndoHistory, unpackUndoHistory } from "@/lib/scorer/undo-history";

const entries: SoftLegEntry[] = [
  {
    legNumber: 1,
    winnerParticipantId: "a",
    userStats: { u: { averageScore: 60 } },
  },
  {
    legNumber: 2,
    winnerParticipantId: "b",
    scoreA: 200,
    scoreB: 300,
    userStats: { v: { averageScore: 90 } },
  },
];
describe("previous soft leg corrections", () => {
  it("corrects the first leg after another leg without losing later data", () => {
    const result = correctSoftLeg(
      entries,
      {
        ...entries[0],
        winnerParticipantId: "b",
        userStats: { u: { averageScore: 75 } },
      },
      "a",
      "b",
      5,
      "majority",
    );
    expect(result.scoreA).toBe(0);
    expect(result.scoreB).toBe(2);
    expect(result.entries[1]).toEqual(entries[1]);
    expect(entries[0].userStats.u.averageScore).toBe(60);
    expect(result.winnerParticipantId).toBeNull();
  });
  it("recomputes the winner when a correction reaches the winning threshold", () => {
    expect(
      correctSoftLeg(
        entries,
        { ...entries[0], winnerParticipantId: "b" },
        "a",
        "b",
        3,
        "majority",
      ).winnerParticipantId,
    ).toBe("b");
  });
  it("rejects an impossible earlier finish without deleting recorded legs", () => {
    const three = [...entries, { ...entries[0], legNumber: 3 }];
    expect(() =>
      correctSoftLeg(
        three,
        { ...entries[0], winnerParticipantId: "b" },
        "a",
        "b",
        3,
        "majority",
      ),
    ).toThrow("后续");
    expect(three).toHaveLength(3);
  });
  it("allows complete play-all results and rejects unknown legs or winners", () => {
    expect(
      correctSoftLeg(entries, entries[0], "a", "b", 5, "play_all").entries,
    ).toHaveLength(2);
    expect(() =>
      correctSoftLeg(
        entries,
        { ...entries[0], legNumber: 9 },
        "a",
        "b",
        5,
        "play_all",
      ),
    ).toThrow();
    expect(() =>
      correctSoftLeg(
        entries,
        { ...entries[0], winnerParticipantId: "x" },
        "a",
        "b",
        5,
        "play_all",
      ),
    ).toThrow();
  });
});
describe("steel undo after draft recovery", () => {
  it("restores every previous turn with its thrower and score", () => {
    let state = createScoringState({
      participantAId: "a",
      participantBId: "b",
      startingScore: 501,
      bestOf: 3,
    });
    const history = [];
    for (const score of [180, 100, 140, 60]) {
      history.push({ state, throwers: { a: "u", b: "v" } });
      state = applyTurn(state, score, 3);
    }
    const packed = JSON.parse(JSON.stringify(packUndoHistory(history)));
    expect(unpackUndoHistory(state, packed)).toEqual(history);
    expect(unpackUndoHistory(state, [])).toEqual([]);
  });
  it("restores undo across a completed leg and first throw changes", () => {
    let state = createScoringState({
      participantAId: "a",
      participantBId: "b",
      startingScore: 301,
      bestOf: 3,
    });
    const history = [];
    for (const score of [180, 100, 121, 20]) {
      history.push({ state, throwers: {} });
      state = applyTurn(state, score, 3);
    }
    expect(unpackUndoHistory(state, packUndoHistory(history))).toEqual(history);
  });
  it("ignores corrupt checkpoints instead of overwriting current progress", () => {
    const state = createScoringState({
      participantAId: "a",
      participantBId: "b",
      startingScore: 501,
      bestOf: 3,
    });
    const [checkpoint] = packUndoHistory([{ state, throwers: {} }]);
    expect(
      unpackUndoHistory(state, [{ ...checkpoint, turnCount: 99 }]),
    ).toEqual([]);
  });
});
