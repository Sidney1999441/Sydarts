"use client";

import type { ReactNode } from "react";
import { useMemo, useRef, useState, useTransition } from "react";
import { BarChart3, Check, Eye, EyeOff, ListChecks, RotateCcw, Save, Trophy, Undo2 } from "lucide-react";
import {
  applyTurn,
  calculateDartStats,
  createScoringState,
  type ScoreTurn,
  type ScoringState
} from "@/lib/algorithms/scoring";
import { getLegRuleLabel, getLegStartingScore } from "@/lib/darts/variants";
import { createResultSubmissionId } from "@/lib/results/submission";
import { Button } from "@/components/ui/Button";
import type { MatchFinishMode, MatchLegLineup, MatchLegResult, MatchLegRule } from "@/types/domain";

type GameScore = 301 | 501 | 701;
type BestOf = 3 | 5 | 7;
type PlayerOption = { userId: string; name: string };
type ParticipantInfo = { id: string; name: string; members?: PlayerOption[] };
type ThrowerByParticipant = Record<string, string>;
type ScoringHistoryEntry = {
  state: ScoringState;
  throwers: ThrowerByParticipant;
};

export type ScoringCompletePayload = {
  submissionId: string;
  winnerParticipantId: string;
  scoreA: number;
  scoreB: number;
  turns: ScoreTurn[];
  legResults: MatchLegResult[];
  legLineups: MatchLegLineup[];
};

function defaultRules(startingScore: GameScore, bestOf: BestOf): MatchLegRule[] {
  return Array.from({ length: bestOf }, (_, index) => ({
    legNumber: index + 1,
    participantMode: "doubles",
    dartMode: "steel",
    gameVariant: String(startingScore) as "301" | "501" | "701"
  }));
}

function defaultLineups(rules: MatchLegRule[], participantA: ParticipantInfo, participantB: ParticipantInfo) {
  const allA = (participantA.members || []).map((member) => member.userId);
  const allB = (participantB.members || []).map((member) => member.userId);
  return rules.map((rule) => ({
    legNumber: rule.legNumber,
    participantAUserIds: rule.participantMode === "singles" ? allA.slice(0, 1) : allA,
    participantBUserIds: rule.participantMode === "singles" ? allB.slice(0, 1) : allB
  }));
}

function firstThrower(lineupUserIds: string[], members?: PlayerOption[]) {
  return lineupUserIds[0] || members?.[0]?.userId || "";
}

function defaultThrowers(
  lineups: MatchLegLineup[],
  participantA: ParticipantInfo,
  participantB: ParticipantInfo,
  legNumber = 1
): ThrowerByParticipant {
  const lineup = lineups.find((item) => item.legNumber === legNumber);
  return {
    [participantA.id]: firstThrower(lineup?.participantAUserIds || [], participantA.members),
    [participantB.id]: firstThrower(lineup?.participantBUserIds || [], participantB.members)
  };
}

export function TouchScoreboard({
  participantA,
  participantB,
  startingScore,
  bestOf,
  legRules,
  matchFinishMode = "majority",
  saveLabel,
  successMessage,
  onComplete
}: {
  participantA: ParticipantInfo;
  participantB: ParticipantInfo;
  startingScore: GameScore;
  bestOf: BestOf;
  legRules?: MatchLegRule[];
  matchFinishMode?: MatchFinishMode;
  saveLabel: string;
  successMessage: string;
  onComplete: (payload: ScoringCompletePayload) => Promise<void>;
}) {
  const rules = useMemo(
    () => (legRules && legRules.length > 0 ? legRules : defaultRules(startingScore, bestOf)),
    [bestOf, legRules, startingScore]
  );
  const initialLineups = useMemo(() => defaultLineups(rules, participantA, participantB), [rules, participantA, participantB]);
  const hasSinglesLeg = rules.some((rule) => rule.participantMode === "singles");
  const [lineups, setLineups] = useState<MatchLegLineup[]>(initialLineups);
  const [lineupConfirmed, setLineupConfirmed] = useState(!hasSinglesLeg);
  const [activeThrowerByParticipant, setActiveThrowerByParticipant] = useState<ThrowerByParticipant>(() =>
    defaultThrowers(initialLineups, participantA, participantB)
  );
  const [state, setState] = useState(() =>
    createScoringState({
      participantAId: participantA.id,
      participantBId: participantB.id,
      startingScore: getLegStartingScore(rules[0]) || startingScore,
      bestOf,
      legRules: rules,
      matchFinishMode,
      legLineups: initialLineups
    })
  );
  const [history, setHistory] = useState<ScoringHistoryEntry[]>([]);
  const [scoreInput, setScoreInput] = useState("");
  const [checkoutScore, setCheckoutScore] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [message, setMessage] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const submissionIdRef = useRef(createResultSubmissionId());

  const names = useMemo(
    () => ({
      [participantA.id]: participantA.name,
      [participantB.id]: participantB.name
    }),
    [participantA, participantB]
  );
  const memberNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of [...(participantA.members || []), ...(participantB.members || [])]) {
      map.set(member.userId, member.name);
    }
    return map;
  }, [participantA.members, participantB.members]);
  const activeParticipant = state.participants.find(
    (participant) => participant.participantId === state.activeParticipantId
  );
  const currentRule = state.legRules[state.currentLeg - 1] || state.legRules[0];
  const quickScores = [180, 140, 100, 85, 81, 60, 45, 41, 26, 0];

  function lineupUserIds(participantId: string, legNumber = state.currentLeg) {
    const lineup = lineups.find((item) => item.legNumber === legNumber);
    if (!lineup) return [];
    return participantId === participantA.id
      ? lineup.participantAUserIds || []
      : participantId === participantB.id
        ? lineup.participantBUserIds || []
        : [];
  }

  function currentThrowerUserId(participantId: string, legNumber = state.currentLeg) {
    const userIds = lineupUserIds(participantId, legNumber);
    const selected = activeThrowerByParticipant[participantId];
    if (selected && userIds.includes(selected)) return selected;
    return userIds[0] || "";
  }

  function rotateThrower(current: ThrowerByParticipant, participantId: string, legNumber = state.currentLeg) {
    const userIds = lineupUserIds(participantId, legNumber);
    if (userIds.length <= 1) return current;
    const selected = current[participantId];
    const selectedIndex = Math.max(0, userIds.indexOf(selected));
    return {
      ...current,
      [participantId]: userIds[(selectedIndex + 1) % userIds.length]
    };
  }

  function selectThrower(participantId: string, userId: string) {
    setActiveThrowerByParticipant((current) => ({
      ...current,
      [participantId]: userId
    }));
  }

  function displayName(participantId: string, legNumber = state.currentLeg) {
    const rule = state.legRules[legNumber - 1];
    const lineup = lineups.find((item) => item.legNumber === legNumber);
    if (rule?.participantMode !== "singles" || !lineup) return names[participantId];
    const userId = participantId === participantA.id
      ? lineup.participantAUserIds[0]
      : lineup.participantBUserIds[0];
    const playerName = userId ? memberNames.get(userId) : null;
    return playerName ? `${names[participantId]} · ${playerName}` : names[participantId];
  }

  function turnDisplayName(turn: ScoreTurn) {
    const playerName = turn.userId ? memberNames.get(turn.userId) : null;
    if (playerName) return `${names[turn.participantId]} · ${playerName}`;
    return displayName(turn.participantId, turn.legNumber);
  }

  function updateLineup(legNumber: number, side: "A" | "B", userId: string) {
    setLineups((current) =>
      current.map((lineup) =>
        lineup.legNumber === legNumber
          ? {
              ...lineup,
              participantAUserIds: side === "A" ? [userId] : lineup.participantAUserIds,
              participantBUserIds: side === "B" ? [userId] : lineup.participantBUserIds
            }
          : lineup
      )
    );
    selectThrower(side === "A" ? participantA.id : participantB.id, userId);
  }

  function confirmLineups() {
    const missingSingles = rules.some((rule) => {
      if (rule.participantMode !== "singles") return false;
      const lineup = lineups.find((item) => item.legNumber === rule.legNumber);
      return !lineup?.participantAUserIds[0] || !lineup?.participantBUserIds[0];
    });
    if (missingSingles) {
      setMessage("请先为所有单人局选择双方出场选手。");
      return;
    }
    setState(
      createScoringState({
        participantAId: participantA.id,
        participantBId: participantB.id,
        startingScore: getLegStartingScore(rules[0]) || startingScore,
        bestOf,
        legRules: rules,
        matchFinishMode,
        legLineups: lineups
      })
    );
    setLineupConfirmed(true);
    setActiveThrowerByParticipant(defaultThrowers(lineups, participantA, participantB));
    setMessage("");
    submissionIdRef.current = createResultSubmissionId();
  }

  function recordScore(value: number, darts = 3) {
    try {
      const participantId = state.activeParticipantId;
      const throwerUserId = currentThrowerUserId(participantId);
      const next = applyTurn(state, value, darts, throwerUserId || undefined);
      setHistory((current) => [...current, { state, throwers: activeThrowerByParticipant }]);
      setState(next);
      setActiveThrowerByParticipant((current) => rotateThrower(current, participantId, state.currentLeg));
      setScoreInput("");
      setCheckoutScore(null);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "请输入 0-180 的整数。");
    }
  }

  function requestScore(value: number) {
    if (!activeParticipant || state.winnerParticipantId) return;
    if (value === activeParticipant.remaining && value > 0) {
      setCheckoutScore(value);
      return;
    }
    recordScore(value, 3);
  }

  function appendDigit(digit: string) {
    if (state.winnerParticipantId) return;
    setScoreInput((current) => {
      const next = current === "0" ? digit : `${current}${digit}`;
      return next.length > 3 ? current : next;
    });
  }

  function confirmInput() {
    if (scoreInput.length === 0) return;
    requestScore(Number(scoreInput));
  }

  function undoLast() {
    const previous = history.at(-1);
    if (!previous) return;
    setState(previous.state);
    setActiveThrowerByParticipant(previous.throwers);
    setHistory((current) => current.slice(0, -1));
    setScoreInput("");
    setCheckoutScore(null);
    setMessage("");
    setIsSaved(false);
    submissionIdRef.current = createResultSubmissionId();
  }

  function resetMatch() {
    setState(
      createScoringState({
        participantAId: participantA.id,
        participantBId: participantB.id,
        startingScore: getLegStartingScore(rules[0]) || startingScore,
        bestOf,
        legRules: rules,
        matchFinishMode,
        legLineups: lineups
      })
    );
    setActiveThrowerByParticipant(defaultThrowers(lineups, participantA, participantB));
    setHistory([]);
    setScoreInput("");
    setCheckoutScore(null);
    setMessage("");
    setIsSaved(false);
    submissionIdRef.current = createResultSubmissionId();
  }

  function saveResult() {
    if (!state.winnerParticipantId || isSaved || isPending) return;
    startTransition(async () => {
      try {
        await onComplete({
          submissionId: submissionIdRef.current,
          winnerParticipantId: state.winnerParticipantId!,
          scoreA: state.participants[0].legsWon,
          scoreB: state.participants[1].legsWon,
          turns: state.turns,
          legResults: state.legResults,
          legLineups: lineups
        });
        setIsSaved(true);
        setMessage(successMessage);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "保存失败，请稍后重试。");
      }
    });
  }

  if (!lineupConfirmed) {
    return (
      <div className="grid gap-4 rounded-lg border border-wire bg-surface p-4 shadow-soft">
        <div>
          <h2 className="text-xl font-black">赛前出场名单</h2>
          <p className="mt-1 text-sm text-muted">单人局需要先选择双方出场选手，保存后会随本场成绩记录。</p>
        </div>
        <div className="grid gap-3">
          {rules.map((rule) => (
            <div key={rule.legNumber} className="grid gap-3 rounded-lg bg-field p-3 lg:grid-cols-[1fr_220px_220px] lg:items-end">
              <div>
                <div className="font-bold">{getLegRuleLabel(rule)}</div>
                <div className="mt-1 text-xs text-muted">
                  {rule.participantMode === "singles" ? "请选择本局单人出场选手" : "本局默认记录双方全部队员"}
                </div>
              </div>
              {rule.participantMode === "singles" ? (
                <>
                  <LineupSelect
                    label={participantA.name}
                    members={participantA.members || []}
                    value={lineups.find((item) => item.legNumber === rule.legNumber)?.participantAUserIds[0] || ""}
                    onChange={(userId) => updateLineup(rule.legNumber, "A", userId)}
                  />
                  <LineupSelect
                    label={participantB.name}
                    members={participantB.members || []}
                    value={lineups.find((item) => item.legNumber === rule.legNumber)?.participantBUserIds[0] || ""}
                    onChange={(userId) => updateLineup(rule.legNumber, "B", userId)}
                  />
                </>
              ) : null}
            </div>
          ))}
        </div>
        {message ? <p className="text-sm font-semibold text-red-600">{message}</p> : null}
        <div>
          <Button type="button" onClick={confirmLineups}>
            确认并开始计分
          </Button>
        </div>
      </div>
    );
  }

  if (state.winnerParticipantId) {
    return (
      <SettlementView
        state={state}
        names={names}
        participantA={participantA}
        participantB={participantB}
        saveLabel={saveLabel}
        message={message}
        isPending={isPending}
        isSaved={isSaved}
        onSave={saveResult}
        onReset={resetMatch}
        displayName={displayName}
        turnDisplayName={turnDisplayName}
      />
    );
  }

  const activeThrowerOptions = activeParticipant
    ? lineupUserIds(activeParticipant.participantId)
        .map((userId) => ({
          userId,
          name: memberNames.get(userId) || userId
        }))
    : [];
  const activeThrowerId = activeParticipant ? currentThrowerUserId(activeParticipant.participantId) : "";
  const activeThrowerName = activeThrowerId ? memberNames.get(activeThrowerId) : null;

  return (
    <div className="relative h-[calc(100dvh-14rem)] min-h-[500px] overflow-hidden rounded-lg lg:h-[calc(100dvh-7rem)] lg:min-h-[560px]">
      <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-2 lg:grid-cols-[0.9fr_1.1fr] lg:grid-rows-1">
        <section className="grid min-h-0 grid-cols-2 grid-rows-[1fr_auto] gap-2 lg:grid-cols-1 lg:grid-rows-[1fr_1fr_auto]">
          {state.participants.map((participant) => {
            const stats = calculateDartStats(participant.turns);
            const isActive = state.activeParticipantId === participant.participantId;
            return (
              <PlayerPanel
                key={participant.participantId}
                name={displayName(participant.participantId)}
                isActive={isActive}
                rule={currentRule}
                remaining={participant.remaining}
                legsWon={participant.legsWon}
                stats={stats}
              />
            );
          })}
          <div className="col-span-2 grid grid-cols-3 gap-2 lg:col-span-1">
            <SmallAction onClick={undoLast} disabled={history.length === 0}>
              <Undo2 className="h-4 w-4" aria-hidden />
              撤销
            </SmallAction>
            <SmallAction onClick={() => setShowDetails((value) => !value)}>
              {showDetails ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              详情
            </SmallAction>
            <SmallAction onClick={resetMatch}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              重开
            </SmallAction>
          </div>
        </section>

        <section className="grid min-h-0 grid-rows-[auto_auto_1fr_auto] gap-2 rounded-lg border border-wire bg-surface p-3 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-muted">本轮输入</div>
              <div className="text-4xl font-black leading-none text-ink">{scoreInput || "0"}</div>
              <div className="mt-1 text-xs font-semibold text-board">{getLegRuleLabel(currentRule)}</div>
            </div>
            <div className="text-right text-sm text-muted">
              <div className="font-bold text-ink">{activeParticipant ? displayName(activeParticipant.participantId) : "已结束"}</div>
              {activeThrowerName ? <div>出镖 {activeThrowerName}</div> : null}
              <div>剩余 {activeParticipant?.remaining ?? 0}</div>
            </div>
          </div>

          {activeParticipant && activeThrowerOptions.length > 1 ? (
            <ThrowerPicker
              options={activeThrowerOptions}
              value={activeThrowerId}
              onChange={(userId) => selectThrower(activeParticipant.participantId, userId)}
            />
          ) : null}

          <div className="grid grid-cols-5 gap-1.5">
            {quickScores.map((quickScore) => (
              <button
                key={quickScore}
                type="button"
                className="min-h-8 touch-manipulation select-none rounded-lg border border-wire bg-field px-2 text-sm font-black text-ink transition-colors duration-75 active:bg-board/10"
                onClick={() => requestScore(quickScore)}
              >
                {quickScore}
              </button>
            ))}
          </div>

          <div className="grid min-h-0 grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
              <KeyButton key={digit} onClick={() => appendDigit(digit)}>
                {digit}
              </KeyButton>
            ))}
            <KeyButton onClick={() => setScoreInput((current) => current.slice(0, -1))} disabled={scoreInput.length === 0}>
              ←
            </KeyButton>
            <KeyButton onClick={() => appendDigit("0")}>
              0
            </KeyButton>
            <KeyButton onClick={() => setScoreInput("")} disabled={scoreInput.length === 0}>
              C
            </KeyButton>
          </div>

          <button
            type="button"
            className="inline-flex min-h-10 touch-manipulation select-none items-center justify-center gap-2 rounded-lg bg-board px-4 text-base font-bold text-white transition-colors duration-75 active:bg-board/90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={confirmInput}
            disabled={scoreInput.length === 0}
          >
            <Check className="h-5 w-5" aria-hidden />
            确认录入
          </button>
          {message ? <p className="text-xs font-semibold text-accent">{message}</p> : null}
        </section>
      </div>

      {showDetails ? (
        <TurnDetails
          turns={state.turns}
          names={names}
          participantA={participantA}
          participantB={participantB}
          turnDisplayName={turnDisplayName}
          onClose={() => setShowDetails(false)}
        />
      ) : null}

      {checkoutScore !== null ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/45 p-3 sm:place-items-center">
          <div className="w-full max-w-sm rounded-lg bg-surface p-5 shadow-soft">
            <h3 className="text-lg font-bold">结镖确认</h3>
            <p className="mt-2 text-sm text-muted">本轮 {checkoutScore} 分结镖，用几镖完成？</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[1, 2, 3].map((darts) => (
                <button
                  key={darts}
                  type="button"
                  className="min-h-14 touch-manipulation select-none rounded-lg bg-board text-lg font-black text-white transition-colors duration-75 active:bg-board/90"
                  onClick={() => recordScore(checkoutScore, darts)}
                >
                  {darts} 镖
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-3 w-full touch-manipulation select-none rounded-lg border border-wire bg-surface px-4 py-3 text-sm font-semibold transition-colors duration-75 active:bg-field"
              onClick={() => setCheckoutScore(null)}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LineupSelect({
  label,
  members,
  value,
  onChange
}: {
  label: string;
  members: PlayerOption[];
  value: string;
  onChange: (userId: string) => void;
}) {
  return (
    <label className="label">
      {label}
      <select className="form-input" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">选择选手</option>
        {members.map((member) => (
          <option key={member.userId} value={member.userId}>{member.name}</option>
        ))}
      </select>
    </label>
  );
}

function ThrowerPicker({
  options,
  value,
  onChange
}: {
  options: PlayerOption[];
  value: string;
  onChange: (userId: string) => void;
}) {
  return (
    <div className="grid gap-1.5 rounded-lg bg-field p-2">
      <div className="text-xs font-bold text-muted">本轮出镖人</div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.userId}
            type="button"
            className={`min-h-9 touch-manipulation select-none rounded-lg border px-2 text-xs font-bold transition-colors duration-75 ${
              value === option.userId
                ? "border-board bg-board text-white"
                : "border-wire bg-surface text-ink active:bg-field"
            }`}
            onClick={() => onChange(option.userId)}
          >
            <span className="block truncate">{option.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayerPanel({
  name,
  isActive,
  rule,
  remaining,
  legsWon,
  stats
}: {
  name: string;
  isActive: boolean;
  rule: MatchLegRule;
  remaining: number;
  legsWon: number;
  stats: ReturnType<typeof calculateDartStats>;
}) {
  return (
    <div
      className={`min-h-0 rounded-lg border bg-surface p-2 shadow-soft sm:p-3 ${
        isActive ? "border-board ring-2 ring-board/15" : "border-wire"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold text-muted">{isActive ? "当前出镖" : "等待"}</div>
          <h2 className="mt-1 truncate text-lg font-bold">{name}</h2>
          <div className="mt-1 text-xs text-muted">{getLegRuleLabel(rule)}</div>
        </div>
        <div className="text-right">
          <div className="text-4xl font-black leading-none text-board sm:text-5xl">{remaining}</div>
          <div className="mt-1 text-xs font-semibold text-muted">Legs {legsWon}</div>
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-4 gap-1 text-xs">
        <Stat label="均分" value={stats.averagePer3Darts} />
        <Stat label="最高" value={stats.highestTurnScore} />
        <Stat label="100+" value={stats.count100Plus} />
        <Stat label="180" value={stats.count180} />
      </dl>
    </div>
  );
}

function SettlementView({
  state,
  names,
  participantA,
  participantB,
  saveLabel,
  message,
  isPending,
  isSaved,
  onSave,
  onReset,
  displayName,
  turnDisplayName
}: {
  state: ScoringState;
  names: Record<string, string>;
  participantA: ParticipantInfo;
  participantB: ParticipantInfo;
  saveLabel: string;
  message: string;
  isPending: boolean;
  isSaved: boolean;
  onSave: () => void;
  onReset: () => void;
  displayName: (participantId: string, legNumber?: number) => string;
  turnDisplayName: (turn: ScoreTurn) => string;
}) {
  const winnerName = names[state.winnerParticipantId || ""] || "胜者";
  const playerRows = state.participants.map((participant) => ({
    participant,
    name: names[participant.participantId],
    stats: calculateDartStats(participant.turns)
  }));
  const memberRows = [participantA, participantB].flatMap((participant) =>
    (participant.members || []).map((member) => ({
      participantName: participant.name,
      member,
      stats: calculateDartStats(state.turns.filter((turn) => turn.userId === member.userId))
    }))
  ).filter((row) => row.stats.turnsThrown > 0);

  return (
    <div className="grid h-[calc(100dvh-7rem)] min-h-[560px] grid-rows-[auto_1fr_auto] gap-2 overflow-hidden rounded-lg">
      <section className="rounded-lg border border-board bg-surface p-4 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-board p-2 text-white">
              <Trophy className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <div className="text-sm font-semibold text-muted">胜利结算</div>
              <h2 className="text-xl font-black">{winnerName} 获胜</h2>
            </div>
          </div>
          <div className="text-2xl font-black text-board">
            {state.participants[0].legsWon}:{state.participants[1].legsWon}
          </div>
        </div>
      </section>

      <section className="grid min-h-0 gap-2 lg:grid-cols-[1fr_1fr]">
        <div className="grid min-h-0 gap-2">
          {playerRows.map(({ participant, name, stats }) => (
            <div key={participant.participantId} className="rounded-lg border border-wire bg-surface p-3 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <h3 className="truncate font-bold">{name}</h3>
                <span className="text-sm font-semibold text-muted">Legs {participant.legsWon}</span>
              </div>
              <dl className="mt-3 grid grid-cols-4 gap-1.5 text-xs">
                <Stat label="Avg" value={stats.averagePer3Darts} />
                <Stat label="High" value={stats.highestTurnScore} />
                <Stat label="最高结镖" value={stats.highestCheckout} />
                <Stat label="高拆" value={stats.countHighCheckout} />
                <Stat label="100+" value={stats.count100Plus} />
                <Stat label="140+" value={stats.count140Plus} />
                <Stat label="170+" value={stats.count170Plus} />
                <Stat label="180" value={stats.count180} />
                <Stat label="爆镖" value={stats.bustCount} />
                <Stat label="结镖" value={stats.checkoutCount} />
                <Stat label="总镖数" value={stats.totalDarts} />
                <Stat label="总得分" value={stats.totalScoredPoints} />
              </dl>
            </div>
          ))}
          {memberRows.length > 0 ? (
            <div className="rounded-lg border border-wire bg-surface p-3 shadow-soft">
              <div className="mb-2 font-bold">个人出镖统计</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {memberRows.map((row) => (
                  <div key={row.member.userId} className="rounded-lg bg-field p-2">
                    <div className="truncate text-xs font-bold text-muted">
                      {row.participantName} / {row.member.name}
                    </div>
                    <dl className="mt-2 grid grid-cols-4 gap-1 text-xs">
                      <Stat label="Avg" value={row.stats.averagePer3Darts} />
                      <Stat label="High" value={row.stats.highestTurnScore} />
                      <Stat label="180" value={row.stats.count180} />
                      <Stat label="镖数" value={row.stats.totalDarts} />
                    </dl>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="min-h-0 rounded-lg border border-wire bg-surface p-3 shadow-soft">
          <div className="mb-2 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-board" aria-hidden />
            <h3 className="font-bold">战局回顾</h3>
          </div>
          <TurnTimeline
            turns={state.turns}
            names={names}
            participantA={participantA}
            participantB={participantB}
            displayName={displayName}
            turnDisplayName={turnDisplayName}
          />
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-wire bg-surface p-3 shadow-soft">
        <div className="text-sm font-semibold text-muted">{message || "确认无误后保存本场结果。"}</div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={onReset}>
            重开
          </Button>
          <Button type="button" onClick={onSave} disabled={isPending || isSaved}>
            <Save className="h-4 w-4" aria-hidden />
            {isSaved ? "已保存" : saveLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}

function TurnDetails({
  turns,
  names,
  participantA,
  participantB,
  turnDisplayName,
  onClose
}: {
  turns: ScoreTurn[];
  names: Record<string, string>;
  participantA: ParticipantInfo;
  participantB: ParticipantInfo;
  turnDisplayName: (turn: ScoreTurn) => string;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 grid rounded-lg border border-wire bg-surface/95 p-3 shadow-soft backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-board" aria-hidden />
          <h3 className="font-bold">对战详情</h3>
        </div>
        <Button type="button" variant="secondary" onClick={onClose}>
          隐藏
        </Button>
      </div>
      <TurnTimeline
        turns={turns}
        names={names}
        participantA={participantA}
        participantB={participantB}
        turnDisplayName={turnDisplayName}
      />
    </div>
  );
}

function TurnTimeline({
  turns,
  names,
  participantA,
  participantB,
  displayName,
  turnDisplayName
}: {
  turns: ScoreTurn[];
  names: Record<string, string>;
  participantA: ParticipantInfo;
  participantB: ParticipantInfo;
  displayName?: (participantId: string, legNumber?: number) => string;
  turnDisplayName?: (turn: ScoreTurn) => string;
}) {
  const columns = [participantA, participantB];

  return (
    <div className="min-h-0 overflow-y-auto pr-1">
      {turns.length === 0 ? (
        <p className="rounded-lg bg-field p-3 text-sm text-muted">暂无回合记录。</p>
      ) : (
        <div className="grid gap-2">
          {turns.map((turn, index) => (
            <div key={`${turn.participantId}-${index}`} className="grid grid-cols-[42px_1fr_80px] items-center gap-2 rounded-lg bg-field p-2 text-sm">
              <div className="font-black text-muted">#{index + 1}</div>
              <div className="min-w-0">
                <div className="truncate font-bold">
                  {turnDisplayName
                    ? turnDisplayName(turn)
                    : displayName
                      ? displayName(turn.participantId, turn.legNumber)
                      : names[turn.participantId]}
                </div>
                <div className="text-xs text-muted">
                  L{turn.legNumber} · {turn.remainingBefore} → {turn.remainingAfter} · {turn.darts || 3} 镖
                  {turn.isBust ? " · 爆镖" : ""}
                  {turn.isCheckout ? " · 结镖" : ""}
                </div>
              </div>
              <div className="text-right text-xl font-black text-board">{turn.score}</div>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            {columns.map((participant) => (
              <div key={participant.id} className="rounded-lg border border-wire bg-surface p-2">
                <div className="truncate text-xs font-bold text-muted">{participant.name}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {turns
                    .filter((turn) => turn.participantId === participant.id)
                    .map((turn, index) => (
                      <span key={`${participant.id}-${index}`} className="rounded bg-field px-1.5 py-1 text-xs font-bold">
                        L{turn.legNumber}:{turn.score}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-field p-2">
      <dt className="truncate text-[11px] text-muted">{label}</dt>
      <dd className="font-black">{value}</dd>
    </div>
  );
}

function SmallAction({
  children,
  disabled,
  onClick
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex min-h-10 touch-manipulation select-none items-center justify-center gap-1.5 rounded-lg border border-wire bg-surface px-2 text-sm font-bold transition-colors duration-75 active:bg-field disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function KeyButton({
  children,
  disabled,
  onClick
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="min-h-10 touch-manipulation select-none rounded-lg border border-wire bg-surface text-xl font-black text-ink shadow-sm transition-colors duration-75 active:bg-field disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
