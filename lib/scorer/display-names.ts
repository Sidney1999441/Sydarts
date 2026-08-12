export function compactPlayerName(value?: string | null) {
  return String(value || "")
    .replace(/\s*(?:\/|\u00b7)\s*UID\s+[A-Za-z0-9-]+$/i, "")
    .trim();
}

export function isOpaqueIdentifier(value?: string | null) {
  const text = String(value || "").trim();
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ||
    /^[A-Za-z0-9_-]{20,}$/.test(text)
  );
}

export function formatUserDisplayName({
  userId,
  displayName,
  uid,
  fallback,
  includeUid = true
}: {
  userId?: string | null;
  displayName?: string | null;
  uid?: string | null;
  fallback?: string | null;
  includeUid?: boolean;
}) {
  const compactName = compactPlayerName(displayName || fallback);
  if (compactName && !isOpaqueIdentifier(compactName)) {
    return `${compactName}${includeUid && uid ? ` / UID ${uid}` : ""}`;
  }
  if (uid) return `UID ${uid}`;
  if (userId) return `选手 ${userId.slice(0, 6)}`;
  return "未命名选手";
}

export function normalizeNameForCompare(value?: string | null) {
  return compactPlayerName(value)
    .toLocaleLowerCase()
    .replace(/\s+/g, "")
    .replace(/[\u00b7/|\uff5c,\uff0c:\uff1a-]/g, "");
}

export function nameAlreadyContainsMember(participantName: string, memberName?: string | null) {
  const participant = normalizeNameForCompare(participantName);
  const member = normalizeNameForCompare(memberName);
  return Boolean(participant && member && (participant === member || participant.includes(member)));
}

export function composeParticipantMemberName(participantName: string, memberName?: string | null) {
  const compactMember = compactPlayerName(memberName);
  if (!compactMember || nameAlreadyContainsMember(participantName, compactMember)) return participantName;
  return `${participantName} \u00b7 ${compactMember}`;
}
