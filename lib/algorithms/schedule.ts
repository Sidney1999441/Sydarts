import type { GeneratedMatch, MatchDartMode, ParticipantSeed } from "@/types/domain";

export type GeneratedMatchWithDartMode = GeneratedMatch & {
  forceDartMode?: MatchDartMode;
};

function nextPowerOfTwo(value: number) {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

export function generateRoundRobinMatches(
  members: ParticipantSeed[],
  options: { groupName?: string } = {}
) {
  const entries: Array<ParticipantSeed | null> =
    members.length % 2 === 0 ? [...members] : [...members, null];
  const rounds = entries.length - 1;
  const matches: GeneratedMatch[] = [];
  let matchCounter = 1;

  for (let round = 1; round <= rounds; round += 1) {
    for (let index = 0; index < entries.length / 2; index += 1) {
      const a = entries[index];
      const b = entries[entries.length - 1 - index];
      if (a && b) {
        matches.push({
          tempId: `${options.groupName || "G"}-R${round}-M${matchCounter}`,
          groupName: options.groupName,
          stage: "group",
          roundNumber: round,
          matchNumber: matchCounter,
          participantAId: a.id,
          participantBId: b.id,
          status: "not_started"
        });
        matchCounter += 1;
      }
    }

    const fixed = entries[0];
    const rotated = [fixed, entries[entries.length - 1], ...entries.slice(1, -1)];
    entries.splice(0, entries.length, ...rotated);
  }

  return matches;
}

export function expandMixedDartRoundRobinMatches(
  matches: GeneratedMatch[],
  options: { firstDartMode?: MatchDartMode | string | null } = {}
): GeneratedMatchWithDartMode[] {
  const firstMode: MatchDartMode = options.firstDartMode === "steel" ? "steel" : "soft";
  const order: MatchDartMode[] = [firstMode, firstMode === "soft" ? "steel" : "soft"];

  return matches.flatMap((match) =>
    order.map((forceDartMode, modeIndex) => ({
      ...match,
      forceDartMode,
      roundNumber: (match.roundNumber - 1) * 2 + modeIndex + 1,
      matchNumber: (match.matchNumber - 1) * 2 + modeIndex + 1
    }))
  );
}

export function generateSingleEliminationBracket(participants: ParticipantSeed[]) {
  const bracketSize = nextPowerOfTwo(Math.max(2, participants.length));
  const slots: Array<ParticipantSeed | null> = [];
  const byeCount = bracketSize - participants.length;
  const firstRoundMatchCount = bracketSize / 2;
  let participantIndex = 0;
  let byesPlaced = 0;

  for (let matchIndex = 0; matchIndex < firstRoundMatchCount; matchIndex += 1) {
    const participant = participants[participantIndex++] || null;
    slots.push(participant);
    if (byesPlaced < byeCount) {
      slots.push(null);
      byesPlaced += 1;
    } else {
      slots.push(participants[participantIndex++] || null);
    }
  }

  const totalRounds = Math.log2(bracketSize);
  const matches: GeneratedMatch[] = [];
  let previousRoundIds: string[] = [];

  for (let round = 1; round <= totalRounds; round += 1) {
    const matchesInRound = bracketSize / Math.pow(2, round);
    const currentRoundIds: string[] = [];

    for (let matchIndex = 0; matchIndex < matchesInRound; matchIndex += 1) {
      const tempId = `K-R${round}-M${matchIndex + 1}`;
      currentRoundIds.push(tempId);

      const isFirstRound = round === 1;
      const participantA = isFirstRound ? slots[matchIndex * 2] : null;
      const participantB = isFirstRound ? slots[matchIndex * 2 + 1] : null;
      const hasBye = isFirstRound && Boolean(participantA) !== Boolean(participantB);

      matches.push({
        tempId,
        stage: "knockout",
        roundNumber: round,
        matchNumber: matchIndex + 1,
        participantAId: participantA?.id || null,
        participantBId: participantB?.id || null,
        status: hasBye ? "bye" : "not_started"
      });
    }

    previousRoundIds.forEach((previousId, index) => {
      const previous = matches.find((match) => match.tempId === previousId);
      if (previous) {
        previous.nextMatchTempId = currentRoundIds[Math.floor(index / 2)];
        previous.nextMatchSlot = index % 2 === 0 ? "A" : "B";
      }
    });

    previousRoundIds = currentRoundIds;
  }

  return matches;
}
