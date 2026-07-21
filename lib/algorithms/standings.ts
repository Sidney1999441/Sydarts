import type { MatchSummary, ParticipantSeed } from "@/types/domain";

export type StandingRow = {
  participantId: string;
  name: string;
  played: number;
  wins: number;
  losses: number;
  legsWon: number;
  legsLost: number;
  legDiff: number;
  points: number;
};

export function updateTournamentStandings(
  participants: ParticipantSeed[],
  matches: MatchSummary[]
) {
  const rows = new Map<string, StandingRow>();
  participants.forEach((participant) => {
    rows.set(participant.id, {
      participantId: participant.id,
      name: participant.name,
      played: 0,
      wins: 0,
      losses: 0,
      legsWon: 0,
      legsLost: 0,
      legDiff: 0,
      points: 0
    });
  });

  const completedMatches = matches.filter((match) => match.status === "completed" && match.winner_participant_id);

  completedMatches
    .forEach((match) => {
      if (!match.participant_a_id || !match.participant_b_id) return;
      const rowA = rows.get(match.participant_a_id);
      const rowB = rows.get(match.participant_b_id);
      if (!rowA || !rowB) return;

      rowA.played += 1;
      rowB.played += 1;
      rowA.legsWon += match.score_a;
      rowA.legsLost += match.score_b;
      rowB.legsWon += match.score_b;
      rowB.legsLost += match.score_a;

      if (match.winner_participant_id === match.participant_a_id) {
        rowA.wins += 1;
        rowA.points += 3;
        rowB.losses += 1;
      } else {
        rowB.wins += 1;
        rowB.points += 3;
        rowA.losses += 1;
      }

      rowA.legDiff = rowA.legsWon - rowA.legsLost;
      rowB.legDiff = rowB.legsWon - rowB.legsLost;
    });

  const getHeadToHead = (participantAId: string, participantBId: string) => {
    let pointsA = 0;
    let pointsB = 0;
    let legsWonA = 0;
    let legsLostA = 0;
    let legsWonB = 0;
    let legsLostB = 0;

    completedMatches.forEach((match) => {
      if (!match.participant_a_id || !match.participant_b_id || !match.winner_participant_id) return;
      const isAFirst = match.participant_a_id === participantAId && match.participant_b_id === participantBId;
      const isBFirst = match.participant_a_id === participantBId && match.participant_b_id === participantAId;
      if (!isAFirst && !isBFirst) return;

      const participantAScore = isAFirst ? match.score_a : match.score_b;
      const participantBScore = isAFirst ? match.score_b : match.score_a;
      legsWonA += participantAScore;
      legsLostA += participantBScore;
      legsWonB += participantBScore;
      legsLostB += participantAScore;

      if (match.winner_participant_id === participantAId) {
        pointsA += 3;
      } else if (match.winner_participant_id === participantBId) {
        pointsB += 3;
      }
    });

    return {
      pointsA,
      pointsB,
      legDiffA: legsWonA - legsLostA,
      legDiffB: legsWonB - legsLostB
    };
  };

  return [...rows.values()].sort(
    (a, b) => {
      const headToHead = getHeadToHead(a.participantId, b.participantId);
      return (
        b.points - a.points ||
        b.legDiff - a.legDiff ||
        headToHead.pointsB - headToHead.pointsA ||
        headToHead.legDiffB - headToHead.legDiffA ||
        b.wins - a.wins ||
        a.name.localeCompare(b.name)
      );
    }
  );
}
