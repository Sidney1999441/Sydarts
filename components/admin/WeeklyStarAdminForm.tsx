"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Save, ShieldCheck } from "lucide-react";
import {
  updateWeeklyStarOverrideAction,
  type WeeklyStarActionState
} from "@/lib/actions/weekly-stars";
import { formatWeeklyStarWeek } from "@/lib/tournaments/weekly-stars";
import { Button } from "@/components/ui/Button";

const initialState: WeeklyStarActionState = { ok: false, message: null, error: null };

export function WeeklyStarAdminForm({
  tournamentId,
  players,
  overrides,
  defaultDate,
  maxDate,
  databaseReady
}: {
  tournamentId: string;
  players: Array<{ userId: string; name: string; teamName: string }>;
  overrides: Array<{ weekStart: string; userId: string; playerName: string; reason: string }>;
  defaultDate: string;
  maxDate: string;
  databaseReady: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(updateWeeklyStarOverrideAction, initialState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  return (
    <div className="grid gap-4">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-board" aria-hidden />
          <h2 className="text-lg font-black">人工调整</h2>
        </div>
        <p className="mt-1 text-sm font-semibold text-muted">
          选择过去任意日期，系统会自动归入该日期所在的周一至周日。人工调整会覆盖该周自动结果，但不会改动比赛数据。
        </p>
      </div>

      {!databaseReady ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900" role="alert">
          数据库尚未应用 <code>023_tournament_weekly_stars.sql</code>，当前可以预览自动评选，但不能保存人工调整。
        </p>
      ) : null}

      <form action={formAction} className="grid gap-4 rounded-lg border border-wire bg-field/65 p-4">
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="label">
            所属周
            <input className="form-input" type="date" name="week_date" defaultValue={defaultDate} max={maxDate} required />
          </label>
          <label className="label">
            赛事之星
            <select className="form-input" name="user_id" defaultValue="">
              <option value="">选择参赛选手</option>
              {players.map((player) => (
                <option key={player.userId} value={player.userId}>
                  {player.name}{player.teamName ? ` / ${player.teamName}` : ""} / ID {player.userId.slice(0, 6)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="label">
          评选理由（可选）
          <textarea
            className="form-input min-h-24 resize-y"
            name="reason"
            maxLength={240}
            placeholder="例如：关键局逆转，帮助队伍拿下本周决定性胜利。"
          />
        </label>
        {state.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.message ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800" role="status">
            {state.message}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="intent" value="save" disabled={!databaseReady || players.length === 0} pendingText="保存中">
            <Save className="h-4 w-4" aria-hidden />
            保存人工评定
          </Button>
          <Button type="submit" name="intent" value="reset" variant="secondary" disabled={!databaseReady} pendingText="恢复中">
            <RotateCcw className="h-4 w-4" aria-hidden />
            恢复该周自动评选
          </Button>
        </div>
      </form>

      {overrides.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-black text-ink">当前人工评定</h3>
          {overrides.map((override) => (
            <div key={override.weekStart} className="grid gap-1 rounded-lg border border-wire bg-surface px-3 py-2 sm:grid-cols-[auto_1fr] sm:gap-4">
              <span className="text-sm font-black text-board">{formatWeeklyStarWeek(override.weekStart)}</span>
              <span className="min-w-0 text-sm font-semibold text-muted">
                <strong className="text-ink">{override.playerName}</strong>
                {override.reason ? `：${override.reason}` : "：未填写理由"}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
