"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Search, UserRound, UsersRound } from "lucide-react";
import { completeCasualMatchAction } from "@/lib/actions/matches";
import { searchPlayerProfilesAction } from "@/lib/actions/users";
import {
  TouchScoreboard,
  type RoundLimit,
  type ScoringCompletePayload
} from "@/components/scorer/TouchScoreboard";
import { Button } from "@/components/ui/Button";

type GameScore = 501 | 701;
type BestOf = 3 | 5 | 7;
type OpponentMode = "local" | "linked";
type MatchMode = "singles" | "doubles";
type SetupStep = "setup" | "scoring";
type PlayerSearchResult = {
  id: string;
  uid?: string;
  displayName: string;
};

const PLAYER_A_ID = "me";
const PLAYER_B_ID = "opponent";
const LOCAL_MY_TEAMMATE_ID = "local-my-teammate";
const LOCAL_OPPONENT_ID = "local-opponent";
const LOCAL_OPPONENT_TEAMMATE_ID = "local-opponent-teammate";

export function CasualScoreboard({ playerId, playerName }: { playerId: string; playerName: string }) {
  const [step, setStep] = useState<SetupStep>("setup");
  const [opponentMode, setOpponentMode] = useState<OpponentMode>("local");
  const [matchMode, setMatchMode] = useState<MatchMode>("singles");
  const [opponentName, setOpponentName] = useState("对手");
  const [myTeammateName, setMyTeammateName] = useState("队友");
  const [opponentTeammateName, setOpponentTeammateName] = useState("对方队友");
  const [opponentQuery, setOpponentQuery] = useState("");
  const [selectedOpponent, setSelectedOpponent] = useState<PlayerSearchResult | null>(null);
  const [searchResults, setSearchResults] = useState<PlayerSearchResult[]>([]);
  const [startingScore, setStartingScore] = useState<GameScore>(501);
  const [bestOf, setBestOf] = useState<BestOf>(3);
  const [roundLimit, setRoundLimit] = useState<RoundLimit>("unlimited");
  const [setupMessage, setSetupMessage] = useState("");
  const [isSearching, startSearchTransition] = useTransition();

  const opponentDisplayName =
    opponentMode === "linked"
      ? selectedOpponent?.displayName || "待选择对手"
      : opponentName.trim() || "对手";
  const isDoubles = matchMode === "doubles";
  const myTeammateDisplayName = myTeammateName.trim() || "队友";
  const opponentTeammateDisplayName = opponentTeammateName.trim() || "对方队友";
  const mySideName = isDoubles ? `${playerName} / ${myTeammateDisplayName}` : playerName;
  const opponentSideName = isDoubles ? `${opponentDisplayName} / ${opponentTeammateDisplayName}` : opponentDisplayName;
  const participantAMembers = useMemo(
    () => [
      { userId: playerId, name: playerName, linked: true },
      ...(isDoubles ? [{ userId: LOCAL_MY_TEAMMATE_ID, name: myTeammateDisplayName, linked: false }] : [])
    ],
    [isDoubles, myTeammateDisplayName, playerId, playerName]
  );
  const participantBMembers = useMemo(
    () => [
      {
        userId: opponentMode === "linked" && selectedOpponent ? selectedOpponent.id : LOCAL_OPPONENT_ID,
        name: opponentDisplayName,
        linked: opponentMode === "linked" && Boolean(selectedOpponent)
      },
      ...(isDoubles ? [{ userId: LOCAL_OPPONENT_TEAMMATE_ID, name: opponentTeammateDisplayName, linked: false }] : [])
    ],
    [isDoubles, opponentDisplayName, opponentMode, opponentTeammateDisplayName, selectedOpponent]
  );

  function searchOpponents() {
    setSetupMessage("");
    startSearchTransition(async () => {
      try {
        const results = await searchPlayerProfilesAction(opponentQuery);
        setSearchResults(results);
        if (results.length === 0) {
          setSetupMessage("没有找到匹配的账号，请输入对手的 6 位 UID 或显示名。");
        }
      } catch (error) {
        setSetupMessage(error instanceof Error ? error.message : "搜索失败，请稍后重试。");
      }
    });
  }

  function startScoring() {
    if (opponentMode === "linked" && !selectedOpponent) {
      setSetupMessage("请选择一个对手账号，才能同步记录双方普通数据。");
      return;
    }
    setStep("scoring");
  }

  async function saveCasualResult(payload: ScoringCompletePayload) {
    await completeCasualMatchAction({
      submissionId: payload.submissionId,
      opponentName: opponentDisplayName,
      opponentUserId: opponentMode === "linked" ? selectedOpponent?.id : undefined,
      startingScore,
      bestOf,
      winnerSide: payload.winnerParticipantId === PLAYER_A_ID ? "A" : "B",
      scoreA: payload.scoreA,
      scoreB: payload.scoreB,
      participantMode: matchMode,
      participantMembers: {
        A: participantAMembers,
        B: participantBMembers
      },
      legResults: payload.legResults,
      legLineups: payload.legLineups,
      turns: payload.turns
    });
  }

  if (step === "scoring") {
    return (
      <div className="grid gap-2">
        <section className="relative overflow-hidden rounded-lg border border-wire bg-surface/95 px-3 py-2 shadow-[0_14px_34px_rgb(17_24_39/0.06)]">
          <div className="codl-panel-art" aria-hidden />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-black uppercase text-board">平时切磋</div>
              <h1 className="truncate text-base font-black">
                {mySideName} vs {opponentSideName}
              </h1>
              <p className="truncate text-xs text-muted">
                {matchMode === "doubles" ? "双人" : "单人"} · {startingScore} · BO{bestOf} · {roundLimit === "unlimited" ? "不限轮" : `${roundLimit} 轮上限`} · {opponentMode === "linked" ? "双方确认后同步" : "只记录到我的普通数据"}
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setStep("setup")}>
              设置
            </Button>
          </div>
        </section>
        <TouchScoreboard
          participantA={{ id: PLAYER_A_ID, name: mySideName, members: participantAMembers }}
          participantB={{ id: PLAYER_B_ID, name: opponentSideName, members: participantBMembers }}
          startingScore={startingScore}
          bestOf={bestOf}
          defaultParticipantMode={matchMode}
          initialRoundLimit={roundLimit}
          saveLabel="保存到普通数据"
          successMessage={
            opponentMode === "linked"
              ? "切磋结果已保存；对手确认后会写入对方普通数据。"
              : "切磋结果已保存到普通数据。"
          }
          onComplete={saveCasualResult}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <section className="relative overflow-hidden rounded-lg border border-wire bg-surface/95 p-5 shadow-[0_18px_45px_rgb(17_24_39/0.06)]">
        <div className="codl-panel-art" aria-hidden />
        <div className="relative">
          <Link className="text-sm font-semibold text-board underline" href="/scorer">
            返回计分器
          </Link>
          <div className="mt-4 flex items-center gap-2 text-sm font-black text-board">
            <UsersRound className="h-5 w-5" aria-hidden />
            创建切磋对战
          </div>
          <h1 className="mt-3 text-2xl font-black text-primary">先选择双方和规则</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-muted">
            对手只想临时打一局时，用“只记录我”；对手也想累计普通数据时，用“同步双方”，搜索并选择对手账号后再开始。
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-wire bg-surface/95 p-5 shadow-[0_14px_34px_rgb(17_24_39/0.05)]">
        <h2 className="text-lg font-bold">对阵双方</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-wire bg-field p-4">
            <div className="text-sm font-semibold text-muted">我方</div>
            <div className="mt-1 text-lg font-bold">{playerName}</div>
            {isDoubles ? (
              <label className="label mt-3">
                我方队友
                <input
                  className="form-input"
                  value={myTeammateName}
                  onChange={(event) => setMyTeammateName(event.target.value)}
                  placeholder="队友"
                />
              </label>
            ) : null}
          </div>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <ModeButton
                active={opponentMode === "local"}
                icon={<UserRound className="h-4 w-4" aria-hidden />}
                label="只记录我"
                onClick={() => {
                  setOpponentMode("local");
                  setSelectedOpponent(null);
                  setSetupMessage("");
                }}
              />
              <ModeButton
                active={opponentMode === "linked"}
                icon={<UsersRound className="h-4 w-4" aria-hidden />}
                label="同步双方"
                onClick={() => {
                  setOpponentMode("linked");
                  setSetupMessage("");
                }}
              />
            </div>

            {opponentMode === "local" ? (
              <label className="label">
                对手名称
                <input
                  className="form-input"
                  value={opponentName}
                  onChange={(event) => setOpponentName(event.target.value)}
                  placeholder="对手"
                />
              </label>
            ) : (
              <div className="grid gap-3">
                <label className="label">
                  搜索对手账号
                  <div className="flex gap-2">
                    <input
                      className="form-input"
                      value={opponentQuery}
                      onChange={(event) => setOpponentQuery(event.target.value)}
                      placeholder="输入 6 位 UID 或显示名"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={searchOpponents}
                      disabled={opponentQuery.trim().length < 2 || isSearching}
                    >
                      <Search className="h-4 w-4" aria-hidden />
                      搜索
                    </Button>
                  </div>
                </label>
                {selectedOpponent ? (
                  <div className="rounded-lg border border-board bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
                    已选择 {selectedOpponent.displayName}
                  </div>
                ) : null}
                <div className="grid gap-2">
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      className={`touch-manipulation select-none rounded-lg border p-3 text-left transition-colors duration-75 ${
                        selectedOpponent?.id === result.id
                          ? "border-board bg-emerald-50"
                          : "border-wire bg-surface hover:bg-field active:bg-field"
                      }`}
                      onClick={() => {
                        setSelectedOpponent(result);
                        setSetupMessage("");
                      }}
                    >
                      <div className="font-bold">{result.displayName}</div>
                      <div className="mt-1 text-xs text-muted">UID {result.uid || "------"} · {result.id}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {isDoubles ? (
              <label className="label">
                对方队友
                <input
                  className="form-input"
                  value={opponentTeammateName}
                  onChange={(event) => setOpponentTeammateName(event.target.value)}
                  placeholder="对方队友"
                />
              </label>
            ) : null}
            {isDoubles && opponentMode === "linked" ? (
              <p className="rounded-lg bg-field p-3 text-xs font-semibold text-muted">
                双人切磋会同步当前账号和选中的对手账号，双方队友作为本场出镖人记录。
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-wire bg-surface p-5 shadow-soft">
        <h2 className="text-lg font-bold">游戏和规则</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <OptionGroup label="对局形式">
            <SelectButton
              active={matchMode === "singles"}
              label="单人"
              onClick={() => setMatchMode("singles")}
            />
            <SelectButton
              active={matchMode === "doubles"}
              label="双人"
              onClick={() => setMatchMode("doubles")}
            />
          </OptionGroup>
          <OptionGroup label="局制">
            {[501, 701].map((value) => (
              <SelectButton
                key={value}
                active={startingScore === value}
                label={String(value)}
                onClick={() => setStartingScore(value as GameScore)}
              />
            ))}
          </OptionGroup>
          <OptionGroup label="胜负规则">
            {[3, 5, 7].map((value) => (
              <SelectButton
                key={value}
                active={bestOf === value}
                label={`BO${value}`}
                onClick={() => setBestOf(value as BestOf)}
              />
            ))}
          </OptionGroup>
          <OptionGroup label="每局轮数上限" wide>
            {[
              { value: 10, label: "10" },
              { value: 15, label: "15" },
              { value: 20, label: "20" },
              { value: "unlimited", label: "无限" }
            ].map((option) => (
              <SelectButton
                key={String(option.value)}
                active={roundLimit === option.value}
                label={option.label}
                onClick={() => setRoundLimit(option.value as RoundLimit)}
              />
            ))}
          </OptionGroup>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {setupMessage ? <p className="text-sm font-semibold text-accent">{setupMessage}</p> : <span />}
        <Button type="button" onClick={startScoring}>
          开始计分
        </Button>
      </div>
    </div>
  );
}

function OptionGroup({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div>
      <div className="text-sm font-semibold text-muted">{label}</div>
      <div className={`mt-2 grid gap-2 ${wide ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>{children}</div>
    </div>
  );
}

function ModeButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-12 touch-manipulation select-none items-center justify-center gap-2 rounded-lg border px-3 text-sm font-bold transition-colors duration-75 ${
        active ? "border-board bg-board text-white" : "border-wire bg-surface text-ink hover:bg-field active:bg-field"
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function SelectButton({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`min-h-12 touch-manipulation select-none rounded-lg border px-4 text-base font-black transition-colors duration-75 ${
        active ? "border-board bg-board text-white" : "border-wire bg-field text-ink hover:bg-surface active:bg-surface"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
