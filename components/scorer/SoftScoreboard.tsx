"use client";

import { completeScoredMatchAction } from "@/lib/actions/matches";
import { SoftMatchScoreboard } from "@/components/scorer/SoftMatchScoreboard";
import type { ScoringCompletePayload } from "@/components/scorer/TouchScoreboard";
import type { MatchFinishMode, MatchLegLineup, MatchLegRule } from "@/types/domain";

type ParticipantInfo = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  members?: Array<{ userId: string; name: string; avatarUrl?: string | null }>;
};

export function SoftScoreboard({
  matchId,
  participantA,
  participantB,
  legRules,
  matchFinishMode,
  initialLineups
}: {
  matchId: string;
  participantA: ParticipantInfo;
  participantB: ParticipantInfo;
  legRules: MatchLegRule[];
  matchFinishMode: MatchFinishMode;
  initialLineups?: MatchLegLineup[];
}) {
  async function saveOfficialResult(payload: ScoringCompletePayload) {
    await completeScoredMatchAction({
      matchId,
      submissionId: payload.submissionId,
      winnerParticipantId: payload.winnerParticipantId,
      scoreA: payload.scoreA,
      scoreB: payload.scoreB,
      turns: payload.turns,
      legResults: payload.legResults,
      legLineups: payload.legLineups,
      userStats: payload.userStats || {}
    });
  }

  return (
    <SoftMatchScoreboard
      participantA={participantA}
      participantB={participantB}
      legRules={legRules}
      matchFinishMode={matchFinishMode}
      initialLineups={initialLineups}
      saveLabel="上传结果"
      successMessage="软镖比赛结果已保存，并写入赛事与个人软镖数据。"
      onComplete={saveOfficialResult}
    />
  );
}
