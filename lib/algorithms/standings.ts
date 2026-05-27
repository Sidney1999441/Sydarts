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

  matches
    .filter((match) => match.status === "completed" && match.winner_participant_id)
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

  return [...rows.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.wins - a.wins ||
      b.legDiff - a.legDiff ||
      b.legsWon - a.legsWon ||
      a.name.localeCompare(b.name)
  );
}
