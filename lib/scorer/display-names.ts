export function compactPlayerName(value?: string | null) {
  return String(value || "")
    .replace(/\s*(?:\/|\u00b7)\s*UID\s+[A-Za-z0-9-]+$/i, "")
    .trim();
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
