import { describe, expect, it } from "vitest";
import {
  createResultSubmissionId,
  getResultSubmissionId,
  hasSameResultSubmission,
  isResultSubmissionId
} from "@/lib/results/submission";

const submissionId = "11111111-1111-4111-8111-111111111111";

describe("result submission helpers", () => {
  it("reads a valid submission id from result details", () => {
    expect(getResultSubmissionId({ submissionId })).toBe(submissionId);
    expect(hasSameResultSubmission({ submissionId }, submissionId)).toBe(true);
  });

  it("ignores missing or malformed submission ids", () => {
    expect(getResultSubmissionId(null)).toBeNull();
    expect(getResultSubmissionId({ submissionId: "not-a-uuid" })).toBeNull();
    expect(hasSameResultSubmission({ submissionId }, "not-a-uuid")).toBe(false);
  });

  it("creates unique uuid-shaped submission ids", () => {
    const first = createResultSubmissionId();
    const second = createResultSubmissionId();

    expect(isResultSubmissionId(first)).toBe(true);
    expect(isResultSubmissionId(second)).toBe(true);
    expect(second).not.toBe(first);
  });
});
