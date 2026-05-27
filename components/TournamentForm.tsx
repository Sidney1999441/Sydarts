"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  dartModeOptions,
  getDefaultParticipantMode,
  getGameVariantLabel,
  getLegParticipantModeLabel,
  getLegRuleLabel,
  legParticipantModeOptions,
  matchFinishModeOptions,
  matchRuleModeOptions,
  softGameOptions,
  steelLegGameOptions,
  validateMatchLegRules
} from "@/lib/darts/variants";
import { toDatetimeLocal } from "@/lib/utils";
import type { LegGameVariant, MatchDartMode, MatchLegRule, MatchRuleMode, Tournament } from "@/types/domain";

export function TournamentForm({
  action,
  tournament
}: {
  action: (formData: FormData) => void | Promise<void>;
  tournament?: Partial<Tournament>;
}) {
  const type = tournament?.tournament_type || "doubles";
  const teamSize = tournament?.team_size || (type === "individual" ? 1 : 2);
  const initialDartMode: MatchDartMode = tournament?.dart_mode === "soft" ? "soft" : "steel";
  const [dartMode, setDartMode] = useState<MatchDartMode>(initialDartMode);
  const [matchRuleMode, setMatchRuleMode] = useState<MatchRuleMode>(
    tournament?.match_rule_mode === "custom_legs" ? "custom_legs" : "standard"
  );
  const [matchFinishMode, setMatchFinishMode] = useState(tournament?.match_finish_mode || "majority");
  const [rules, setRules] = useState<MatchLegRule[]>(() => {
    if (tournament?.match_leg_rules?.length) {
      return tournament.match_leg_rules.map((rule, index) => ({
        ...rule,
        legNumber: index + 1,
        dartMode: initialDartMode
      }));
    }

    return [
      {
        legNumber: 1,
        participantMode: getDefaultParticipantMode({ tournamentType: type, teamSize }),
        dartMode: initialDartMode,
        gameVariant: (initialDartMode === "soft" ? tournament?.soft_game || "soft_501" : String(tournament?.dart_game || 501)) as LegGameVariant
      }
    ];
  });

  const visibleRules = useMemo(
    () => rules.map((rule, index) => ({ ...rule, legNumber: index + 1, dartMode })),
    [rules, dartMode]
  );
  const ruleError = matchRuleMode === "custom_legs"
    ? validateMatchLegRules({ dartMode, rules: visibleRules, finishMode: matchFinishMode })
    : null;
  const firstRule = visibleRules[0];

  function updateDartMode(nextMode: MatchDartMode) {
    setDartMode(nextMode);
    setRules((current) =>
      current.map((rule) => ({
        ...rule,
        dartMode: nextMode,
        gameVariant: (nextMode === "soft" ? "soft_501" : "501") as LegGameVariant
      }))
    );
  }

  function updateRule(index: number, patch: Partial<MatchLegRule>) {
    setRules((current) =>
      current.map((rule, ruleIndex) =>
        ruleIndex === index
          ? {
              ...rule,
              ...patch,
              dartMode
            }
          : rule
      )
    );
  }

  function addRule() {
    setRules((current) => [
      ...current,
      {
        legNumber: current.length + 1,
        participantMode: getDefaultParticipantMode({ tournamentType: type, teamSize }),
        dartMode,
        gameVariant: (dartMode === "soft" ? "soft_501" : "501") as LegGameVariant
      }
    ]);
  }

  function removeRule(index: number) {
    setRules((current) =>
      current
        .filter((_, ruleIndex) => ruleIndex !== index)
        .map((rule, ruleIndex) => ({ ...rule, legNumber: ruleIndex + 1 }))
    );
  }

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="match_leg_rules" value={JSON.stringify(visibleRules)} />
      <input type="hidden" name="mixed_first_dart_mode" value="soft" />
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="label">
          赛事名称
          <input className="form-input" name="name" required defaultValue={tournament?.name || ""} />
        </label>
        <label className="label">
          地点
          <input className="form-input" name="location" defaultValue={tournament?.location || ""} />
        </label>
      </div>
      <label className="label">
        赛事说明
        <textarea className="form-input min-h-28" name="description" defaultValue={tournament?.description || ""} />
      </label>
      <div className="grid gap-4 lg:grid-cols-3">
        <label className="label">
          报名开始
          <input className="form-input" type="datetime-local" name="registration_start_at" required defaultValue={toDatetimeLocal(tournament?.registration_start_at)} />
        </label>
        <label className="label">
          报名截止
          <input className="form-input" type="datetime-local" name="registration_end_at" required defaultValue={toDatetimeLocal(tournament?.registration_end_at)} />
        </label>
        <label className="label">
          比赛开始
          <input className="form-input" type="datetime-local" name="tournament_start_at" required defaultValue={toDatetimeLocal(tournament?.tournament_start_at)} />
        </label>
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <label className="label">
          最大报名人数
          <input className="form-input" type="number" min={2} name="max_participants" defaultValue={tournament?.max_participants || 32} />
        </label>
        <label className="label">
          比赛类型
          <select className="form-input" name="tournament_type" defaultValue={type}>
            <option value="doubles">双人赛</option>
            <option value="team">队制赛</option>
            <option value="individual">个人赛</option>
          </select>
        </label>
        <label className="label">
          每队人数
          <input className="form-input" type="number" min={1} max={8} name="team_size" defaultValue={teamSize} />
        </label>
        <label className="label">
          赛制
          <select className="form-input" name="format" defaultValue={tournament?.format || "round_robin"}>
            <option value="round_robin">小组循环赛</option>
            <option value="single_elimination">单淘汰赛</option>
            <option value="double_elimination">双淘汰赛预留</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 rounded-lg border border-wire bg-field p-4">
        <div className="grid gap-4 lg:grid-cols-4">
          <label className="label">
            镖种
            <select
              className="form-input"
              name="dart_mode"
              value={dartMode}
              onChange={(event) => updateDartMode(event.target.value as MatchDartMode)}
            >
              {dartModeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <span className="text-xs font-normal text-slate-500">
              软硬式不能混合；软镖目前仅支持手动录入。
            </span>
          </label>
          <label className="label">
            赛制模式
            <select
              className="form-input"
              name="match_rule_mode"
              value={matchRuleMode}
              onChange={(event) => setMatchRuleMode(event.target.value as MatchRuleMode)}
            >
              {matchRuleModeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="label">
            结束方式
            <select
              className="form-input"
              name="match_finish_mode"
              value={matchFinishMode}
              onChange={(event) => setMatchFinishMode(event.target.value as "majority" | "play_all")}
            >
              {matchFinishModeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="label">
            标准胜负规则
            <select className="form-input" name="best_of" defaultValue={tournament?.best_of || 3}>
              <option value={3}>BO3</option>
              <option value={5}>BO5</option>
              <option value={7}>BO7</option>
            </select>
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="label">
            硬镖标准局制
            <select className="form-input" name="dart_game" defaultValue={tournament?.dart_game || 501}>
              {steelLegGameOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="label">
            软镖标准项目
            <select className="form-input" name="soft_game" defaultValue={tournament?.soft_game || "soft_501"}>
              {softGameOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}{option.doublesOnly ? "（仅双人）" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 rounded-lg border border-wire bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold">每局比赛模板</h3>
                <p className="text-xs text-slate-500">
                  当前模板会复制到每一场比赛。建议使用奇数局，避免平局。
                </p>
                {matchRuleMode !== "custom_legs" ? (
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    当前为标准 BO 赛制；下方模板会保留显示，切换到自定义每局赛制后生效。
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-wire bg-white px-3 text-sm font-bold"
                onClick={addRule}
              >
                <Plus className="h-4 w-4" aria-hidden />
                添加一局
              </button>
            </div>

            <div className="grid gap-2">
              {visibleRules.map((rule, index) => (
                <div key={rule.legNumber} className="grid gap-2 rounded-lg bg-field p-3 lg:grid-cols-[80px_1fr_1fr_auto] lg:items-end">
                  <div className="text-sm font-black text-board">第{index + 1}局</div>
                  <label className="label">
                    参与模式
                    <select
                      className="form-input"
                      value={rule.participantMode}
                      onChange={(event) => updateRule(index, { participantMode: event.target.value as MatchLegRule["participantMode"] })}
                    >
                      {legParticipantModeOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="label">
                    项目
                    <select
                      className="form-input"
                      value={rule.gameVariant}
                      onChange={(event) => updateRule(index, { gameVariant: event.target.value as LegGameVariant })}
                    >
                      {(dartMode === "soft" ? softGameOptions : steelLegGameOptions).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}{("doublesOnly" in option && option.doublesOnly) ? "（仅双人）" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-wire bg-white px-3 text-sm font-bold disabled:opacity-50"
                    disabled={visibleRules.length <= 1}
                    onClick={() => removeRule(index)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    删除
                  </button>
                </div>
              ))}
            </div>
            {ruleError ? <p className="text-sm font-semibold text-red-600">{ruleError}</p> : null}
            <div className="rounded-lg bg-field p-3 text-xs font-semibold text-slate-600">
              预览：{visibleRules.map(getLegRuleLabel).join(" / ")}
            </div>
        </div>
        <div className="rounded-lg border border-wire bg-white p-4 text-sm text-slate-600">
          标准模式会按 BO 规则生成同项目局，例如：{getLegParticipantModeLabel(firstRule?.participantMode)} · {getGameVariantLabel({ dartMode, gameVariant: dartMode === "soft" ? tournament?.soft_game || "soft_501" : tournament?.dart_game || 501 })}。
        </div>
      </div>

      <div className="grid gap-4 rounded-lg border border-wire bg-field p-4 lg:grid-cols-[1fr_1fr_auto]">
        <label className="label">
          软镖机平台
          <input
            className="form-input"
            name="soft_machine_provider"
            placeholder="manual / provider name"
            defaultValue={tournament?.soft_machine_provider || "manual"}
          />
        </label>
        <label className="label">
          平台赛事编号
          <input
            className="form-input"
            name="soft_machine_event_ref"
            placeholder="预留给未来接入"
            defaultValue={tournament?.soft_machine_event_ref || ""}
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold lg:self-end lg:pb-3">
          <input
            type="checkbox"
            name="soft_machine_sync_enabled"
            defaultChecked={tournament?.soft_machine_sync_enabled ?? false}
          />
          启用接入同步
        </label>
      </div>
      <div className="grid gap-3 rounded-lg border border-wire bg-field p-4 md:grid-cols-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="auto_grouping_enabled" defaultChecked={tournament?.auto_grouping_enabled ?? true} />
          启用自动分组
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="balanced_grouping_enabled" defaultChecked={tournament?.balanced_grouping_enabled ?? true} />
          实力均衡分组/组队
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="manual_result_allowed" defaultChecked={tournament?.manual_result_allowed ?? true} />
          允许手动录入结果
        </label>
      </div>
      <div>
        <SubmitButton pendingText="保存中...">保存赛事</SubmitButton>
      </div>
    </form>
  );
}
