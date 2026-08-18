import type { LegParticipantMode } from "@/types/domain";

export type PersonalStatSourceMode = LegParticipantMode | null;

export function getPersonalStatSourcePriority(mode: PersonalStatSourceMode) {
  if (mode === "singles") return 0;
  if (mode === "doubles") return 1;
  if (mode === "team") return 2;
  return 3;
}

export function shouldReplacePersonalBest({
  currentValue,
  currentMode,
  nextValue,
  nextMode
}: {
  currentValue: number;
  currentMode: PersonalStatSourceMode;
  nextValue: number;
  nextMode: PersonalStatSourceMode;
}) {
  if (nextValue <= 0) return false;
  if (nextValue !== currentValue) return nextValue > currentValue;
  return getPersonalStatSourcePriority(nextMode) < getPersonalStatSourcePriority(currentMode);
}

export function comparePersonalBest(
  firstValue: number,
  firstMode: PersonalStatSourceMode,
  secondValue: number,
  secondMode: PersonalStatSourceMode
) {
  return secondValue - firstValue
    || getPersonalStatSourcePriority(firstMode) - getPersonalStatSourcePriority(secondMode);
}
