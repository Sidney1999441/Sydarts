type TimestampedDraft = {
  savedAt?: string;
};

function savedAtValue(draft: TimestampedDraft | null | undefined) {
  if (!draft?.savedAt) return 0;
  const value = Date.parse(draft.savedAt);
  return Number.isFinite(value) ? value : 0;
}

export function pickLatestDraft<T extends TimestampedDraft>(
  serverDraft: T | null | undefined,
  localDraft: T | null | undefined
) {
  if (!serverDraft) return localDraft || null;
  if (!localDraft) return serverDraft;
  return savedAtValue(localDraft) > savedAtValue(serverDraft) ? localDraft : serverDraft;
}

export function getSoftDraftStorageKey(matchId: string) {
  return `codl:soft-scoring-draft:${matchId}`;
}
