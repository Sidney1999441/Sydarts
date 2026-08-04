"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  BarChart3,
  Check,
  Clock3,
  Eye,
  EyeOff,
  Flag,
  Gauge,
  ListChecks,
  RotateCcw,
  Save,
  Target,
  Trophy,
  Undo2
} from "lucide-react";
import {
  adjudicateCurrentLegWinner,
  applyTurn,
  calculateDartStats,
  createScoringState,
  type ScoreTurn,
  type ScoringState
} from "@/lib/algorithms/scoring";
import { getLegRuleLabel, getLegStartingScore } from "@/lib/darts/variants";
import type { ManualMatchStats } from "@/lib/darts/soft-stats";
import { createResultSubmissionId } from "@/lib/results/submission";
import {
  compactPlayerName,
  composeParticipantMemberName,
  nameAlreadyContainsMember
} from "@/lib/scorer/display-names";
import { Button } from "@/components/ui/Button";
import { PlayerAvatar, PlayerIdentity } from "@/components/ui/PlayerIdentity";
import type {
  FirstThrowMode,
  LegParticipantMode,
  MatchFinishMode,
  MatchLegLineup,
  MatchLegResult,
  MatchLegRule
} from "@/types/domain";

type GameScore = 301 | 501 | 701;
type BestOf = 3 | 5 | 7;
export type RoundLimit = 10 | 15 | 20 | "unlimited";
type PlayerOption = { userId: string; name: string; avatarUrl?: string | null };
type ParticipantInfo = { id: string; name: string; avatarUrl?: string | null; members?: PlayerOption[] };
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
  userStats?: Record<string, ManualMatchStats>;
};

const roundLimitOptions: Array<{ value: RoundLimit; label: string }> = [
  { value: 10, label: "10 轮" },
  { value: 15, label: "15 轮" },
  { value: 20, label: "20 轮" },
  { value: "unlimited", label: "无限" }
];

const firstThrowModeOptions: Array<{ value: FirstThrowMode; label: string; description: string }> = [
  { value: "alternate", label: "轮先", description: "每局双方轮流先手" },
  { value: "winner", label: "胜先", description: "上一局胜方下一局先手" },
  { value: "loser", label: "负先", description: "上一局负方下一局先手" }
];

const scorerDialogBackdropClass =
  "fixed inset-0 z-[100] grid place-items-end overflow-y-auto bg-slate-950/50 p-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] sm:place-items-center sm:pb-3";
const scorerDialogPanelClass = "max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain";
const mobileQuickScores: QuickScoreOption[] = [
  { value: 180, label: "180" },
  { value: 140, label: "140" },
  { value: 100, label: "100" },
  { value: 85, label: "85" },
  { value: 81, label: "81" },
  { value: 60, label: "60" },
  { value: 45, label: "45" },
  { value: 41, label: "41" },
  { value: 0, label: "Oh No", tone: "miss" }
];

type QuickScoreOption = {
  value: number;
  label: string;
  tone?: "miss";
};

function getNumericRoundLimit(limit: RoundLimit) {
  return limit === "unlimited" ? null : limit;
}

function getRoundLimitLabel(limit: RoundLimit) {
  return limit === "unlimited" ? "无限" : `${limit} 轮`;
}

function getFirstThrowModeLabel(mode: FirstThrowMode) {
  return firstThrowModeOptions.find((option) => option.value === mode)?.label || "轮先";
}

function compactSideName(name: string) {
  const clean = compactPlayerName(name).replace(/\s+/g, " ").trim();
  const parts = clean.split(/\s*\/\s*/).filter(Boolean);
  if (parts.length > 1) return `${parts[0]} +${parts.length - 1}`;
  return clean;
}

function defaultRules(startingScore: GameScore, bestOf: BestOf, participantMode: LegParticipantMode): MatchLegRule[] {
  return Array.from({ length: bestOf }, (_, index) => ({
    legNumber: index + 1,
    participantMode,
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
  defaultParticipantMode = "doubles",
  matchFinishMode = "majority",
  initialRoundLimit = "unlimited",
  initialFirstThrowMode = null,
  saveLabel,
  successMessage,
  onComplete
}: {
  participantA: ParticipantInfo;
  participantB: ParticipantInfo;
  startingScore: GameScore;
  bestOf: BestOf;
  legRules?: MatchLegRule[];
  defaultParticipantMode?: LegParticipantMode;
  matchFinishMode?: MatchFinishMode;
  initialRoundLimit?: RoundLimit;
  initialFirstThrowMode?: FirstThrowMode | null;
  saveLabel: string;
  successMessage: string;
  onComplete: (payload: ScoringCompletePayload) => Promise<void>;
}) {
  const rules = useMemo(
    () => (legRules && legRules.length > 0 ? legRules : defaultRules(startingScore, bestOf, defaultParticipantMode)),
    [bestOf, defaultParticipantMode, legRules, startingScore]
  );
  const initialLineups = useMemo(() => defaultLineups(rules, participantA, participantB), [rules, participantA, participantB]);
  const needsLineupSelection = rules.some(
    (rule) =>
      rule.participantMode === "singles" &&
      ((participantA.members?.length || 0) > 1 || (participantB.members?.length || 0) > 1)
  );
  const configuredFirstThrowMode =
    initialFirstThrowMode === "alternate" || initialFirstThrowMode === "winner" || initialFirstThrowMode === "loser"
      ? initialFirstThrowMode
      : null;
  const defaultFirstThrowMode = configuredFirstThrowMode || "alternate";

  function createFreshState(
    nextLineups: MatchLegLineup[],
    firstParticipantId?: string | null,
    nextFirstThrowMode: FirstThrowMode = defaultFirstThrowMode
  ) {
    return createScoringState({
      participantAId: participantA.id,
      participantBId: participantB.id,
      startingScore: getLegStartingScore(rules[0]) || startingScore,
      bestOf,
      legRules: rules,
      matchFinishMode,
      legLineups: nextLineups,
      firstParticipantId,
      firstThrowMode: nextFirstThrowMode
    });
  }

  const [lineups, setLineups] = useState<MatchLegLineup[]>(initialLineups);
  const [lineupConfirmed, setLineupConfirmed] = useState(!needsLineupSelection);
  const [firstParticipantId, setFirstParticipantId] = useState<string | null>(null);
  const [firstThrowMode, setFirstThrowMode] = useState<FirstThrowMode>(defaultFirstThrowMode);
  const [roundLimit, setRoundLimit] = useState<RoundLimit>(initialRoundLimit);
  const [activeThrowerByParticipant, setActiveThrowerByParticipant] = useState<ThrowerByParticipant>(() =>
    defaultThrowers(initialLineups, participantA, participantB)
  );
  const [state, setState] = useState(() => createFreshState(initialLineups, null, defaultFirstThrowMode));
  const [history, setHistory] = useState<ScoringHistoryEntry[]>([]);
  const [scoreInput, setScoreInput] = useState("");
  const [checkoutScore, setCheckoutScore] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [message, setMessage] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const submissionIdRef = useRef(createResultSubmissionId());

  useEffect(() => {
    if (!lineupConfirmed) {
      document.body.classList.remove("codl-scoreboard-active");
      return;
    }

    document.body.classList.add("codl-scoreboard-active");
    return () => {
      document.body.classList.remove("codl-scoreboard-active");
    };
  }, [lineupConfirmed]);

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
  const memberById = useMemo(() => {
    const map = new Map<string, PlayerOption>();
    for (const member of [...(participantA.members || []), ...(participantB.members || [])]) {
      map.set(member.userId, member);
    }
    return map;
  }, [participantA.members, participantB.members]);
  const activeParticipant = state.participants.find(
    (participant) => participant.participantId === state.activeParticipantId
  );
  const currentRule = state.legRules[state.currentLeg - 1] || state.legRules[0];
  const quickScores: QuickScoreOption[] = [
    { value: 180, label: "180" },
    { value: 170, label: "170" },
    { value: 140, label: "140" },
    { value: 100, label: "100" },
    { value: 85, label: "85" },
    { value: 81, label: "81" },
    { value: 60, label: "60" },
    { value: 45, label: "45" },
    { value: 41, label: "41" },
    { value: 20, label: "20" },
    { value: 0, label: "Oh No", tone: "miss" }
  ];
  const numericRoundLimit = getNumericRoundLimit(roundLimit);

  function currentLegTurns(scoringState = state) {
    return scoringState.turns.filter((turn) => turn.legNumber === scoringState.currentLeg);
  }

  function isRoundLimitReached(scoringState = state) {
    return Boolean(
      numericRoundLimit &&
        !scoringState.winnerParticipantId &&
        currentLegTurns(scoringState).length >= numericRoundLimit * 2
    );
  }

  function currentRoundLabel() {
    const turnCount = currentLegTurns().length;
    const currentRound = Math.max(1, Math.floor(turnCount / 2) + 1);
    if (!numericRoundLimit) return `${currentRound}/无限`;
    return `${Math.min(currentRound, numericRoundLimit)}/${numericRoundLimit}`;
  }

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
    return playerName ? composeParticipantMemberName(names[participantId], playerName) : names[participantId];
  }

  function turnDisplayName(turn: ScoreTurn) {
    const playerName = turn.userId ? memberNames.get(turn.userId) : null;
    if (playerName) return composeParticipantMemberName(names[turn.participantId], playerName);
    return displayName(turn.participantId, turn.legNumber);
  }

  function displayAvatarUrl(participantId: string, legNumber = state.currentLeg) {
    const participant = participantId === participantA.id ? participantA : participantB;
    const rule = state.legRules[legNumber - 1];
    const lineup = lineups.find((item) => item.legNumber === legNumber);
    if (rule?.participantMode === "singles" && lineup) {
      const userId = participantId === participantA.id
        ? lineup.participantAUserIds[0]
        : lineup.participantBUserIds[0];
      return (userId ? memberById.get(userId)?.avatarUrl : null) || participant.avatarUrl || null;
    }
    return participant.avatarUrl || participant.members?.find((member) => member.avatarUrl)?.avatarUrl || null;
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
    setState(createFreshState(lineups, null, firstThrowMode));
    setLineupConfirmed(true);
    setFirstParticipantId(null);
    setActiveThrowerByParticipant(defaultThrowers(lineups, participantA, participantB));
    setHistory([]);
    setScoreInput("");
    setCheckoutScore(null);
    setIsSaved(false);
    setMessage("");
    submissionIdRef.current = createResultSubmissionId();
  }

  function chooseFirstParticipant(participantId: string) {
    setState(createFreshState(lineups, participantId, firstThrowMode));
    setFirstParticipantId(participantId);
    setActiveThrowerByParticipant(defaultThrowers(lineups, participantA, participantB));
    setHistory([]);
    setScoreInput("");
    setCheckoutScore(null);
    setMessage("");
    setIsSaved(false);
    submissionIdRef.current = createResultSubmissionId();
  }

  function chooseRoundLimitWinner(participantId: string) {
    const limit = getNumericRoundLimit(roundLimit);
    if (!limit || state.winnerParticipantId) return;

    try {
      const next = adjudicateCurrentLegWinner(state, participantId, { roundLimit: limit });
      const legChanged = next.currentLeg !== state.currentLeg;
      setHistory((current) => [...current, { state, throwers: activeThrowerByParticipant }]);
      setState(next);
      setActiveThrowerByParticipant(
        legChanged ? defaultThrowers(lineups, participantA, participantB, next.currentLeg) : activeThrowerByParticipant
      );
      setScoreInput("");
      setCheckoutScore(null);
      setMessage(next.winnerParticipantId ? "" : `已裁定本局胜方，进入第 ${next.currentLeg} 局。`);
      setIsSaved(false);
      submissionIdRef.current = createResultSubmissionId();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "请选择有效的本局胜方。");
    }
  }

  function recordScore(value: number, darts = 3) {
    if (!firstParticipantId || isRoundLimitReached()) return;
    try {
      const participantId = state.activeParticipantId;
      const throwerUserId = currentThrowerUserId(participantId);
      const next = applyTurn(state, value, darts, throwerUserId || undefined);
      const legChanged = next.currentLeg !== state.currentLeg;
      setHistory((current) => [...current, { state, throwers: activeThrowerByParticipant }]);
      setState(next);
      setActiveThrowerByParticipant((current) =>
        legChanged ? defaultThrowers(lineups, participantA, participantB, next.currentLeg) : rotateThrower(current, participantId, state.currentLeg)
      );
      setScoreInput("");
      setCheckoutScore(null);
      setMessage(isRoundLimitReached(next) ? `已达到本局 ${roundLimit} 轮上限，请选择本局胜方。` : "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "请输入 0-180 的整数。");
    }
  }

  function requestScore(value: number) {
    if (!firstParticipantId || !activeParticipant || state.winnerParticipantId || isRoundLimitReached()) return;
    if (value === activeParticipant.remaining && value > 0) {
      setCheckoutScore(value);
      return;
    }
    recordScore(value, 3);
  }

  function appendDigit(digit: string) {
    if (!firstParticipantId || state.winnerParticipantId || isRoundLimitReached()) return;
    setScoreInput((current) => {
      const next = current === "0" ? digit : `${current}${digit}`;
      return next.length > 3 ? current : next;
    });
  }

  function confirmInput() {
    if (!firstParticipantId || scoreInput.length === 0 || isRoundLimitReached()) return;
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
    setState(createFreshState(lineups, null, firstThrowMode));
    setFirstParticipantId(null);
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
            确认名单，进入开局设置
          </Button>
        </div>
      </div>
    );
  }

  if (!firstParticipantId) {
    return (
      <OpeningSetupModal
        participantAName={displayName(participantA.id, 1)}
        participantBName={displayName(participantB.id, 1)}
        participantAAvatarUrl={displayAvatarUrl(participantA.id, 1)}
        participantBAvatarUrl={displayAvatarUrl(participantB.id, 1)}
        firstThrowMode={firstThrowMode}
        firstThrowModeLocked={Boolean(configuredFirstThrowMode)}
        message={message}
        onFirstThrowModeChange={setFirstThrowMode}
        onChooseStarter={chooseFirstParticipant}
        participantAId={participantA.id}
        participantBId={participantB.id}
      />
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
          name: compactPlayerName(memberNames.get(userId)) || userId,
          avatarUrl: memberById.get(userId)?.avatarUrl || null
        }))
    : [];
  const activeThrowerId = activeParticipant ? currentThrowerUserId(activeParticipant.participantId) : "";
  const activeParticipantName = activeParticipant ? displayName(activeParticipant.participantId) : "已结束";
  const activeParticipantAvatarUrl = activeParticipant ? displayAvatarUrl(activeParticipant.participantId) : null;
  const activeThrowerRawName = activeThrowerId ? memberNames.get(activeThrowerId) : null;
  const activeThrowerAvatarUrl = activeThrowerId ? memberById.get(activeThrowerId)?.avatarUrl || null : null;
  const activeThrowerName =
    activeThrowerRawName && !nameAlreadyContainsMember(activeParticipantName, activeThrowerRawName)
      ? compactPlayerName(activeThrowerRawName)
      : null;
  const roundLimitReached = isRoundLimitReached();
  const lastTurn = state.turns.at(-1) || null;

  return (
    <div className="codl-touch-scoreboard relative grid gap-1.5 rounded-lg pb-20 lg:h-[calc(100dvh-7rem)] lg:min-h-[560px] lg:gap-2 lg:overflow-hidden lg:pb-0">
      <div className="codl-scoreboard-grid grid min-h-0 gap-2 lg:h-full lg:grid-cols-[0.86fr_1.14fr]">
        <section className="codl-score-players grid min-h-0 grid-cols-2 grid-rows-[auto_auto] gap-1 lg:grid-cols-1 lg:grid-rows-[1fr_1fr_auto] lg:gap-2">
          {state.participants.map((participant) => {
            const stats = calculateDartStats(participant.turns);
            const isActive = state.activeParticipantId === participant.participantId;
            return (
              <PlayerPanel
                key={participant.participantId}
                name={displayName(participant.participantId)}
                avatarUrl={displayAvatarUrl(participant.participantId)}
                isActive={isActive}
                rule={currentRule}
                remaining={participant.remaining}
                legsWon={participant.legsWon}
                stats={stats}
              />
            );
          })}
          <div className="codl-score-actions col-span-2 grid grid-cols-3 gap-1 lg:col-span-1 lg:gap-2">
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

        <section className="codl-score-input grid min-h-0 gap-1.5 rounded-lg border border-wire bg-surface p-1.5 shadow-soft sm:gap-2 sm:p-3">
          <div className="hidden grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:grid">
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-muted sm:text-xs">本轮输入</div>
              <div className="text-5xl font-black leading-none text-ink sm:text-4xl">{scoreInput || "0"}</div>
              <div className="mt-1 truncate text-[11px] font-semibold text-board sm:text-xs">{getLegRuleLabel(currentRule)}</div>
            </div>
            <div className="grid max-w-[48vw] justify-items-end gap-1 text-right text-xs text-muted sm:max-w-none sm:gap-1.5 sm:text-sm">
              <div className="flex max-w-full items-center justify-end gap-2">
                <PlayerAvatar name={activeParticipantName} avatarUrl={activeParticipantAvatarUrl} size="xs" />
                <div className="min-w-0">
                  <div className="max-w-full truncate font-bold text-ink sm:hidden">{compactSideName(activeParticipantName)}</div>
                  <div className="hidden max-w-full truncate font-bold text-ink sm:block">{activeParticipantName}</div>
                  {activeThrowerName ? (
                    <div className="flex max-w-full items-center justify-end gap-1 truncate">
                      <PlayerAvatar name={activeThrowerName} avatarUrl={activeThrowerAvatarUrl} size="xs" />
                      <span className="truncate">出镖 {activeThrowerName}</span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="hidden sm:block">剩余 {activeParticipant?.remaining ?? 0}</div>
              <div className="max-w-full truncate text-[11px] sm:text-sm">{getFirstThrowModeLabel(firstThrowMode)} · {currentRoundLabel()}</div>
              <button
                type="button"
                className="hidden min-h-10 touch-manipulation select-none items-center justify-center gap-1.5 rounded-lg bg-board px-3 text-xs font-bold text-white transition-colors duration-75 active:bg-board/90 disabled:cursor-not-allowed disabled:opacity-50 sm:inline-flex sm:min-h-11 sm:gap-2 sm:px-4 sm:text-sm"
                onClick={confirmInput}
                disabled={scoreInput.length === 0 || roundLimitReached}
              >
                <Check className="h-4 w-4" aria-hidden />
                确认录入
              </button>
            </div>
          </div>

          {activeParticipant && activeThrowerOptions.length > 1 ? (
            <ThrowerPicker
              options={activeThrowerOptions}
              value={activeThrowerId}
              onChange={(userId) => selectThrower(activeParticipant.participantId, userId)}
            />
          ) : null}

          <div className="hidden grid-cols-6 gap-1 sm:grid">
            {quickScores.map((quickScore) => (
              <button
                key={quickScore.label}
                type="button"
                className={`min-h-9 touch-manipulation select-none rounded-lg border px-2 text-sm font-black transition-colors duration-75 ${
                  quickScore.tone === "miss"
                    ? "border-red-200 bg-red-50 text-red-700 active:bg-red-100"
                    : "border-wire bg-field text-ink active:bg-board/10"
                }`}
                onClick={() => requestScore(quickScore.value)}
              >
                {quickScore.label}
              </button>
            ))}
          </div>

          <div className="hidden min-h-0 grid-cols-3 gap-1.5 sm:grid sm:gap-2">
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

          <div className="codl-mobile-keypad grid grid-cols-[4.7rem_minmax(0,1fr)] gap-1.5 sm:hidden">
            <div className="codl-mobile-quick-grid grid content-stretch gap-1">
              {mobileQuickScores.map((quickScore) => (
                <QuickScoreButton
                  key={quickScore.label}
                  tone={quickScore.tone}
                  onClick={() => requestScore(quickScore.value)}
                >
                  {quickScore.label}
                </QuickScoreButton>
              ))}
            </div>
            <div className="codl-number-pad grid grid-cols-3 gap-1.5">
              {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((digit) => (
                <KeyButton key={digit} onClick={() => appendDigit(digit)}>
                  {digit}
                </KeyButton>
              ))}
              <KeyButton onClick={() => appendDigit("0")}>
                0
              </KeyButton>
              <KeyButton onClick={() => setScoreInput((current) => current.slice(0, -1))} disabled={scoreInput.length === 0}>
                ←
              </KeyButton>
              <KeyButton onClick={() => setScoreInput("")} disabled={scoreInput.length === 0}>
                C
              </KeyButton>
            </div>
          </div>

          <button
            type="button"
            className="codl-enter-score-button grid min-h-16 touch-manipulation select-none place-items-center rounded-lg bg-amber-400 px-3 text-center text-lg font-black text-slate-950 shadow-sm transition-colors duration-75 active:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-45 sm:hidden"
            onClick={confirmInput}
            disabled={scoreInput.length === 0 || roundLimitReached}
          >
            <span className="text-2xl leading-none">{scoreInput || "0"}</span>
            <span className="text-xs uppercase tracking-normal">ENTER SCORE</span>
          </button>

          <LastTurnPanel
            turn={lastTurn}
            currentLeg={state.currentLeg}
            turnDisplayName={turnDisplayName}
          />

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
        <div className={scorerDialogBackdropClass}>
          <div className={`${scorerDialogPanelClass} w-full max-w-sm rounded-lg bg-surface p-5 shadow-soft`}>
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

      {roundLimitReached ? (
          <RoundLimitWinnerDialog
            roundLimit={numericRoundLimit || 0}
            participantAName={displayName(participantA.id)}
            participantBName={displayName(participantB.id)}
            participantAAvatarUrl={displayAvatarUrl(participantA.id)}
            participantBAvatarUrl={displayAvatarUrl(participantB.id)}
          participantARemaining={state.participants[0].remaining}
          participantBRemaining={state.participants[1].remaining}
          onChooseWinner={chooseRoundLimitWinner}
          participantAId={participantA.id}
          participantBId={participantB.id}
        />
      ) : null}
    </div>
  );
}

function OpeningSetupModal({
  participantAId,
  participantBId,
  participantAName,
  participantBName,
  participantAAvatarUrl,
  participantBAvatarUrl,
  firstThrowMode,
  firstThrowModeLocked,
  message,
  onFirstThrowModeChange,
  onChooseStarter
}: {
  participantAId: string;
  participantBId: string;
  participantAName: string;
  participantBName: string;
  participantAAvatarUrl?: string | null;
  participantBAvatarUrl?: string | null;
  firstThrowMode: FirstThrowMode;
  firstThrowModeLocked: boolean;
  message: string;
  onFirstThrowModeChange: (mode: FirstThrowMode) => void;
  onChooseStarter: (participantId: string) => void;
}) {
  return (
    <div className={scorerDialogBackdropClass}>
      <div className={`${scorerDialogPanelClass} w-full max-w-lg rounded-lg border border-wire bg-surface p-4 shadow-soft sm:p-5`}>
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-board text-white">
            <Flag className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <div className="text-xs font-black uppercase text-board">01 开局设置</div>
            <h2 className="mt-1 text-xl font-black">选择先手后开始</h2>
            <p className="mt-1 text-sm text-muted">双方确认谁先出镖；未选择前不会进入计分。</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-field p-3">
          <div className="text-sm font-bold text-ink">先手交替模式</div>
          {firstThrowModeLocked ? (
            <div className="mt-2 rounded-lg border border-board/25 bg-surface px-3 py-2 text-sm font-bold text-board">
              赛事已设置：{firstThrowModeOptions.find((option) => option.value === firstThrowMode)?.label || "轮先"}
            </div>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {firstThrowModeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`min-h-14 touch-manipulation select-none rounded-lg border px-3 text-left transition-colors duration-75 ${
                    firstThrowMode === option.value
                      ? "border-board bg-board text-white"
                      : "border-wire bg-surface text-ink active:bg-field"
                  }`}
                  onClick={() => onFirstThrowModeChange(option.value)}
                >
                  <span className="block text-base font-black">{option.label}</span>
                  <span className="mt-1 block text-xs font-semibold opacity-80">{option.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <StarterButton name={participantAName} avatarUrl={participantAAvatarUrl} onClick={() => onChooseStarter(participantAId)} />
          <StarterButton name={participantBName} avatarUrl={participantBAvatarUrl} onClick={() => onChooseStarter(participantBId)} />
        </div>

        {message ? <p className="mt-3 text-sm font-semibold text-accent">{message}</p> : null}
      </div>
    </div>
  );
}

function StarterButton({ name, avatarUrl, onClick }: { name: string; avatarUrl?: string | null; onClick: () => void }) {
  return (
    <button
      type="button"
      className="min-h-16 touch-manipulation select-none rounded-lg border border-wire bg-surface px-4 text-left transition-colors duration-75 active:border-board active:bg-board/10"
      onClick={onClick}
    >
      <span className="block text-xs font-bold text-muted">先手</span>
      <PlayerIdentity className="mt-2" name={name} avatarUrl={avatarUrl} size="sm" compact />
    </button>
  );
}

function RoundLimitWinnerDialog({
  participantAId,
  participantBId,
  participantAName,
  participantBName,
  participantAAvatarUrl,
  participantBAvatarUrl,
  participantARemaining,
  participantBRemaining,
  roundLimit,
  onChooseWinner
}: {
  participantAId: string;
  participantBId: string;
  participantAName: string;
  participantBName: string;
  participantAAvatarUrl?: string | null;
  participantBAvatarUrl?: string | null;
  participantARemaining: number;
  participantBRemaining: number;
  roundLimit: number;
  onChooseWinner: (participantId: string) => void;
}) {
  return (
    <div className={scorerDialogBackdropClass}>
      <div className={`${scorerDialogPanelClass} w-full max-w-lg rounded-lg border border-wire bg-surface p-4 shadow-soft sm:p-5`}>
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-board text-white">
            <Clock3 className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <div className="text-xs font-black uppercase text-board">轮数上限</div>
            <h2 className="mt-1 text-xl font-black">第 {roundLimit} 轮已结束</h2>
            <p className="mt-1 text-sm text-muted">本局未清零，请双方确认本局胜方后继续。</p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <AdjudicationWinnerButton
            name={participantAName}
            avatarUrl={participantAAvatarUrl}
            remaining={participantARemaining}
            onClick={() => onChooseWinner(participantAId)}
          />
          <AdjudicationWinnerButton
            name={participantBName}
            avatarUrl={participantBAvatarUrl}
            remaining={participantBRemaining}
            onClick={() => onChooseWinner(participantBId)}
          />
        </div>
      </div>
    </div>
  );
}

function AdjudicationWinnerButton({
  name,
  avatarUrl,
  remaining,
  onClick
}: {
  name: string;
  avatarUrl?: string | null;
  remaining: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="min-h-20 touch-manipulation select-none rounded-lg border border-wire bg-field px-4 text-left transition-colors duration-75 active:border-board active:bg-board/10"
      onClick={onClick}
    >
      <span className="block text-xs font-bold text-muted">选择本局胜方</span>
      <PlayerIdentity className="mt-2" name={name} avatarUrl={avatarUrl} size="sm" compact />
      <span className="mt-1 block text-xs font-bold text-board">剩余 {remaining}</span>
    </button>
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
    <div className="codl-thrower-picker grid gap-1.5 rounded-lg bg-field p-2">
      <div className="text-xs font-bold text-muted">本轮出镖人</div>
      <div className="codl-thrower-picker-options grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.userId}
            type="button"
            className={`codl-thrower-picker-button min-h-10 touch-manipulation select-none rounded-lg border px-2 py-1 text-left text-xs font-bold transition-colors duration-75 ${
              value === option.userId
                ? "border-board bg-board text-white"
                : "border-wire bg-surface text-ink active:bg-field"
            }`}
            onClick={() => onChange(option.userId)}
          >
            <PlayerIdentity
              name={option.name}
              avatarUrl={option.avatarUrl}
              size="xs"
              compact
              className={value === option.userId ? "[&_*]:text-white" : ""}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayerPanel({
  name,
  avatarUrl,
  isActive,
  rule,
  remaining,
  legsWon,
  stats
}: {
  name: string;
  avatarUrl?: string | null;
  isActive: boolean;
  rule: MatchLegRule;
  remaining: number;
  legsWon: number;
  stats: ReturnType<typeof calculateDartStats>;
}) {
  return (
    <div
      className={`codl-player-panel grid min-h-0 overflow-hidden rounded-lg border p-2 shadow-soft sm:gap-2 sm:bg-surface sm:p-3 ${
        isActive
          ? "border-board bg-board text-white ring-2 ring-board/15 sm:text-ink"
          : "border-slate-700 bg-slate-800 text-white sm:border-wire sm:text-ink"
      }`}
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="flex min-w-0 items-start gap-1.5 sm:gap-2">
          <PlayerAvatar name={name} avatarUrl={avatarUrl} size="xs" className="sm:h-9 sm:w-9" />
          <div className="min-w-0">
            <div className={`text-[10px] font-black uppercase sm:text-xs ${isActive ? "text-white/70 sm:text-muted" : "text-white/55 sm:text-muted"}`}>
              {isActive ? "出镖" : "等待"} · L{legsWon}
            </div>
            <h2 className="mt-0.5 min-w-0 truncate text-xs font-black leading-tight sm:text-lg">
              <span className="sm:hidden">{compactSideName(name)}</span>
              <span className="hidden sm:inline">{name}</span>
            </h2>
            <div className="mt-0.5 hidden truncate text-xs text-muted sm:block">{getLegRuleLabel(rule)}</div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-4xl font-black leading-none sm:text-5xl ${isActive ? "text-white sm:text-board" : "text-white/90 sm:text-board"}`}>
            {remaining}
          </div>
        </div>
      </div>
      <div className={`codl-player-ppr -mx-2 -mb-2 mt-1 px-2 py-1 text-center text-[11px] font-black sm:hidden ${isActive ? "bg-slate-950/25 text-white" : "bg-slate-950/35 text-white/85"}`}>
        PPR {stats.averagePer3Darts}
      </div>
      <dl className="hidden grid-cols-4 gap-1 text-[11px] sm:grid">
        <CompactStat label="均分" value={stats.averagePer3Darts} marker={<Gauge className="h-3.5 w-3.5" aria-hidden />} />
        <CompactStat label="最高轮" value={stats.highestTurnScore} marker={<Target className="h-3.5 w-3.5" aria-hidden />} />
        <CompactStat label="100+" value={stats.count100Plus} marker={<StatTextMark>100+</StatTextMark>} />
        <CompactStat label="180" value={stats.count180} marker={<StatTextMark>180</StatTextMark>} />
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
                      {composeParticipantMemberName(row.participantName, row.member.name)}
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

function CompactStat({ label, value, marker }: { label: string; value: string | number; marker: ReactNode }) {
  return (
    <div
      className="grid min-w-0 place-items-center rounded-lg bg-field px-1 py-1.5 text-center"
      title={`${label}: ${value}`}
      aria-label={`${label}: ${value}`}
    >
      <dt className="sr-only">{label}</dt>
      <dd className="grid min-w-0 justify-items-center gap-0.5">
        <span className="grid min-h-4 place-items-center text-board">{marker}</span>
        <span className="max-w-full truncate text-[12px] font-black leading-none text-ink sm:text-sm">{value}</span>
      </dd>
    </div>
  );
}

function StatTextMark({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-board/10 px-1 text-[10px] font-black leading-4 text-board">
      {children}
    </span>
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
      className="inline-flex min-h-10 touch-manipulation select-none items-center justify-center gap-1 rounded-lg border border-wire bg-surface px-1.5 text-xs font-bold transition-colors duration-75 active:bg-field disabled:cursor-not-allowed disabled:opacity-50 sm:gap-1.5 sm:px-2 sm:text-sm"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function LastTurnPanel({
  turn,
  currentLeg,
  turnDisplayName
}: {
  turn: ScoreTurn | null;
  currentLeg: number;
  turnDisplayName: (turn: ScoreTurn) => string;
}) {
  if (!turn) {
    return (
      <section className="codl-last-turn-panel grid min-h-20 content-center gap-1 rounded-lg border border-dashed border-sky-200 bg-sky-50/70 px-3 py-2 text-sm sm:hidden">
        <div className="text-xs font-black text-board">上一轮记录</div>
        <div className="font-black text-ink">暂无记录</div>
        <div className="codl-last-turn-detail text-xs font-semibold text-muted">第 {currentLeg} 局等待出镖</div>
      </section>
    );
  }

  const statusLabel = turn.isCheckout ? "结镖" : turn.isBust ? "爆镖" : "剩余";
  const statusClass = turn.isCheckout
    ? "text-emerald-700"
    : turn.isBust
      ? "text-red-700"
      : "text-board";

  return (
    <section className="codl-last-turn-panel grid min-h-20 gap-1 rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2 text-sm shadow-sm sm:hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-black text-board">上一轮记录</div>
          <div className="truncate font-black text-ink">{compactSideName(turnDisplayName(turn))}</div>
        </div>
        <div className={`shrink-0 text-3xl font-black leading-none ${statusClass}`}>{turn.score}</div>
      </div>
      <div className="codl-last-turn-detail flex items-center justify-between gap-2 text-xs font-bold text-muted">
        <span>第 {turn.legNumber} 局 · {turn.darts || 3} 镖</span>
        <span className={statusClass}>
          {statusLabel} {turn.remainingBefore} → {turn.remainingAfter}
        </span>
      </div>
    </section>
  );
}

function QuickScoreButton({
  children,
  tone,
  onClick
}: {
  children: ReactNode;
  tone?: "miss";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`codl-quick-score min-h-10 touch-manipulation select-none rounded-lg border px-1 font-black shadow-sm transition-colors duration-75 ${
        tone === "miss"
          ? "border-red-300 bg-red-600 text-sm leading-none text-white active:bg-red-500"
          : "border-amber-200 bg-amber-100 text-lg text-slate-800 active:bg-amber-200"
      }`}
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
      className="codl-score-key min-h-16 touch-manipulation select-none rounded-lg border border-wire bg-surface text-3xl font-black text-ink shadow-sm transition-colors duration-75 active:bg-field disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-10 sm:text-xl"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
