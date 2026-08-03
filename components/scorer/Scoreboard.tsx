"use client";

import { completeScoredMatchAction } from "@/lib/actions/matches";
import {
  TouchScoreboard,
  type ScoringCompletePayload
} from "@/components/scorer/TouchScoreboard";
import type { FirstThrowMode, MatchFinishMode, MatchLegRule } from "@/types/domain";

type ParticipantInfo = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  members?: Array<{ userId: string; name: string; avatarUrl?: string | null }>;
};

export function Scoreboard({
  matchId,
  participantA,
  participantB,
  startingScore,
  bestOf,
  legRules,
  matchFinishMode,
  firstThrowMode
}: {
  matchId: string;
  participantA: ParticipantInfo;
  participantB: ParticipantInfo;
  startingScore: 301 | 501 | 701;
  bestOf: 3 | 5 | 7;
  legRules: MatchLegRule[];
  matchFinishMode: MatchFinishMode;
  firstThrowMode?: FirstThrowMode | null;
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
      legLineups: payload.legLineups
    });
  }

  return (
    <TouchScoreboard
      participantA={participantA}
      participantB={participantB}
      startingScore={startingScore}
      bestOf={bestOf}
      legRules={legRules}
      matchFinishMode={matchFinishMode}
      initialFirstThrowMode={firstThrowMode}
      saveLabel="上传结果"
      successMessage="比赛结果已上传，并写入赛事数据和普通数据。"
      onComplete={saveOfficialResult}
    />
  );
}
