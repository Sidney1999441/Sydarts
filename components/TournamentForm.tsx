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
  normalizeMatchLegRuleTemplates,
  normalizeMatchLegRules,
  softGameOptions,
  steelLegGameOptions,
  validateMatchLegRules
} from "@/lib/darts/variants";
import { toDatetimeLocal } from "@/lib/utils";
import type {
  DartMode,
  LegGameVariant,
  MatchDartMode,
  MatchLegRule,
  MatchRuleMode,
  Tournament
} from "@/types/domain";

type RuleTemplateKey = MatchDartMode;

function defaultGameVariant(mode: RuleTemplateKey, tournament?: Partial<Tournament>) {
  return (mode === "soft"
    ? tournament?.soft_game || "soft_501"
    : String(tournament?.dart_game || 501)) as LegGameVariant;
}

function normalizeRulesForMode(rules: MatchLegRule[], mode: RuleTemplateKey) {
  return rules.map((rule, index) => ({
    ...rule,
    legNumber: index + 1,
    dartMode: mode,
    gameVariant: rule.gameVariant || (mode === "soft" ? "soft_501" : "501")
  }));
}

export function TournamentForm({
  action,
  tournament
}: {
  action: (formData: FormData) => void | Promise<void>;
  tournament?: Partial<Tournament>;
}) {
  const [tournamentType, setTournamentType] = useState(tournament?.tournament_type || "doubles");
  const [teamSize, setTeamSize] = useState(tournament?.team_size || (tournamentType === "individual" ? 1 : 2));
  const type = tournamentType;
  const initialDartMode: DartMode =
    tournament?.dart_mode === "soft" || tournament?.dart_mode === "mixed_alternating"
      ? tournament.dart_mode
      : "steel";
  const [dartMode, setDartMode] = useState<DartMode>(initialDartMode);
  const [mixedFirstDartMode, setMixedFirstDartMode] = useState<MatchDartMode>(
    tournament?.mixed_first_dart_mode === "steel" ? "steel" : "soft"
  );
  const [matchRuleMode, setMatchRuleMode] = useState<MatchRuleMode>(
    tournament?.match_rule_mode === "custom_legs" ? "custom_legs" : "standard"
  );
  const [matchFinishMode, setMatchFinishMode] = useState(tournament?.match_finish_mode || "majority");

  const storedTemplates = useMemo(() => normalizeMatchLegRuleTemplates(tournament?.match_leg_rules), [tournament?.match_leg_rules]);
  const storedArray = useMemo(() => normalizeMatchLegRules(tournament?.match_leg_rules), [tournament?.match_leg_rules]);

  function initialRulesFor(mode: RuleTemplateKey) {
    const templateRules = storedTemplates[mode];
    const arrayRules = storedArray.filter((rule) => rule.dartMode === mode);
    const existingRules = templateRules.length > 0 ? templateRules : arrayRules;
    if (existingRules.length > 0) return normalizeRulesForMode(existingRules, mode);

    return [
      {
        legNumber: 1,
        participantMode: getDefaultParticipantMode({ tournamentType: type, teamSize }),
        dartMode: mode,
        gameVariant: defaultGameVariant(mode, tournament)
      }
    ];
  }

  const [steelRules, setSteelRules] = useState<MatchLegRule[]>(() => initialRulesFor("steel"));
  const [softRules, setSoftRules] = useState<MatchLegRule[]>(() => initialRulesFor("soft"));

  const normalizedSteelRules = useMemo(() => normalizeRulesForMode(steelRules, "steel"), [steelRules]);
  const normalizedSoftRules = useMemo(() => normalizeRulesForMode(softRules, "soft"), [softRules]);
  const activeTemplateKey: RuleTemplateKey = dartMode === "soft" ? "soft" : "steel";
  const activeRules = activeTemplateKey === "soft" ? normalizedSoftRules : normalizedSteelRules;
  const serializedRules = useMemo(() => {
    if (dartMode === "mixed_alternating") {
      return JSON.stringify({
        steel: normalizedSteelRules,
        soft: normalizedSoftRules
      });
    }

    return JSON.stringify(activeRules);
  }, [activeRules, dartMode, normalizedSoftRules, normalizedSteelRules]);

  const templateKeys: RuleTemplateKey[] = dartMode === "mixed_alternating" ? ["steel", "soft"] : [activeTemplateKey];
  const ruleErrors = useMemo<Record<RuleTemplateKey, string | null>>(() => {
    const nextErrors: Record<RuleTemplateKey, string | null> = { steel: null, soft: null };
    if (matchRuleMode !== "custom_legs") return nextErrors;
    for (const key of templateKeys) {
      const rules = key === "soft" ? normalizedSoftRules : normalizedSteelRules;
      nextErrors[key] = validateMatchLegRules({ dartMode: key, rules, finishMode: matchFinishMode });
    }
    return nextErrors;
  }, [matchFinishMode, matchRuleMode, normalizedSoftRules, normalizedSteelRules, templateKeys]);
  const firstRule = activeRules[0];

  function setRulesFor(key: RuleTemplateKey, updater: (current: MatchLegRule[]) => MatchLegRule[]) {
    const setter = key === "soft" ? setSoftRules : setSteelRules;
    setter((current) => normalizeRulesForMode(updater(current), key));
  }

  function updateRule(key: RuleTemplateKey, index: number, patch: Partial<MatchLegRule>) {
    setRulesFor(key, (current) =>
      current.map((rule, ruleIndex) =>
        ruleIndex === index
          ? {
              ...rule,
              ...patch,
              dartMode: key
            }
          : rule
      )
    );
  }

  function addRule(key: RuleTemplateKey) {
    setRulesFor(key, (current) => [
      ...current,
      {
        legNumber: current.length + 1,
        participantMode: getDefaultParticipantMode({ tournamentType: type, teamSize }),
        dartMode: key,
        gameVariant: defaultGameVariant(key, tournament)
      }
    ]);
  }

  function removeRule(key: RuleTemplateKey, index: number) {
    setRulesFor(key, (current) => current.filter((_, ruleIndex) => ruleIndex !== index));
  }

  function renderRuleEditor(key: RuleTemplateKey) {
    const rules = key === "soft" ? normalizedSoftRules : normalizedSteelRules;
    const title =
      dartMode === "mixed_alternating"
        ? key === "soft"
          ? "软式轮次模板"
          : "硬式轮次模板"
        : "每局比赛模板";
    const description =
      dartMode === "mixed_alternating"
        ? `${key === "soft" ? "软式" : "硬式"}轮次会复制这套 BO 模板；另一种镖种使用自己的模板。`
        : "当前模板会复制到每一场比赛。建议使用奇数局，避免平局。";

    return (
      <div key={key} className="grid gap-3 rounded-lg border border-wire bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">{title}</h3>
            <p className="text-xs text-muted">{description}</p>
            {matchRuleMode !== "custom_legs" ? (
              <p className="mt-1 text-xs font-semibold text-muted">
                当前为标准 BO 赛制；下方模板会保留显示，切换到自定义每局赛制后生效。
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-wire bg-surface px-3 text-sm font-bold"
            onClick={() => addRule(key)}
          >
            <Plus className="h-4 w-4" aria-hidden />
            添加一局
          </button>
        </div>

        <div className="grid gap-2">
          {rules.map((rule, index) => (
            <div key={`${key}-${rule.legNumber}`} className="grid gap-2 rounded-lg bg-field p-3 lg:grid-cols-[80px_1fr_1fr_auto] lg:items-end">
              <div className="text-sm font-black text-board">第 {index + 1} 局</div>
              <label className="label">
                参与模式
                <select
                  className="form-input"
                  value={rule.participantMode}
                  onChange={(event) => updateRule(key, index, { participantMode: event.target.value as MatchLegRule["participantMode"] })}
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
                  onChange={(event) => updateRule(key, index, { gameVariant: event.target.value as LegGameVariant })}
                >
                  {(key === "soft" ? softGameOptions : steelLegGameOptions).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}{("doublesOnly" in option && option.doublesOnly) ? "（仅双人）" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-wire bg-surface px-3 text-sm font-bold disabled:opacity-50"
                disabled={rules.length <= 1}
                onClick={() => removeRule(key, index)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                删除
              </button>
            </div>
          ))}
        </div>
        {ruleErrors[key] ? <p className="text-sm font-semibold text-red-600">{ruleErrors[key]}</p> : null}
        <div className="rounded-lg bg-field p-3 text-xs font-semibold text-muted">
          预览：{rules.map(getLegRuleLabel).join(" / ")}
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-5">
      <input type="hidden" name="match_leg_rules" value={serializedRules} />
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
          <select
            className="form-input"
            name="tournament_type"
            value={tournamentType}
            onChange={(event) => {
              const nextType = event.target.value as typeof tournamentType;
              setTournamentType(nextType);
              if (nextType === "individual") setTeamSize(1);
              if (nextType !== "individual" && teamSize < 2) setTeamSize(2);
            }}
          >
            <option value="doubles">双人赛</option>
            <option value="team">队制赛</option>
            <option value="individual">个人赛</option>
          </select>
        </label>
        <label className="label">
          每队人数
          <input
            className="form-input"
            type="number"
            min={1}
            max={8}
            name="team_size"
            value={teamSize}
            onChange={(event) => setTeamSize(Number(event.target.value || 1))}
          />
        </label>
        <label className="label">
          赛制
          <select className="form-input" name="format" defaultValue={tournament?.format || "round_robin"}>
            <option value="round_robin">小组循环</option>
            <option value="single_elimination">单淘汰赛</option>
            <option value="double_elimination" disabled>双淘汰赛开发中</option>
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
              onChange={(event) => setDartMode(event.target.value as DartMode)}
            >
              {dartModeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <span className="text-xs font-normal text-muted">
              联赛可按轮次软硬交替；同一场 BO 内只使用一种镖种。
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

        {dartMode === "mixed_alternating" ? (
          <label className="label max-w-sm">
            交替首轮
            <select
              className="form-input"
              name="mixed_first_dart_mode"
              value={mixedFirstDartMode}
              onChange={(event) => setMixedFirstDartMode(event.target.value as MatchDartMode)}
            >
              <option value="soft">第 1 轮软镖，第 2 轮硬镖</option>
              <option value="steel">第 1 轮硬镖，第 2 轮软镖</option>
            </select>
          </label>
        ) : (
          <input type="hidden" name="mixed_first_dart_mode" value={mixedFirstDartMode} />
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="label">
            硬镖标准局
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

        <div className="grid gap-3">
          {templateKeys.map((key) => renderRuleEditor(key))}
        </div>
        <div className="rounded-lg border border-wire bg-surface p-4 text-sm text-muted">
          标准模式会按 BO 规则生成同项目局，例如：{getLegParticipantModeLabel(firstRule?.participantMode)} / {getGameVariantLabel({ dartMode: activeTemplateKey, gameVariant: activeTemplateKey === "soft" ? tournament?.soft_game || "soft_501" : tournament?.dart_game || 501 })}。
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
