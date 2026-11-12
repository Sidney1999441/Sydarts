"use client";

import { useActionState, useState } from "react";
import { savePlayoffRoundRulesAction } from "@/lib/actions/tournaments";
import { playoffLegCounts } from "@/lib/darts/playoff-rules";
import { coerceRuleToDartMode, legParticipantModeOptions, matchFinishModeOptions, softGameOptions, steelLegGameOptions } from "@/lib/darts/variants";
import { Button } from "@/components/ui/Button";
import type { MatchDartMode, MatchLegRule } from "@/types/domain";

export function PlayoffRoundRulesForm({
  tournamentId, roundNumber, initialRules, finishMode, firstThrowMode, teamSize
}: {
  tournamentId: string;
  roundNumber: number;
  initialRules: MatchLegRule[];
  finishMode: string;
  firstThrowMode: string;
  teamSize: number;
}) {
  const [state, action, pending] = useActionState(savePlayoffRoundRulesAction, { message: "", ok: false });
  const [rules, setRules] = useState(initialRules);
  const [finish, setFinish] = useState(finishMode);
  const [firstThrow, setFirstThrow] = useState(firstThrowMode);
  const dartMode = rules[0].dartMode;
  const games = dartMode === "soft" ? softGameOptions : steelLegGameOptions;

  function updateLeg(index: number, changes: Partial<MatchLegRule>) {
    setRules((current) => current.map((rule, i) => i === index ? { ...rule, ...changes } : rule));
  }

  return (
    <form action={action} className="mt-4 grid gap-3">
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="round_number" value={roundNumber} />
      <fieldset disabled={pending} className="grid min-w-0 gap-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="label">镖种
            <select className="form-input" name="dart_mode" value={dartMode} onChange={(event) => {
              const mode = event.target.value as MatchDartMode;
              setRules((current) => current.map((rule) => coerceRuleToDartMode(rule, mode)));
            }}>
              <option value="steel">硬镖</option><option value="soft">软镖</option>
            </select>
          </label>
          <label className="label">局数
            <select className="form-input" name="leg_count" value={rules.length} onChange={(event) => {
              const count = Number(event.target.value);
              setRules((current) => Array.from({ length: count }, (_, index) => current[index] ||
                { ...current[current.length - 1], legNumber: index + 1 }));
            }}>
              {playoffLegCounts.map((count) => <option key={count} value={count}>{count} 局</option>)}
            </select>
          </label>
          <label className="label">结束方式
            <select className="form-input" name="match_finish_mode" value={finish} onChange={(event) => setFinish(event.target.value)}>
              {matchFinishModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="label">先手规则
            <select className="form-input" name="first_throw_mode" value={firstThrow} onChange={(event) => setFirstThrow(event.target.value)}>
              <option value="">沿用赛事设置</option><option value="alternate">轮流先手</option>
              <option value="winner">胜方先手</option><option value="loser">负方先手</option>
            </select>
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rules.map((rule, index) => (
            <div key={rule.legNumber} className="grid grid-cols-2 gap-2 rounded-lg border border-wire p-3">
              <div className="col-span-2 text-sm font-bold">第 {rule.legNumber} 局</div>
              <label className="label">项目
                <select className="form-input" name={`game_variant_${rule.legNumber}`} value={rule.gameVariant} onChange={(event) => {
                  const variant = event.target.value as MatchLegRule["gameVariant"];
                  const doublesOnly = softGameOptions.some((game) => game.value === variant && game.doublesOnly);
                  updateLeg(index, { gameVariant: variant, ...(doublesOnly ? { participantMode: "doubles" } : {}) });
                }}>
                  {games.filter((game) => teamSize > 1 || !("doublesOnly" in game && game.doublesOnly))
                    .map((game) => <option key={game.value} value={game.value}>{game.label}</option>)}
                </select>
              </label>
              <label className="label">出场形式
                <select className="form-input" name={`participant_mode_${rule.legNumber}`} value={rule.participantMode} onChange={(event) =>
                  updateLeg(index, { participantMode: event.target.value as MatchLegRule["participantMode"] })
                }>
                  {legParticipantModeOptions.filter((option) => teamSize > 1 || option.value === "singles")
                    .map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
          ))}
        </div>
        <div><Button type="submit" disabled={pending}>{pending ? "保存中…" : "保存本轮规则"}</Button></div>
      </fieldset>
      {state.message ? <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-board" : "text-sm text-red-700"}>{state.message}</p> : null}
    </form>
  );
}
