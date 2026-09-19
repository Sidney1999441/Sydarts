"use client";
import { useEffect, useRef, useState } from "react";
import { Save, X } from "lucide-react";
import {
  getSoftStatFields,
  isSoftHighScoreVariant,
  isValidMpr,
  ppdToPpr,
  type ManualMatchStats,
} from "@/lib/darts/soft-stats";
import type { SoftLegEntry } from "@/lib/scorer/soft-leg-correction";
import type { MatchLegRule } from "@/types/domain";
import { Button } from "@/components/ui/Button";

export function SoftLegCorrectionDialog({
  entry,
  rule,
  participantA,
  participantB,
  users,
  onSave,
  onClose,
}: {
  entry: SoftLegEntry;
  rule: MatchLegRule;
  participantA: { id: string; name: string };
  participantB: { id: string; name: string };
  users: Array<{ id: string; name: string; side: "A" | "B" }>;
  onSave: (entry: SoftLegEntry) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [winner, setWinner] = useState(entry.winnerParticipantId);
  const [stats, setStats] = useState<Record<string, ManualMatchStats>>(
    structuredClone(entry.userStats),
  );
  const [scoreA, setScoreA] = useState(entry.scoreA?.toString() || "");
  const [scoreB, setScoreB] = useState(entry.scoreB?.toString() || "");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const highScore = isSoftHighScoreVariant(rule.gameVariant);
  const sideScores = highScore || rule.gameVariant === "soft_half_it";
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const update = (id: string, key: keyof ManualMatchStats, value: string) =>
    setStats((old) => ({
      ...old,
      [id]: { ...old[id], [key]: value === "" ? undefined : Number(value) },
    }));
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="correct-leg-title"
      className="w-[calc(100%-24px)] max-w-xl rounded-lg border border-wire bg-surface p-0 text-ink shadow-xl backdrop:bg-black/50"
    >
      <form
        className="grid max-h-[85dvh] gap-4 overflow-y-auto p-4"
        onChange={() => {
          setConfirming(false);
          setError("");
        }}
        onSubmit={(event) => {
          event.preventDefault();
          try {
            if (sideScores && (scoreA === "" || scoreB === ""))
              throw new Error("请填写双方机器分数。");
            const nextStats = structuredClone(stats);
            if (highScore)
              for (const player of users) {
                if (users.filter((u) => u.side === player.side).length === 1) {
                  const score = Number(player.side === "A" ? scoreA : scoreB);
                  nextStats[player.id] = {
                    ...nextStats[player.id],
                    highestTurnScore: score,
                    totalScoredPoints: score,
                  };
                }
              }
            if (
              Object.values(nextStats).some(
                (stat) => !isValidMpr(stat.averageMpr),
              )
            )
              throw new Error("MPR 必须小于 10。");
            if (!confirming) {
              setConfirming(true);
              return;
            }
            onSave({
              ...entry,
              winnerParticipantId: winner,
              scoreA: sideScores ? Number(scoreA) : entry.scoreA,
              scoreB: sideScores ? Number(scoreB) : entry.scoreB,
              userStats: nextStats,
            });
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "修改失败，请重试。",
            );
          }
        }}
      >
        <header className="flex items-center justify-between gap-2">
          <h2 id="correct-leg-title" className="text-lg font-black">
            修改第 {entry.legNumber} 局
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            title="关闭"
            className="grid h-11 w-11 place-items-center"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <label className="label">
          本局胜方
          <select
            className="form-input"
            value={winner}
            onChange={(e) => setWinner(e.target.value)}
            required
          >
            <option value={participantA.id}>{participantA.name}</option>
            <option value={participantB.id}>{participantB.name}</option>
          </select>
        </label>
        {sideScores ? (
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: participantA.name, score: scoreA, set: setScoreA },
              { name: participantB.name, score: scoreB, set: setScoreB },
            ].map((side, i) => (
              <label key={i} className="label">
                {side.name} 得分
                <input
                  className="form-input"
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={side.score}
                  onChange={(e) => side.set(e.target.value)}
                />
              </label>
            ))}
          </div>
        ) : null}
        {users.map((player) => (
          <fieldset
            key={player.id}
            className="min-w-0 border-t border-wire pt-3"
          >
            <legend className="break-words text-sm font-bold">
              {player.name}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {getSoftStatFields(rule.gameVariant)
                .filter(
                  (field) =>
                    !(
                      highScore &&
                      ["highestTurnScore", "totalScoredPoints"].includes(
                        field.key,
                      )
                    ),
                )
                .map((field) => (
                  <label key={field.key} className="label">
                    {field.label}
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      step={field.step || "1"}
                      value={stats[player.id]?.[field.key] ?? ""}
                      onChange={(e) =>
                        update(player.id, field.key, e.target.value)
                      }
                    />
                  </label>
                ))}
              {getSoftStatFields(rule.gameVariant).some(
                (field) => field.key === "averageScore",
              ) ? (
                <label className="label">
                  PPD
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.01"
                    onChange={(e) => {
                      if (e.target.value)
                        update(
                          player.id,
                          "averageScore",
                          String(ppdToPpr(Number(e.target.value))),
                        );
                    }}
                  />
                </label>
              ) : null}
            </div>
          </fieldset>
        ))}
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {confirming ? (
          <p role="status" className="text-sm font-semibold text-board">
            确认修正本局成绩？其余已录局次将保留，总比分会重新计算。
          </p>
        ) : null}
        <Button type="submit">
          <Save className="h-4 w-4" />
          {confirming ? "确认保存" : "保存修正"}
        </Button>
      </form>
    </dialog>
  );
}
