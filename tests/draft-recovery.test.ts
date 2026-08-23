import { describe, expect, it } from "vitest";
import { getSoftDraftStorageKey, pickLatestDraft } from "@/lib/scorer/draft-recovery";

describe("scoring draft recovery", () => {
  it("uses the newer local snapshot after a network interruption", () => {
    const server = { savedAt: "2026-08-19T05:00:00.000Z", scoreA: 1 };
    const local = { savedAt: "2026-08-19T05:00:05.000Z", scoreA: 2 };
    expect(pickLatestDraft(server, local)).toBe(local);
  });

  it("keeps a newer server snapshot when another device saved later", () => {
    const server = { savedAt: "2026-08-19T05:00:10.000Z", scoreA: 2 };
    const local = { savedAt: "2026-08-19T05:00:05.000Z", scoreA: 1 };
    expect(pickLatestDraft(server, local)).toBe(server);
  });

  it("scopes local drafts to one official match", () => {
    expect(getSoftDraftStorageKey("match-a")).toBe("codl:soft-scoring-draft:match-a");
  });
});
