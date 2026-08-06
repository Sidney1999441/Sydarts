import { calculatePlayerLevel } from "@/lib/algorithms/player-level";

export type ParticipantStrength = {
  id: string;
  rating: number;
};

export type FirstThrowHandicapResult = {
  firstParticipantId: string | null;
  strongerParticipantId: string | null;
  weakerParticipantId: string | null;
  levelGap: number;
  threshold: number;
};

function ratingToLevel(rating: number) {
  return calculatePlayerLevel({ rating }).level;
}

export function resolveFirstThrowHandicap(input: {
  participantA: ParticipantStrength;
  participantB: ParticipantStrength;
  threshold?: number | null;
}): FirstThrowHandicapResult {
  const threshold = Math.max(0, Math.floor(Number(input.threshold ?? 10)));
  const levelA = ratingToLevel(input.participantA.rating);
  const levelB = ratingToLevel(input.participantB.rating);
  const levelGap = Math.abs(levelA - levelB);

  if (levelGap < threshold || levelA === levelB) {
    return {
      firstParticipantId: null,
      strongerParticipantId: null,
      weakerParticipantId: null,
      levelGap,
      threshold
    };
  }

  const weakerParticipantId = levelA < levelB ? input.participantA.id : input.participantB.id;
  const strongerParticipantId = levelA > levelB ? input.participantA.id : input.participantB.id;

  return {
    firstParticipantId: weakerParticipantId,
    strongerParticipantId,
    weakerParticipantId,
    levelGap,
    threshold
  };
}
