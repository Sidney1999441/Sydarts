import { describe, expect, it } from "vitest";
import {
  comparePersonalBest,
  shouldReplacePersonalBest
} from "@/lib/tournaments/personal-ranking";

describe("personal leaderboard source ranking", () => {
  it("prefers a singles result when the value is tied", () => {
    expect(shouldReplacePersonalBest({
      currentValue: 60,
      currentMode: "doubles",
      nextValue: 60,
      nextMode: "singles"
    })).toBe(true);
  });

  it("keeps the higher value regardless of participant mode", () => {
    expect(shouldReplacePersonalBest({
      currentValue: 60,
      currentMode: "singles",
      nextValue: 61,
      nextMode: "doubles"
    })).toBe(true);
  });

  it("sorts tied singles results above doubles results", () => {
    const rows = [
      { name: "double", value: 60, mode: "doubles" as const },
      { name: "single", value: 60, mode: "singles" as const }
    ];
    rows.sort((first, second) => comparePersonalBest(first.value, first.mode, second.value, second.mode));
    expect(rows.map((row) => row.name)).toEqual(["single", "double"]);
  });
});
