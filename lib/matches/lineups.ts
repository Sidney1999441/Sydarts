import type { MatchLegLineup, MatchLegRule } from "@/types/domain";

export type MatchLineupSubmission = {
  participantId: string;
  playerIds: string[];
  legLineups: Array<{ legNumber: number; playerIds: string[] }>;
  submittedBy?: string | null;
  submittedAt?: string | null;
};

export type MatchLineupSubmissions = Record<string, MatchLineupSubmission>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function submittedLegLineups(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const legNumber = Number(item.legNumber || item.leg_number);
      const playerIds = stringArray(item.playerIds || item.player_ids);
      if (!Number.isInteger(legNumber) || legNumber < 1 || playerIds.length === 0) return null;
      return { legNumber, playerIds };
    })
    .filter(Boolean) as Array<{ legNumber: number; playerIds: string[] }>;
}

export function getMatchLineupSubmissions(details: unknown): MatchLineupSubmissions {
  if (!isRecord(details)) return {};
  const raw = details.lineupSubmissions || details.lineup_submissions;
  if (!isRecord(raw)) return {};

  return Object.fromEntries(
    Object.entries(raw)
      .map(([participantId, value]) => {
        if (!isRecord(value)) return null;
        const legLineups = submittedLegLineups(value.legLineups || value.leg_lineups);
        const playerIds = stringArray(value.playerIds || value.player_ids);
        if (playerIds.length === 0 && legLineups.length === 0) return null;
        return [
          participantId,
          {
            participantId: typeof value.participantId === "string" ? value.participantId : participantId,
            playerIds,
            legLineups,
            submittedBy: typeof value.submittedBy === "string" ? value.submittedBy : null,
            submittedAt: typeof value.submittedAt === "string" ? value.submittedAt : null
          }
        ] as const;
      })
      .filter(Boolean) as Array<readonly [string, MatchLineupSubmission]>
  );
}

export function mergeMatchLineupSubmission(
  details: unknown,
  participantId: string,
  submission: {
    legLineups: Array<{ legNumber: number; playerIds: string[] }>;
    submittedBy: string;
    submittedAt?: string;
  }
) {
  const base = isRecord(details) ? { ...details } : {};
  const submissions = getMatchLineupSubmissions(details);
  const playerIds = [...new Set(submission.legLineups.flatMap((lineup) => lineup.playerIds))];

  return {
    ...base,
    lineupSubmissions: {
      ...submissions,
      [participantId]: {
        participantId,
        playerIds,
        legLineups: submission.legLineups,
        submittedBy: submission.submittedBy,
        submittedAt: submission.submittedAt || new Date().toISOString()
      }
    }
  };
}

export function isParticipantLineupSubmitted(details: unknown, participantId?: string | null) {
  return Boolean(participantId && getMatchLineupSubmissions(details)[participantId]);
}

export function areBothMatchLineupsSubmitted(
  details: unknown,
  participantAId?: string | null,
  participantBId?: string | null
) {
  return (
    isParticipantLineupSubmitted(details, participantAId) &&
    isParticipantLineupSubmitted(details, participantBId)
  );
}

function orderedIds(submissionIds: string[], fallbackIds: string[]) {
  const allowed = new Set(fallbackIds);
  const submitted = submissionIds.filter((id) => allowed.has(id));
  return submitted.length > 0 ? submitted : fallbackIds;
}

function lineupIdsForRule(input: {
  rule: MatchLegRule;
  orderedUserIds: string[];
  singlesIndex: number;
  submittedUserIds?: string[];
}) {
  if (input.submittedUserIds && input.submittedUserIds.length > 0) {
    return input.submittedUserIds;
  }
  const ids = input.orderedUserIds;
  if (ids.length === 0) return [];
  if (input.rule.participantMode === "singles") {
    return [ids[input.singlesIndex % ids.length]];
  }
  if (input.rule.participantMode === "doubles") {
    return ids.slice(0, Math.min(2, ids.length));
  }
  return ids;
}

export function buildLineupsFromSubmissions(input: {
  details: unknown;
  legRules: MatchLegRule[];
  participantAId: string;
  participantBId: string;
  participantAUserIds: string[];
  participantBUserIds: string[];
}): MatchLegLineup[] {
  const submissions = getMatchLineupSubmissions(input.details);
  const participantAOrder = orderedIds(
    submissions[input.participantAId]?.playerIds || [],
    input.participantAUserIds
  );
  const participantBOrder = orderedIds(
    submissions[input.participantBId]?.playerIds || [],
    input.participantBUserIds
  );
  const participantALegLineupByNumber = new Map(
    (submissions[input.participantAId]?.legLineups || []).map((lineup) => [
      lineup.legNumber,
      orderedIds(lineup.playerIds, input.participantAUserIds)
    ])
  );
  const participantBLegLineupByNumber = new Map(
    (submissions[input.participantBId]?.legLineups || []).map((lineup) => [
      lineup.legNumber,
      orderedIds(lineup.playerIds, input.participantBUserIds)
    ])
  );
  let singlesIndex = 0;

  return input.legRules.map((rule) => {
    const currentSinglesIndex = singlesIndex;
    if (rule.participantMode === "singles") singlesIndex += 1;

    return {
      legNumber: rule.legNumber,
      participantAUserIds: lineupIdsForRule({
        rule,
        orderedUserIds: participantAOrder,
        singlesIndex: currentSinglesIndex,
        submittedUserIds: participantALegLineupByNumber.get(rule.legNumber)
      }),
      participantBUserIds: lineupIdsForRule({
        rule,
        orderedUserIds: participantBOrder,
        singlesIndex: currentSinglesIndex,
        submittedUserIds: participantBLegLineupByNumber.get(rule.legNumber)
      })
    };
  });
}
