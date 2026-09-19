import type { ManualMatchStats } from "@/lib/darts/soft-stats";
import type { MatchFinishMode } from "@/types/domain";

export type SoftLegEntry = {
  legNumber: number;
  winnerParticipantId: string;
  scoreA?: number;
  scoreB?: number;
  userStats: Record<string, ManualMatchStats>;
};

export function correctSoftLeg(
  entries: SoftLegEntry[],
  replacement: SoftLegEntry,
  participantAId: string,
  participantBId: string,
  totalLegs: number,
  mode: MatchFinishMode,
) {
  if (!entries.some((entry) => entry.legNumber === replacement.legNumber))
    throw new Error("该局尚未记录。");
  if (
    ![participantAId, participantBId].includes(replacement.winnerParticipantId)
  )
    throw new Error("请选择本局胜方。");
  const next = entries.map((entry) =>
    entry.legNumber === replacement.legNumber ? replacement : entry,
  );
  let scoreA = 0,
    scoreB = 0;
  for (let index = 0; index < next.length; index++) {
    if (next[index].winnerParticipantId === participantAId) scoreA++;
    else scoreB++;
    if (
      mode === "majority" &&
      Math.max(scoreA, scoreB) >= Math.floor(totalLegs / 2) + 1 &&
      index < next.length - 1
    ) {
      throw new Error(
        "修改后比赛会提前结束，与后续已录局数冲突。请先核对后续局次，数据未改动。",
      );
    }
  }
  const finished =
    mode === "majority"
      ? Math.max(scoreA, scoreB) >= Math.floor(totalLegs / 2) + 1
      : next.length >= totalLegs && scoreA !== scoreB;
  return {
    entries: next,
    scoreA,
    scoreB,
    winnerParticipantId: finished
      ? scoreA > scoreB
        ? participantAId
        : participantBId
      : null,
  };
}
