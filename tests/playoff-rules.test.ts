import { describe, expect, it } from "vitest";
import { canEditPlayoffRules, readPlayoffRules } from "@/lib/darts/playoff-rules";

function softRound() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    dart_mode: "soft", leg_count: "3", match_finish_mode: "play_all", first_throw_mode: "winner",
    participant_mode_1: "singles", game_variant_1: "soft_cricket",
    participant_mode_2: "doubles", game_variant_2: "snow_501",
    participant_mode_3: "singles", game_variant_3: "soft_701"
  })) form.set(key, value);
  return form;
}

describe("playoff round rules", () => {
  it("creates a standalone scorer snapshot with ordered, mixed soft-dart games", () => {
    expect(readPlayoffRules(softRound(), 2)).toEqual({
      dart_mode: "soft",
      game_variant: "soft_cricket",
      match_finish_mode: "play_all",
      first_throw_mode: "winner",
      leg_rules: [
        { legNumber: 1, participantMode: "singles", dartMode: "soft", gameVariant: "soft_cricket" },
        { legNumber: 2, participantMode: "doubles", dartMode: "soft", gameVariant: "snow_501" },
        { legNumber: 3, participantMode: "singles", dartMode: "soft", gameVariant: "soft_701" }
      ]
    });
  });

  it("rejects even counts, incompatible variants and illegal participant modes", () => {
    const form = softRound();
    form.set("leg_count", "2");
    expect(() => readPlayoffRules(form, 2)).toThrow();
    form.set("leg_count", "3");
    expect(() => readPlayoffRules(form, 1)).toThrow("单人赛事");
    form.set("participant_mode_2", "singles");
    expect(() => readPlayoffRules(form, 2)).toThrow("仅限双人局");
    form.set("dart_mode", "steel");
    expect(() => readPlayoffRules(form, 2)).toThrow("硬镖赛制");
  });

  it("allows untouched bracket slots while protecting drafts, lineups and completed games", () => {
    expect(canEditPlayoffRules({ status: "not_started", details: { tempId: "P-R4-M1" } })).toBe(true);
    for (const key of ["lineupSubmissions", "lineup_submissions", "scoringDraft", "softScoringDraft", "legResults"]) {
      expect(canEditPlayoffRules({ status: "not_started", details: { [key]: {} } })).toBe(false);
    }
    expect(canEditPlayoffRules({ status: "completed" })).toBe(false);
  });
});
