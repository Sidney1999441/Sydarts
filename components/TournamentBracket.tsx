import { GitBranch, Trophy } from "lucide-react";
import { updateKnockoutMatchPairingAction } from "@/lib/actions/tournaments";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { PlayerIdentity } from "@/components/ui/PlayerIdentity";
import type { MatchStatus } from "@/types/domain";

type BracketParticipant = {
  id: string;
  display_name: string;
  avatar_url?: string | null;
};

type BracketMatch = {
  id: string;
  round_number: number;
  match_number: number;
  participant_a_id: string | null;
  participant_b_id: string | null;
  winner_participant_id: string | null;
  status: MatchStatus | string;
  score_a: number;
  score_b: number;
  details?: Record<string, unknown> | null;
};

type ManualEditConfig = {
  tournamentId: string;
  participants: BracketParticipant[];
};

const statusLabels: Record<string, string> = {
  not_started: "未开始",
  in_progress: "计分中",
  pending_confirmation: "待确认",
  disputed: "争议",
  completed: "已完成",
  bye: "轮空"
};

function roundLabel(roundNumber: number, maxRound: number, matches: BracketMatch[]) {
  const customLabel = matches.find((match) => typeof match.details?.playoffRoundLabel === "string")
    ?.details?.playoffRoundLabel;
  if (typeof customLabel === "string") return customLabel;
  if (roundNumber === maxRound) return "决赛";
  if (roundNumber === maxRound - 1) return "半决赛";
  if (roundNumber === maxRound - 2) return "四分之一决赛";
  return `第 ${roundNumber} 轮`;
}

function slotLabel(match: BracketMatch, slot: "A" | "B") {
  const key = slot === "A" ? "slotALabel" : "slotBLabel";
  const value = match.details?.[key];
  return typeof value === "string" ? value : "待定";
}

function scoreLabel(match: BracketMatch, side: "A" | "B") {
  if (match.status === "not_started" || match.status === "in_progress") return "-";
  return side === "A" ? match.score_a : match.score_b;
}

function ParticipantLine({
  match,
  participant,
  placeholder,
  side
}: {
  match: BracketMatch;
  participant?: BracketParticipant;
  placeholder: string;
  side: "A" | "B";
}) {
  const participantId = side === "A" ? match.participant_a_id : match.participant_b_id;
  const isWinner = Boolean(participantId && match.winner_participant_id === participantId);

  return (
    <div
      className={cn(
        "grid min-h-11 grid-cols-[1fr_auto] items-center gap-3 rounded-md border px-3 py-2 text-sm",
        isWinner ? "border-board bg-board text-white" : "border-wire bg-field text-ink"
      )}
    >
      <PlayerIdentity
        name={participant?.display_name || placeholder}
        avatarUrl={participant?.avatar_url}
        size="xs"
        compact
        className={isWinner ? "[&_*]:text-white" : ""}
      />
      <span className={cn("text-base font-black", isWinner ? "text-white" : "text-board")}>
        {scoreLabel(match, side)}
      </span>
    </div>
  );
}

export function TournamentBracket({
  matches,
  participants,
  title = "淘汰赛对阵",
  manualEdit
}: {
  matches: BracketMatch[];
  participants: BracketParticipant[];
  title?: string;
  manualEdit?: ManualEditConfig;
}) {
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const rounds = [...new Set(matches.map((match) => match.round_number))]
    .sort((a, b) => a - b)
    .map((roundNumber) => ({
      roundNumber,
      matches: matches
        .filter((match) => match.round_number === roundNumber)
        .sort((a, b) => a.match_number - b.match_number)
    }));
  const maxRound = Math.max(...rounds.map((round) => round.roundNumber), 1);

  if (matches.length === 0) {
    return <p className="text-sm text-muted">暂未生成淘汰赛对阵。</p>;
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-board text-white">
            <GitBranch className="h-5 w-5" aria-hidden />
          </span>
          <h2 className="text-lg font-black">{title}</h2>
        </div>
        <div className="text-xs font-bold text-muted">
          {matches.length} 场 / {rounds.length} 轮
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div
          className="grid min-w-[900px] auto-cols-[minmax(16rem,1fr)] grid-flow-col gap-4"
          style={{ gridTemplateColumns: `repeat(${rounds.length}, minmax(16rem, 1fr))` }}
        >
          {rounds.map((round, roundIndex) => (
            <section key={round.roundNumber} className="grid content-start gap-3">
              <div className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-black text-white">
                {roundLabel(round.roundNumber, maxRound, round.matches)}
              </div>
              <div className="grid gap-4">
                {round.matches.map((match) => (
                  <article key={match.id} className="relative">
                    {roundIndex > 0 ? (
                      <span className="absolute -left-4 top-1/2 h-px w-4 bg-board/40" aria-hidden />
                    ) : null}
                    {roundIndex < rounds.length - 1 ? (
                      <span className="absolute -right-4 top-1/2 h-px w-4 bg-board/40" aria-hidden />
                    ) : null}
                    <div className="grid gap-2 rounded-lg border border-wire bg-surface p-3 shadow-[0_12px_28px_rgb(17_24_39/0.06)]">
                      <div className="flex items-center justify-between gap-2 text-xs font-black text-muted">
                        <span>R{match.round_number} M{match.match_number}</span>
                        <span className="rounded-full bg-field px-2 py-1">
                          {statusLabels[match.status] || match.status}
                        </span>
                      </div>
                      <ParticipantLine
                        match={match}
                        participant={match.participant_a_id ? participantById.get(match.participant_a_id) : undefined}
                        placeholder={slotLabel(match, "A")}
                        side="A"
                      />
                      <ParticipantLine
                        match={match}
                        participant={match.participant_b_id ? participantById.get(match.participant_b_id) : undefined}
                        placeholder={slotLabel(match, "B")}
                        side="B"
                      />
                      {match.winner_participant_id ? (
                        <div className="flex items-center gap-1 text-xs font-bold text-board">
                          <Trophy className="h-3.5 w-3.5" aria-hidden />
                          胜者：{participantById.get(match.winner_participant_id)?.display_name || "待定"}
                        </div>
                      ) : null}
                      {manualEdit ? (
                        <details className="rounded-md border border-wire bg-field p-2">
                          <summary className="cursor-pointer text-xs font-black text-board">手动调整对阵</summary>
                          <form action={updateKnockoutMatchPairingAction} className="mt-2 grid gap-2">
                            <input type="hidden" name="tournament_id" value={manualEdit.tournamentId} />
                            <input type="hidden" name="match_id" value={match.id} />
                            <select className="form-input bg-white" name="participant_a_id" defaultValue={match.participant_a_id || ""}>
                              <option value="">A 方待定</option>
                              {manualEdit.participants.map((participant) => (
                                <option key={participant.id} value={participant.id}>
                                  {participant.display_name}
                                </option>
                              ))}
                            </select>
                            <select className="form-input bg-white" name="participant_b_id" defaultValue={match.participant_b_id || ""}>
                              <option value="">B 方待定</option>
                              {manualEdit.participants.map((participant) => (
                                <option key={participant.id} value={participant.id}>
                                  {participant.display_name}
                                </option>
                              ))}
                            </select>
                            <Button type="submit" variant="secondary">保存对阵</Button>
                          </form>
                        </details>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
