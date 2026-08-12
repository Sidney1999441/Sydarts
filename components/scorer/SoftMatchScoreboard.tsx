"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, ChevronRight, RotateCcw, Save, Trophy, UsersRound } from "lucide-react";
import { legsNeeded } from "@/lib/algorithms/scoring";
import { getLegRuleLabel } from "@/lib/darts/variants";
import {
  compactManualStats,
  getSoftStatFields,
  isSoftHighScoreVariant,
  mergeManualStats,
  ppdToPpr,
  pprToPpd,
  type ManualMatchStats
} from "@/lib/darts/soft-stats";
import { createResultSubmissionId } from "@/lib/results/submission";
import { compactPlayerName, composeParticipantMemberName } from "@/lib/scorer/display-names";
import { Button } from "@/components/ui/Button";
import { PlayerIdentity } from "@/components/ui/PlayerIdentity";
import type { MatchFinishMode, MatchLegLineup, MatchLegResult, MatchLegRule } from "@/types/domain";
import type { ScoringCompletePayload } from "@/components/scorer/TouchScoreboard";

type PlayerOption = { userId: string; name: string; avatarUrl?: string | null };
type ParticipantInfo = { id: string; name: string; avatarUrl?: string | null; members?: PlayerOption[] };
type LineupSide = "A" | "B";
type SoftLegEntry = {
  legNumber: number;
  winnerParticipantId: string;
  scoreA?: number;
  scoreB?: number;
  userStats: Record<string, ManualMatchStats>;
};

export type SoftScoringDraftPayload = {
  version: 1;
  savedAt?: string;
  savedBy?: string;
  submissionId: string;
  lineups: MatchLegLineup[];
  lineupConfirmed: boolean;
  currentLegIndex: number;
  scoreA: number;
  scoreB: number;
  winnerParticipantId: string | null;
  legEntries: SoftLegEntry[];
  currentWinner: string;
  participantScoreA: string;
  participantScoreB: string;
  legStats: Record<string, ManualMatchStats>;
  ppdInputs: Record<string, string>;
};

function lineupCount(rule: MatchLegRule, members: PlayerOption[]) {
  if (members.length === 0) return 0;
  if (rule.participantMode === "singles") return 1;
  if (rule.participantMode === "doubles") return Math.min(2, members.length);
  return members.length;
}

function defaultLineups(rules: MatchLegRule[], participantA: ParticipantInfo, participantB: ParticipantInfo) {
  const membersA = participantA.members || [];
  const membersB = participantB.members || [];

  return rules.map((rule) => ({
    legNumber: rule.legNumber,
    participantAUserIds: membersA.slice(0, lineupCount(rule, membersA)).map((member) => member.userId),
    participantBUserIds: membersB.slice(0, lineupCount(rule, membersB)).map((member) => member.userId)
  }));
}

function hasEmptyOrDuplicate(ids: string[], expectedCount: number) {
  if (expectedCount === 0) return false;
  const filled = ids.filter(Boolean);
  return filled.length !== expectedCount || new Set(filled).size !== filled.length;
}

function optionalNumber(value: string) {
  if (value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function aggregateUserStats(entries: SoftLegEntry[]) {
  const userIds = [...new Set(entries.flatMap((entry) => Object.keys(entry.userStats)))];
  return Object.fromEntries(
    userIds
      .map((userId) => [
        userId,
        mergeManualStats(entries.map((entry) => entry.userStats[userId]).filter(Boolean))
      ])
      .filter(([, stats]) => Object.keys(stats as ManualMatchStats).length > 0)
  ) as Record<string, ManualMatchStats>;
}

function highestCheckout(stats: Record<string, ManualMatchStats>) {
  return Math.max(0, ...Object.values(stats).map((item) => item.highestCheckout || 0));
}

function getDraftStatusLabel(status: "idle" | "restored" | "saving" | "saved" | "error") {
  if (status === "restored") return "已恢复";
  if (status === "saving") return "保存中";
  if (status === "saved") return "已保存";
  if (status === "error") return "保存失败";
  return "";
}

function normalizeSoftDraft(
  draft: SoftScoringDraftPayload | null | undefined,
  participantAId: string,
  participantBId: string
) {
  if (!draft || draft.version !== 1) return null;
  if (draft.winnerParticipantId && draft.winnerParticipantId !== participantAId && draft.winnerParticipantId !== participantBId) {
    return null;
  }
  if (draft.currentWinner && draft.currentWinner !== participantAId && draft.currentWinner !== participantBId) {
    return null;
  }
  if (draft.legEntries.some((entry) => entry.winnerParticipantId !== participantAId && entry.winnerParticipantId !== participantBId)) {
    return null;
  }
  return draft;
}

export function SoftMatchScoreboard({
  participantA,
  participantB,
  legRules,
  matchFinishMode = "majority",
  initialLineups,
  initialDraft = null,
  onSaveDraft,
  onClearDraft,
  saveLabel,
  successMessage,
  onComplete
}: {
  participantA: ParticipantInfo;
  participantB: ParticipantInfo;
  legRules: MatchLegRule[];
  matchFinishMode?: MatchFinishMode;
  initialLineups?: MatchLegLineup[];
  initialDraft?: SoftScoringDraftPayload | null;
  onSaveDraft?: (draft: SoftScoringDraftPayload) => Promise<void>;
  onClearDraft?: () => Promise<void>;
  saveLabel: string;
  successMessage: string;
  onComplete: (payload: ScoringCompletePayload) => Promise<void>;
}) {
  const rules = useMemo(() => legRules.filter((rule) => rule.dartMode === "soft"), [legRules]);
  const resolvedInitialLineups = useMemo(
    () => (initialLineups && initialLineups.length > 0 ? initialLineups : defaultLineups(rules, participantA, participantB)),
    [initialLineups, participantA, participantB, rules]
  );
  const safeInitialDraft = normalizeSoftDraft(initialDraft, participantA.id, participantB.id);
  const [lineups, setLineups] = useState<MatchLegLineup[]>(safeInitialDraft?.lineups || resolvedInitialLineups);
  const [lineupConfirmed, setLineupConfirmed] = useState(
    safeInitialDraft?.lineupConfirmed ?? Boolean(initialLineups && initialLineups.length > 0)
  );
  const [currentLegIndex, setCurrentLegIndex] = useState(safeInitialDraft?.currentLegIndex || 0);
  const [scoreA, setScoreA] = useState(safeInitialDraft?.scoreA || 0);
  const [scoreB, setScoreB] = useState(safeInitialDraft?.scoreB || 0);
  const [winnerParticipantId, setWinnerParticipantId] = useState<string | null>(safeInitialDraft?.winnerParticipantId || null);
  const [legEntries, setLegEntries] = useState<SoftLegEntry[]>(safeInitialDraft?.legEntries || []);
  const [currentWinner, setCurrentWinner] = useState(safeInitialDraft?.currentWinner || "");
  const [participantScoreA, setParticipantScoreA] = useState(safeInitialDraft?.participantScoreA || "");
  const [participantScoreB, setParticipantScoreB] = useState(safeInitialDraft?.participantScoreB || "");
  const [legStats, setLegStats] = useState<Record<string, ManualMatchStats>>(safeInitialDraft?.legStats || {});
  const [ppdInputs, setPpdInputs] = useState<Record<string, string>>(safeInitialDraft?.ppdInputs || {});
  const [message, setMessage] = useState(safeInitialDraft ? "已恢复上次中断进度，可以继续录入。" : "");
  const [draftStatus, setDraftStatus] = useState<"idle" | "restored" | "saving" | "saved" | "error">(
    safeInitialDraft ? "restored" : "idle"
  );
  const [isSaved, setIsSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const submissionIdRef = useRef(safeInitialDraft?.submissionId || createResultSubmissionId());
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDraftSignatureRef = useRef("");

  const currentRule = rules[currentLegIndex] || rules[0];
  const currentLineup = lineups.find((lineup) => lineup.legNumber === currentRule?.legNumber) || lineups[0];
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
  const currentFields = getSoftStatFields(currentRule?.gameVariant);
  const needsSideScores =
    currentRule?.gameVariant === "soft_half_it" || isSoftHighScoreVariant(currentRule?.gameVariant);
  const draftStatusLabel = onSaveDraft ? getDraftStatusLabel(draftStatus) : "";
  const currentUsers = [
    ...(currentLineup?.participantAUserIds || []).map((userId) => ({
      userId,
      sideName: participantA.name,
      name: compactPlayerName(memberNames.get(userId)) || userId,
      avatarUrl: memberById.get(userId)?.avatarUrl || null
    })),
    ...(currentLineup?.participantBUserIds || []).map((userId) => ({
      userId,
      sideName: participantB.name,
      name: compactPlayerName(memberNames.get(userId)) || userId,
      avatarUrl: memberById.get(userId)?.avatarUrl || null
    }))
  ];

  useEffect(() => {
    if (!onSaveDraft || !lineupConfirmed || isSaved) return;

    const draftCore = {
      version: 1 as const,
      submissionId: submissionIdRef.current,
      lineups,
      lineupConfirmed,
      currentLegIndex,
      scoreA,
      scoreB,
      winnerParticipantId,
      legEntries,
      currentWinner,
      participantScoreA,
      participantScoreB,
      legStats,
      ppdInputs
    };
    const signature = JSON.stringify(draftCore);
    if (signature === lastDraftSignatureRef.current) return;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);

    draftSaveTimerRef.current = setTimeout(() => {
      lastDraftSignatureRef.current = signature;
      setDraftStatus("saving");
      onSaveDraft({
        ...draftCore,
        savedAt: new Date().toISOString()
      })
        .then(() => setDraftStatus("saved"))
        .catch(() => setDraftStatus("error"));
    }, 650);

    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    };
  }, [
    currentLegIndex,
    currentWinner,
    isSaved,
    legEntries,
    legStats,
    lineups,
    lineupConfirmed,
    onSaveDraft,
    participantScoreA,
    participantScoreB,
    ppdInputs,
    scoreA,
    scoreB,
    winnerParticipantId
  ]);

  function updateLineup(legNumber: number, side: LineupSide, index: number, userId: string) {
    setLineups((current) =>
      current.map((lineup) => {
        if (lineup.legNumber !== legNumber) return lineup;
        const key = side === "A" ? "participantAUserIds" : "participantBUserIds";
        const nextIds = [...lineup[key]];
        nextIds[index] = userId;
        return { ...lineup, [key]: nextIds };
      })
    );
  }

  function confirmLineups() {
    const invalid = rules.some((rule) => {
      const lineup = lineups.find((item) => item.legNumber === rule.legNumber);
      return (
        hasEmptyOrDuplicate(lineup?.participantAUserIds || [], lineupCount(rule, participantA.members || [])) ||
        hasEmptyOrDuplicate(lineup?.participantBUserIds || [], lineupCount(rule, participantB.members || []))
      );
    });

    if (invalid) {
      setMessage("请先确认每局双方出场名单，且同一方同一局不能重复选择同一名队员。");
      return;
    }

    setLineupConfirmed(true);
    setMessage("");
    setDraftStatus(onSaveDraft ? "saving" : "idle");
  }

  function clearPpdInput(userId: string) {
    setPpdInputs((current) => {
      if (!(userId in current)) return current;
      const next = { ...current };
      delete next[userId];
      return next;
    });
  }

  function updateStatValue(userId: string, key: keyof ManualMatchStats, value: number | undefined) {
    setLegStats((current) => {
      const nextUserStats = { ...(current[userId] || {}) };
      if (value === undefined) {
        delete nextUserStats[key];
      } else {
        nextUserStats[key] = value;
      }

      const next = { ...current };
      if (Object.keys(nextUserStats).length === 0) {
        delete next[userId];
      } else {
        next[userId] = nextUserStats;
      }
      return next;
    });
  }

  function updateStat(userId: string, key: keyof ManualMatchStats, rawValue: string) {
    if (key === "averageScore") clearPpdInput(userId);
    updateStatValue(userId, key, optionalNumber(rawValue));
  }

  function updatePpdAverage(userId: string, rawValue: string) {
    setPpdInputs((current) => {
      if (rawValue.trim() === "") {
        const next = { ...current };
        delete next[userId];
        return next;
      }
      return { ...current, [userId]: rawValue };
    });

    const ppd = optionalNumber(rawValue);
    updateStatValue(userId, "averageScore", ppd === undefined ? undefined : ppdToPpr(ppd));
  }

  function resetCurrentLegForm() {
    setCurrentWinner("");
    setParticipantScoreA("");
    setParticipantScoreB("");
    setLegStats({});
    setPpdInputs({});
  }

  function resetMatch() {
    setCurrentLegIndex(0);
    setScoreA(0);
    setScoreB(0);
    setWinnerParticipantId(null);
    setLegEntries([]);
    setMessage("");
    setDraftStatus("idle");
    setIsSaved(false);
    resetCurrentLegForm();
    submissionIdRef.current = createResultSubmissionId();
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    lastDraftSignatureRef.current = "";
    if (onClearDraft) void onClearDraft().catch(() => setDraftStatus("error"));
  }

  function completeCurrentLeg() {
    if (!currentRule || !currentLineup) return;

    const sideScoreA = optionalNumber(participantScoreA);
    const sideScoreB = optionalNumber(participantScoreB);
    let legWinner = currentWinner;

    if (needsSideScores) {
      if (sideScoreA === undefined || sideScoreB === undefined) {
        setMessage("本局需要录入双方机器分数。");
        return;
      }
      if (!legWinner) {
        if (sideScoreA === sideScoreB) {
          setMessage("双方分数相同，请手动选择本局胜方。");
          return;
        }
        legWinner = sideScoreA > sideScoreB ? participantA.id : participantB.id;
      }
    }

    if (!legWinner) {
      setMessage("请选择本局胜方。");
      return;
    }

    const nextScoreA = scoreA + (legWinner === participantA.id ? 1 : 0);
    const nextScoreB = scoreB + (legWinner === participantB.id ? 1 : 0);
    const nextEntries = [
      ...legEntries,
      {
        legNumber: currentRule.legNumber,
        winnerParticipantId: legWinner,
        scoreA: sideScoreA,
        scoreB: sideScoreB,
        userStats: Object.fromEntries(
          Object.entries(legStats)
            .map(([userId, stats]) => [userId, compactManualStats(stats)])
            .filter(([, stats]) => Object.keys(stats as ManualMatchStats).length > 0)
        ) as Record<string, ManualMatchStats>
      }
    ];

    const isLastConfiguredLeg = currentLegIndex >= rules.length - 1;
    const majorityWinnerReached = Math.max(nextScoreA, nextScoreB) >= legsNeeded(rules.length);
    const shouldFinish =
      matchFinishMode === "majority"
        ? majorityWinnerReached
        : isLastConfiguredLeg && nextScoreA !== nextScoreB;

    setLegEntries(nextEntries);
    setScoreA(nextScoreA);
    setScoreB(nextScoreB);
    setMessage("");
    setDraftStatus(onSaveDraft ? "saving" : "idle");
    setIsSaved(false);

    if (shouldFinish) {
      setWinnerParticipantId(nextScoreA > nextScoreB ? participantA.id : participantB.id);
      resetCurrentLegForm();
      return;
    }

    if (isLastConfiguredLeg) {
      setMessage("全部局数已录完但总比分相同，请检查赛制或比分。");
      return;
    }

    setCurrentLegIndex((index) => index + 1);
    resetCurrentLegForm();
  }

  function saveResult() {
    if (!winnerParticipantId || isSaved || isPending) return;
    const userStats = aggregateUserStats(legEntries);
    const legResults = legEntries.map((entry): MatchLegResult => {
      const rule = rules.find((item) => item.legNumber === entry.legNumber) || rules[0];
      const lineup = lineups.find((item) => item.legNumber === entry.legNumber) || {
        legNumber: entry.legNumber,
        participantAUserIds: [],
        participantBUserIds: []
      };
      const checkoutScore = highestCheckout(entry.userStats);

      return {
        ...lineup,
        winnerParticipantId: entry.winnerParticipantId,
        participantMode: rule.participantMode,
        dartMode: rule.dartMode,
        gameVariant: rule.gameVariant,
        checkoutScore: checkoutScore > 0 ? checkoutScore : null,
        scoreA: entry.scoreA,
        scoreB: entry.scoreB,
        userStats: entry.userStats
      };
    });

    startTransition(async () => {
      try {
        await onComplete({
          submissionId: submissionIdRef.current,
          winnerParticipantId,
          scoreA,
          scoreB,
          turns: [],
          legResults,
          legLineups: lineups,
          userStats
        });
        setIsSaved(true);
        setDraftStatus("idle");
        setMessage(successMessage);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "保存失败，请稍后重试。");
      }
    });
  }

  if (rules.length === 0) {
    return (
      <div className="rounded-lg border border-wire bg-surface p-4 text-sm font-semibold text-muted shadow-soft">
        当前比赛没有可用的软镖局配置。
      </div>
    );
  }

  if (!lineupConfirmed) {
    return (
      <div className="grid gap-4 rounded-lg border border-wire bg-surface p-4 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-field text-board">
            <UsersRound className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-xl font-black">确认出场顺序</h2>
            <p className="mt-1 text-sm text-muted">双方一起核对每局名单，确认后进入第一局录入。</p>
          </div>
        </div>

        <div className="grid gap-3">
          {rules.map((rule) => (
            <details key={rule.legNumber} className="rounded-lg bg-field p-3" open={rule.legNumber === rules[0]?.legNumber}>
              <summary className="cursor-pointer">
                <div className="font-bold">{getLegRuleLabel(rule)}</div>
                <div className="mt-1 text-xs text-muted">
                  {rule.participantMode === "singles" ? "单人局" : rule.participantMode === "doubles" ? "双人局" : "团队局"}
                </div>
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <LineupSideFields
                  participantName={participantA.name}
                  members={participantA.members || []}
                  selectedUserIds={
                    lineups.find((lineup) => lineup.legNumber === rule.legNumber)?.participantAUserIds || []
                  }
                  slotCount={lineupCount(rule, participantA.members || [])}
                  onChange={(index, userId) => updateLineup(rule.legNumber, "A", index, userId)}
                />
                <LineupSideFields
                  participantName={participantB.name}
                  members={participantB.members || []}
                  selectedUserIds={
                    lineups.find((lineup) => lineup.legNumber === rule.legNumber)?.participantBUserIds || []
                  }
                  slotCount={lineupCount(rule, participantB.members || [])}
                  onChange={(index, userId) => updateLineup(rule.legNumber, "B", index, userId)}
                />
              </div>
            </details>
          ))}
        </div>

        {message ? <p className="text-sm font-semibold text-accent">{message}</p> : null}
        <div className="flex justify-end">
          <Button type="button" onClick={confirmLineups}>
            <Check className="h-4 w-4" aria-hidden />
            确认并开始第一局
          </Button>
        </div>
      </div>
    );
  }

  if (winnerParticipantId) {
    const userStats = aggregateUserStats(legEntries);
    const winnerName = winnerParticipantId === participantA.id ? participantA.name : participantB.name;

    return (
      <div className="grid gap-3 rounded-lg">
        <section className="rounded-lg border border-board bg-surface p-4 shadow-soft">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-board p-2 text-white">
                <Trophy className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <div className="text-sm font-semibold text-muted">比赛结算</div>
                <h2 className="text-xl font-black">{winnerName} 获胜</h2>
              </div>
            </div>
            <div className="text-2xl font-black text-board">
              {scoreA}:{scoreB}
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-wire bg-surface p-3 shadow-soft">
            <h3 className="font-bold">逐局结果</h3>
            <div className="mt-3 grid gap-2">
              {legEntries.map((entry) => {
                const rule = rules.find((item) => item.legNumber === entry.legNumber) || rules[0];
                const entryWinner = entry.winnerParticipantId === participantA.id ? participantA.name : participantB.name;

                return (
                  <div key={entry.legNumber} className="rounded-lg bg-field p-3 text-sm">
                    <div className="font-bold">
                      第 {entry.legNumber} 局 / {entryWinner}
                    </div>
                    <div className="mt-1 text-xs text-muted">{getLegRuleLabel(rule)}</div>
                    {entry.scoreA !== undefined || entry.scoreB !== undefined ? (
                      <div className="mt-1 text-xs font-semibold text-board">
                        机器分 {entry.scoreA ?? "-"}:{entry.scoreB ?? "-"}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-wire bg-surface p-3 shadow-soft">
            <h3 className="font-bold">个人数据</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {Object.entries(userStats).map(([userId, stats]) => (
                <div key={userId} className="rounded-lg bg-field p-3">
                  <div className="truncate text-xs font-bold text-muted">{memberNames.get(userId) || userId}</div>
                  <SoftStatsSummary stats={stats} />
                </div>
              ))}
              {Object.keys(userStats).length === 0 ? (
                <p className="text-sm text-muted">本场没有录入个人扩展数据。</p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-wire bg-surface p-3 shadow-soft">
          <div className="text-sm font-semibold text-muted">{message || "确认无误后保存本场结果。"}</div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={resetMatch}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              重开
            </Button>
            <Button type="button" onClick={saveResult} disabled={isPending || isSaved}>
              <Save className="h-4 w-4" aria-hidden />
              {isSaved ? "已保存" : saveLabel}
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-lg">
      <section className="rounded-lg border border-wire bg-surface p-3 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-muted">第 {currentRule.legNumber} 局 / 共 {rules.length} 局</div>
            <h2 className="mt-1 text-xl font-black">{getLegRuleLabel(currentRule)}</h2>
            {draftStatusLabel ? (
              <div className="mt-1 text-xs font-black text-board">中断续赛：{draftStatusLabel}</div>
            ) : null}
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-muted">总比分</div>
            <div className="text-3xl font-black text-board">
              {scoreA}:{scoreB}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 rounded-lg border border-wire bg-surface p-3 shadow-soft">
        <div className="grid gap-2 sm:grid-cols-2">
          <WinnerButton
            active={currentWinner === participantA.id}
            name={participantA.name}
            onClick={() => setCurrentWinner(participantA.id)}
          />
          <WinnerButton
            active={currentWinner === participantB.id}
            name={participantB.name}
            onClick={() => setCurrentWinner(participantB.id)}
          />
        </div>

        {needsSideScores ? (
          <div className="grid gap-2 rounded-lg bg-field p-3 sm:grid-cols-2">
            <label className="label">
              {participantA.name} 机器分
              <input
                className="form-input"
                inputMode="numeric"
                min={0}
                type="number"
                value={participantScoreA}
                onChange={(event) => setParticipantScoreA(event.target.value)}
              />
            </label>
            <label className="label">
              {participantB.name} 机器分
              <input
                className="form-input"
                inputMode="numeric"
                min={0}
                type="number"
                value={participantScoreB}
                onChange={(event) => setParticipantScoreB(event.target.value)}
              />
            </label>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-wire bg-surface p-3 shadow-soft">
        <h3 className="font-bold">本局个人数据</h3>
        <div className="mt-3 grid gap-3">
          {currentUsers.map((player, index) => (
            <details key={player.userId} className="rounded-lg bg-field p-3" open={index === 0}>
              <summary className="cursor-pointer text-sm font-bold">
                <PlayerIdentity
                  name={composeParticipantMemberName(player.sideName, player.name)}
                  avatarUrl={player.avatarUrl}
                  size="sm"
                  compact
                />
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                {currentFields.map((field) =>
                  field.key === "averageScore" ? (
                    <div
                      key={`${player.userId}-${field.key}`}
                      className="grid gap-2 rounded-lg border border-board/20 bg-surface p-2 sm:col-span-2"
                    >
                      <div className="text-xs font-black text-board">01 均分</div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="label">
                          PPR
                          <input
                            className="form-input"
                            inputMode="decimal"
                            min={0}
                            step={field.step || "0.01"}
                            type="number"
                            value={legStats[player.userId]?.averageScore ?? ""}
                            onChange={(event) => updateStat(player.userId, "averageScore", event.target.value)}
                          />
                        </label>
                        <label className="label">
                          PPD
                          <input
                            className="form-input"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            type="number"
                            value={ppdInputs[player.userId] ?? ""}
                            placeholder={
                              legStats[player.userId]?.averageScore !== undefined
                                ? String(pprToPpd(legStats[player.userId]?.averageScore || 0))
                                : "自动换算"
                            }
                            onChange={(event) => updatePpdAverage(player.userId, event.target.value)}
                          />
                        </label>
                      </div>
                      <p className="text-[11px] font-semibold text-muted">输入 PPD 会自动换算为 PPR 后提交。</p>
                    </div>
                  ) : (
                    <label key={`${player.userId}-${field.key}`} className="label">
                      {field.label}
                      <input
                        className="form-input"
                        inputMode={field.integer ? "numeric" : "decimal"}
                        min={0}
                        step={field.step || "1"}
                        type="number"
                        value={legStats[player.userId]?.[field.key] ?? ""}
                        onChange={(event) => updateStat(player.userId, field.key, event.target.value)}
                      />
                    </label>
                  )
                )}
              </div>
            </details>
          ))}
          {currentUsers.length === 0 ? (
            <p className="rounded-lg bg-field p-3 text-sm text-muted">当前局没有可记录的队员名单。</p>
          ) : null}
        </div>
      </section>

      {message ? <p className="text-sm font-semibold text-accent">{message}</p> : null}

      <section className="flex flex-wrap justify-between gap-2 rounded-lg border border-wire bg-surface p-3 shadow-soft">
        <Button type="button" variant="secondary" onClick={resetMatch}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          重开
        </Button>
        <Button type="button" onClick={completeCurrentLeg}>
          {currentLegIndex >= rules.length - 1 ? "保存本局，进入结算" : "保存本局，下一局"}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </section>
    </div>
  );
}

function LineupSideFields({
  participantName,
  members,
  selectedUserIds,
  slotCount,
  onChange
}: {
  participantName: string;
  members: PlayerOption[];
  selectedUserIds: string[];
  slotCount: number;
  onChange: (index: number, userId: string) => void;
}) {
  if (slotCount === 0) {
    return (
      <div className="rounded-lg border border-wire bg-surface p-3 text-sm text-muted">
        {participantName} 暂无可选队员
      </div>
    );
  }

  return (
    <div className="grid gap-2 rounded-lg border border-wire bg-surface p-3">
      <div className="text-sm font-bold">{participantName}</div>
      {Array.from({ length: slotCount }, (_, index) => (
        <label key={`${participantName}-${index}`} className="label">
          {slotCount === 1 ? "出场选手" : `第 ${index + 1} 顺位`}
          <select
            className="form-input"
            value={selectedUserIds[index] || ""}
            onChange={(event) => onChange(index, event.target.value)}
          >
            <option value="">选择队员</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

function WinnerButton({
  active,
  name,
  onClick
}: {
  active: boolean;
  name: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`min-h-16 touch-manipulation select-none rounded-lg border px-4 text-left transition-colors duration-75 ${
        active ? "border-board bg-board text-white" : "border-wire bg-field text-ink active:bg-surface"
      }`}
      onClick={onClick}
    >
      <span className="block text-xs font-bold opacity-75">本局胜方</span>
      <span className="mt-1 block truncate text-lg font-black">{name}</span>
    </button>
  );
}

function SoftStatsSummary({ stats }: { stats: ManualMatchStats }) {
  const rows = [
    ["均分", stats.averageScore ?? stats.averagePer3Darts],
    ["MPR", stats.averageMpr],
    ["帽子", stats.countHatTrick],
    ["TON80", stats.countTon80],
    ["最高拆", stats.highestCheckout],
    ["白马", stats.countWhiteHorse],
    ["9 Mark", stats.count9Marks],
    ["高分", stats.highestTurnScore ?? stats.totalScoredPoints]
  ].filter(([, value]) => value !== undefined && value !== null && value !== 0);

  if (rows.length === 0) return <p className="mt-2 text-xs text-muted">无扩展数据</p>;

  return (
    <dl className="mt-2 grid grid-cols-3 gap-1.5 text-xs">
      {rows.map(([label, value]) => (
        <div key={String(label)} className="rounded bg-surface p-2">
          <dt className="truncate text-[11px] text-muted">{label}</dt>
          <dd className="font-black">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
