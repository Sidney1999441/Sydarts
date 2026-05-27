"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Search, UserRound, UsersRound } from "lucide-react";
import { completeCasualMatchAction } from "@/lib/actions/matches";
import { searchPlayerProfilesAction } from "@/lib/actions/users";
import {
  TouchScoreboard,
  type ScoringCompletePayload
} from "@/components/scorer/TouchScoreboard";
import { Button } from "@/components/ui/Button";

type GameScore = 501 | 701;
type BestOf = 3 | 5 | 7;
type OpponentMode = "local" | "linked";
type SetupStep = "setup" | "scoring";
type PlayerSearchResult = {
  id: string;
  displayName: string;
};

const PLAYER_A_ID = "me";
const PLAYER_B_ID = "opponent";

export function CasualScoreboard({ playerName }: { playerName: string }) {
  const [step, setStep] = useState<SetupStep>("setup");
  const [opponentMode, setOpponentMode] = useState<OpponentMode>("local");
  const [opponentName, setOpponentName] = useState("对手");
  const [opponentQuery, setOpponentQuery] = useState("");
  const [selectedOpponent, setSelectedOpponent] = useState<PlayerSearchResult | null>(null);
  const [searchResults, setSearchResults] = useState<PlayerSearchResult[]>([]);
  const [startingScore, setStartingScore] = useState<GameScore>(501);
  const [bestOf, setBestOf] = useState<BestOf>(3);
  const [setupMessage, setSetupMessage] = useState("");
  const [isSearching, startSearchTransition] = useTransition();

  const opponentDisplayName =
    opponentMode === "linked"
      ? selectedOpponent?.displayName || "待选择对手"
      : opponentName.trim() || "对手";

  function searchOpponents() {
    setSetupMessage("");
    startSearchTransition(async () => {
      try {
        const results = await searchPlayerProfilesAction(opponentQuery);
        setSearchResults(results);
        if (results.length === 0) {
          setSetupMessage("没有找到匹配的账号，可以让对手在个人中心确认显示名或 profile id。");
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
      opponentName: opponentDisplayName,
      opponentUserId: opponentMode === "linked" ? selectedOpponent?.id : undefined,
      startingScore,
      bestOf,
      winnerSide: payload.winnerParticipantId === PLAYER_A_ID ? "A" : "B",
      scoreA: payload.scoreA,
      scoreB: payload.scoreB,
      turns: payload.turns
    });
  }

  if (step === "scoring") {
    return (
      <div className="grid gap-2">
        <section className="rounded-lg border border-wire bg-white px-3 py-2 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-500">平时切磋</div>
              <h1 className="truncate text-base font-black">
                {playerName} vs {opponentDisplayName}
              </h1>
              <p className="truncate text-xs text-slate-600">
                {startingScore} · BO{bestOf} · {opponentMode === "linked" ? "双方确认后同步" : "只记录到我的普通数据"}
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setStep("setup")}>
              设置
            </Button>
          </div>
        </section>
        <TouchScoreboard
          participantA={{ id: PLAYER_A_ID, name: playerName }}
          participantB={{ id: PLAYER_B_ID, name: opponentDisplayName }}
          startingScore={startingScore}
          bestOf={bestOf}
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
      <section className="rounded-lg border border-wire bg-white p-5 shadow-soft">
        <Link className="text-sm font-semibold text-board underline" href="/scorer">
          返回计分器
        </Link>
        <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-board">
          <UsersRound className="h-5 w-5" aria-hidden />
          创建切磋对战
        </div>
        <h1 className="mt-3 text-2xl font-bold">先选择双方和规则</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          对手只想临时打一局时，用“只记录我”；对手也想累计普通数据时，用“同步双方”，搜索并选择对手账号后再开始。
        </p>
      </section>

      <section className="rounded-lg border border-wire bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold">对阵双方</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-wire bg-field p-4">
            <div className="text-sm font-semibold text-slate-500">我方</div>
            <div className="mt-1 text-lg font-bold">{playerName}</div>
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
                      placeholder="输入显示名或 profile id"
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
                      className={`rounded-lg border p-3 text-left transition ${
                        selectedOpponent?.id === result.id
                          ? "border-board bg-emerald-50"
                          : "border-wire bg-white hover:bg-field"
                      }`}
                      onClick={() => {
                        setSelectedOpponent(result);
                        setSetupMessage("");
                      }}
                    >
                      <div className="font-bold">{result.displayName}</div>
                      <div className="mt-1 text-xs text-slate-500">{result.id}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-wire bg-white p-5 shadow-soft">
        <h2 className="text-lg font-bold">游戏和规则</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
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

function OptionGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-sm font-semibold text-slate-600">{label}</div>
      <div className="mt-2 grid grid-cols-3 gap-2">{children}</div>
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
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-bold transition ${
        active ? "border-board bg-board text-white" : "border-wire bg-white text-ink hover:bg-field"
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
      className={`min-h-12 rounded-lg border px-4 text-base font-black transition ${
        active ? "border-board bg-board text-white" : "border-wire bg-field text-ink hover:bg-white"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
