const RESULT_SUBMISSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isResultSubmissionId(value: unknown): value is string {
  return typeof value === "string" && RESULT_SUBMISSION_ID_PATTERN.test(value);
}

export function getResultSubmissionId(details: unknown) {
  if (!details || typeof details !== "object") return null;
  const submissionId = (details as { submissionId?: unknown }).submissionId;
  return isResultSubmissionId(submissionId) ? submissionId : null;
}

export function hasSameResultSubmission(details: unknown, submissionId?: string | null) {
  return isResultSubmissionId(submissionId) && getResultSubmissionId(details) === submissionId;
}

export function createResultSubmissionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join("")
  ].join("-");
}
