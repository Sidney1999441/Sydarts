"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Search, UserRound, UsersRound, X } from "lucide-react";
import { completeCasualMatchAction } from "@/lib/actions/matches";
import { searchPlayerProfilesAction } from "@/lib/actions/users";
import {
  TouchScoreboard,
  type RoundLimit,
  type ScoringCompletePayload
} from "@/components/scorer/TouchScoreboard";
import { Button } from "@/components/ui/Button";
import { PlayerIdentity } from "@/components/ui/PlayerIdentity";

type GameScore = 501 | 701;
type BestOf = 3 | 5 | 7;
type OpponentMode = "local" | "linked";
type MatchMode = "singles" | "doubles";
type SetupStep = "setup" | "scoring";
type PlayerSearchResult = {
  id: string;
  uid?: string;
  displayName: string;
  avatarUrl?: string | null;
};
type LinkedPlayerSlot = "opponent" | "myTeammate" | "opponentTeammate";

const PLAYER_A_ID = "me";
const PLAYER_B_ID = "opponent";
const LOCAL_MY_TEAMMATE_ID = "local-my-teammate";
const LOCAL_OPPONENT_ID = "local-opponent";
const LOCAL_OPPONENT_TEAMMATE_ID = "local-opponent-teammate";

export function CasualScoreboard({
  playerId,
  playerName,
  playerAvatarUrl,
  recentOpponents = []
}: {
  playerId: string;
  playerName: string;
  playerAvatarUrl?: string | null;
  recentOpponents?: PlayerSearchResult[];
}) {
  const [step, setStep] = useState<SetupStep>("setup");
  const [opponentMode, setOpponentMode] = useState<OpponentMode>("local");
  const [matchMode, setMatchMode] = useState<MatchMode>("singles");
  const [opponentName, setOpponentName] = useState("对手");
  const [myTeammateName, setMyTeammateName] = useState("队友");
  const [opponentTeammateName, setOpponentTeammateName] = useState("对方队友");
  const [opponentQuery, setOpponentQuery] = useState("");
  const [myTeammateQuery, setMyTeammateQuery] = useState("");
  const [opponentTeammateQuery, setOpponentTeammateQuery] = useState("");
  const [selectedOpponent, setSelectedOpponent] = useState<PlayerSearchResult | null>(null);
  const [selectedMyTeammate, setSelectedMyTeammate] = useState<PlayerSearchResult | null>(null);
  const [selectedOpponentTeammate, setSelectedOpponentTeammate] = useState<PlayerSearchResult | null>(null);
  const [searchResults, setSearchResults] = useState<PlayerSearchResult[]>([]);
  const [myTeammateSearchResults, setMyTeammateSearchResults] = useState<PlayerSearchResult[]>([]);
  const [opponentTeammateSearchResults, setOpponentTeammateSearchResults] = useState<PlayerSearchResult[]>([]);
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
  const myTeammateDisplayName = selectedMyTeammate?.displayName || myTeammateName.trim() || "队友";
  const opponentTeammateDisplayName =
    selectedOpponentTeammate?.displayName || opponentTeammateName.trim() || "对方队友";
  const mySideName = isDoubles ? `${playerName} / ${myTeammateDisplayName}` : playerName;
  const opponentSideName = isDoubles ? `${opponentDisplayName} / ${opponentTeammateDisplayName}` : opponentDisplayName;
  const participantAMembers = useMemo(
    () => [
      { userId: playerId, name: playerName, avatarUrl: playerAvatarUrl || null, linked: true },
      ...(isDoubles
        ? [
            {
              userId: selectedMyTeammate?.id || LOCAL_MY_TEAMMATE_ID,
              name: myTeammateDisplayName,
              avatarUrl: selectedMyTeammate?.avatarUrl || null,
              linked: Boolean(selectedMyTeammate)
            }
          ]
        : [])
    ],
    [isDoubles, myTeammateDisplayName, playerAvatarUrl, playerId, playerName, selectedMyTeammate]
  );
  const participantBMembers = useMemo(
    () => [
      {
        userId: opponentMode === "linked" && selectedOpponent ? selectedOpponent.id : LOCAL_OPPONENT_ID,
        name: opponentDisplayName,
        avatarUrl: selectedOpponent?.avatarUrl || null,
        linked: opponentMode === "linked" && Boolean(selectedOpponent)
      },
      ...(isDoubles
        ? [
            {
              userId:
                opponentMode === "linked" && selectedOpponentTeammate
                  ? selectedOpponentTeammate.id
                  : LOCAL_OPPONENT_TEAMMATE_ID,
              name: opponentTeammateDisplayName,
              avatarUrl: selectedOpponentTeammate?.avatarUrl || null,
              linked: opponentMode === "linked" && Boolean(selectedOpponentTeammate)
            }
          ]
        : [])
    ],
    [isDoubles, opponentDisplayName, opponentMode, opponentTeammateDisplayName, selectedOpponent, selectedOpponentTeammate]
  );

  function searchProfiles(
    query: string,
    setResults: (results: PlayerSearchResult[]) => void,
    emptyMessage = "没有找到匹配的账号，请输入 6 位 UID 或显示名。"
  ) {
    setSetupMessage("");
    startSearchTransition(async () => {
      try {
        const results = await searchPlayerProfilesAction(query);
        if (results.length === 0) {
          setResults([]);
          setSetupMessage(emptyMessage);
          return;
        }
        setResults(results);
      } catch (error) {
        setSetupMessage(error instanceof Error ? error.message : "搜索失败，请稍后重试。");
      }
    });
  }

  function searchOpponents() {
    searchProfiles(opponentQuery, setSearchResults, "没有找到匹配的对手账号，请输入对手的 6 位 UID 或显示名。");
  }

  function selectedLinkedIds(slot?: LinkedPlayerSlot) {
    return [
      slot === "opponent" ? null : selectedOpponent?.id,
      slot === "myTeammate" ? null : selectedMyTeammate?.id,
      slot === "opponentTeammate" ? null : selectedOpponentTeammate?.id,
      playerId
    ].filter(Boolean) as string[];
  }

  function selectLinkedPlayer(slot: LinkedPlayerSlot, player: PlayerSearchResult) {
    if (selectedLinkedIds(slot).includes(player.id)) {
      setSetupMessage("同一个账号不能同时作为多个出场人。");
      return;
    }

    setSetupMessage("");
    if (slot === "opponent") {
      setOpponentMode("linked");
      setSelectedOpponent(player);
      setOpponentName(player.displayName);
      return;
    }
    if (slot === "myTeammate") {
      setSelectedMyTeammate(player);
      setMyTeammateName(player.displayName);
      return;
    }
    setSelectedOpponentTeammate(player);
    setOpponentTeammateName(player.displayName);
  }

  function clearLinkedPlayer(slot: LinkedPlayerSlot) {
    setSetupMessage("");
    if (slot === "opponent") {
      setSelectedOpponent(null);
      return;
    }
    if (slot === "myTeammate") {
      setSelectedMyTeammate(null);
      return;
    }
    setSelectedOpponentTeammate(null);
  }

  function startScoring() {
    if (opponentMode === "linked" && !selectedOpponent) {
      setSetupMessage("请选择一个对手账号，才能同步记录双方普通数据。");
      return;
    }
    const linkedIds = [...participantAMembers, ...participantBMembers]
      .filter((member) => member.linked)
      .map((member) => member.userId);
    if (new Set(linkedIds).size !== linkedIds.length) {
      setSetupMessage("同一个账号不能同时作为多个出场人。");
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
      <div className="codl-casual-score-shell grid gap-2">
        <section className="codl-casual-score-header relative overflow-hidden rounded-lg border border-wire bg-surface/95 px-2 py-1.5 shadow-[0_14px_34px_rgb(17_24_39/0.06)] sm:px-3 sm:py-2">
          <div className="codl-panel-art" aria-hidden />
          <div className="relative flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase text-board sm:text-xs">平时切磋</div>
              <h1 className="hidden truncate text-base font-black sm:block">
                {mySideName} vs {opponentSideName}
              </h1>
              <p className="truncate text-xs font-bold text-muted">
                {matchMode === "doubles" ? "双人" : "单人"} · {startingScore} · BO{bestOf}
                <span className="hidden sm:inline"> · {roundLimit === "unlimited" ? "不限轮" : `${roundLimit} 轮上限`} · {opponentMode === "linked" ? "双方确认后同步" : "只记录到我的普通数据"}</span>
              </p>
            </div>
            <Button className="min-h-9 px-3 text-xs sm:min-h-11 sm:text-sm" type="button" variant="secondary" onClick={() => setStep("setup")}>
              设置
            </Button>
          </div>
        </section>
        <TouchScoreboard
          participantA={{ id: PLAYER_A_ID, name: mySideName, avatarUrl: playerAvatarUrl || null, members: participantAMembers }}
          participantB={{ id: PLAYER_B_ID, name: opponentSideName, avatarUrl: selectedOpponent?.avatarUrl || null, members: participantBMembers }}
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
            <PlayerIdentity
              className="mt-2"
              name={playerName}
              avatarUrl={playerAvatarUrl}
              subtitle="当前登录选手"
              size="md"
            />
           {isDoubles ? (
              <div className="mt-3 grid gap-3">
                <label className="label">
                  我方队友
                  <input
                    className="form-input"
                    value={myTeammateName}
                    onChange={(event) => {
                      setMyTeammateName(event.target.value);
                      setSelectedMyTeammate(null);
                    }}
                    placeholder="队友"
                  />
                </label>
                <AccountSearchBox
                  label="绑定我方队友账号"
                  query={myTeammateQuery}
                  selected={selectedMyTeammate}
                  results={myTeammateSearchResults}
                  onQueryChange={setMyTeammateQuery}
                  onSearch={() => searchProfiles(myTeammateQuery, setMyTeammateSearchResults)}
                  onSelect={(result) => selectLinkedPlayer("myTeammate", result)}
                  onClear={() => clearLinkedPlayer("myTeammate")}
                  disabled={isSearching}
                />
              </div>
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
                <AccountSearchBox
                  label="搜索对手账号"
                  query={opponentQuery}
                  selected={selectedOpponent}
                  results={searchResults}
                  recentOptions={recentOpponents}
                  onQueryChange={setOpponentQuery}
                  onSearch={searchOpponents}
                  onSelect={(result) => selectLinkedPlayer("opponent", result)}
                  onClear={() => clearLinkedPlayer("opponent")}
                  disabled={isSearching}
                />
              </div>
            )}
            {isDoubles ? (
              <div className="grid gap-3">
                <label className="label">
                  对方队友
                  <input
                    className="form-input"
                    value={opponentTeammateName}
                    onChange={(event) => {
                      setOpponentTeammateName(event.target.value);
                      setSelectedOpponentTeammate(null);
                    }}
                    placeholder="对方队友"
                  />
                </label>
                {opponentMode === "linked" ? (
                  <AccountSearchBox
                    label="绑定对方队友账号"
                    query={opponentTeammateQuery}
                    selected={selectedOpponentTeammate}
                    results={opponentTeammateSearchResults}
                    onQueryChange={setOpponentTeammateQuery}
                    onSearch={() => searchProfiles(opponentTeammateQuery, setOpponentTeammateSearchResults)}
                    onSelect={(result) => selectLinkedPlayer("opponentTeammate", result)}
                    onClear={() => clearLinkedPlayer("opponentTeammate")}
                    disabled={isSearching}
                  />
                ) : null}
              </div>
            ) : null}
            {isDoubles && opponentMode === "linked" ? (
              <p className="rounded-lg bg-field p-3 text-xs font-semibold text-muted">
                双人切磋会记录四个出镖人；已绑定账号会拆分统计。我方绑定成员保存后写入，对方绑定成员在对手确认后写入。
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

function AccountSearchBox({
  label,
  query,
  selected,
  results,
  recentOptions = [],
  onQueryChange,
  onSearch,
  onSelect,
  onClear,
  disabled
}: {
  label: string;
  query: string;
  selected: PlayerSearchResult | null;
  results: PlayerSearchResult[];
  recentOptions?: PlayerSearchResult[];
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onSelect: (player: PlayerSearchResult) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const selectableRecent = recentOptions.filter((player) => player.id !== selected?.id).slice(0, 6);

  return (
    <div className="grid gap-2 rounded-lg border border-wire bg-field p-3">
      <label className="label">
        {label}
        <div className="flex gap-2">
          <input
            className="form-input"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="输入 UID 或显示名"
          />
          <Button type="button" variant="secondary" onClick={onSearch} disabled={query.trim().length < 2 || disabled}>
            <Search className="h-4 w-4" aria-hidden />
            搜索
          </Button>
        </div>
      </label>

      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-board bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
          <PlayerIdentity
            name={selected.displayName}
            avatarUrl={selected.avatarUrl}
            subtitle={`已绑定 · UID ${selected.uid || "------"}`}
            size="sm"
            compact
          />
          <button
            type="button"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-emerald-200 bg-white text-emerald-800"
            onClick={onClear}
            aria-label="取消绑定"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {selectableRecent.length > 0 ? (
        <div>
          <div className="mb-2 text-xs font-bold text-muted">最近对手</div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {selectableRecent.map((player) => (
              <button
                key={player.id}
                type="button"
                className="shrink-0 touch-manipulation rounded-full border border-wire bg-surface px-2 py-1.5 text-left active:bg-field"
                onClick={() => onSelect(player)}
              >
                <PlayerIdentity
                  name={player.displayName}
                  avatarUrl={player.avatarUrl}
                  subtitle={player.uid ? `UID ${player.uid}` : null}
                  size="xs"
                  compact
                />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="grid gap-2">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              className={`touch-manipulation select-none rounded-lg border p-3 text-left transition-colors duration-75 ${
                selected?.id === result.id
                  ? "border-board bg-emerald-50"
                  : "border-wire bg-surface hover:bg-field active:bg-field"
              }`}
              onClick={() => onSelect(result)}
            >
              <PlayerIdentity
                name={result.displayName}
                avatarUrl={result.avatarUrl}
                subtitle={`UID ${result.uid || "------"} · ${result.id}`}
                size="sm"
                compact
              />
            </button>
          ))}
        </div>
      ) : null}
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
