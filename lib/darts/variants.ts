import type {
  DartMode,
  LegGameVariant,
  LegParticipantMode,
  MatchDartMode,
  MatchFinishMode,
  MatchLegRule,
  MatchLegRuleTemplateSet,
  MatchRuleMode,
  MixedFirstDartMode,
  SoftGameVariant,
  TournamentType
} from "@/types/domain";

export const dartModeOptions: Array<{ value: DartMode; label: string; description: string }> = [
  {
    value: "steel",
    label: "硬镖",
    description: "可使用系统计分器或手动录入"
  },
  {
    value: "soft",
    label: "软镖",
    description: "目前仅支持手动录入，并预留软镖机接入"
  },
  {
    value: "mixed_alternating",
    label: "软硬轮次交替",
    description: "联赛轮次可软硬交替，单场 BO 内不混合镖种"
  }
];

export const matchRuleModeOptions: Array<{ value: MatchRuleMode; label: string }> = [
  { value: "standard", label: "标准 BO 赛制" },
  { value: "custom_legs", label: "自定义每局赛制" }
];

export const matchFinishModeOptions: Array<{ value: MatchFinishMode; label: string }> = [
  { value: "majority", label: "领先过半即结束" },
  { value: "play_all", label: "打满全部配置局" }
];

export const softGameOptions: Array<{ value: SoftGameVariant; label: string; doublesOnly?: boolean }> = [
  { value: "soft_301", label: "软镖 301" },
  { value: "soft_501", label: "软镖 501" },
  { value: "soft_701", label: "软镖 701" },
  { value: "soft_cricket", label: "米老鼠 / Cricket" },
  { value: "soft_half_it", label: "减半 / HALF-IT" },
  { value: "soft_high_score", label: "高分 / HIGH SCORE" },
  { value: "snow_501", label: "雪分制 501", doublesOnly: true },
  { value: "snow_701", label: "雪分制 701", doublesOnly: true }
];

export const legParticipantModeOptions: Array<{ value: LegParticipantMode; label: string }> = [
  { value: "doubles", label: "双人" },
  { value: "singles", label: "单人" },
  { value: "team", label: "队制" }
];

export const steelLegGameOptions: Array<{ value: Extract<LegGameVariant, "301" | "501" | "701">; label: string }> = [
  { value: "301", label: "301" },
  { value: "501", label: "501" },
  { value: "701", label: "701" }
];

type RuleDefaults = {
  dartGame?: number | string | null;
  softGame?: SoftGameVariant | string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isTemplateSet(value: unknown): value is MatchLegRuleTemplateSet {
  return isRecord(value) && (Array.isArray(value.steel) || Array.isArray(value.soft));
}

export function getDartModeLabel(mode?: string | null) {
  if (mode === "soft") return "软镖";
  if (mode === "mixed_alternating") return "软硬轮次交替";
  return "硬镖";
}

export function getMatchRuleModeLabel(mode?: string | null) {
  return matchRuleModeOptions.find((option) => option.value === mode)?.label || "标准 BO 赛制";
}

export function getMatchFinishModeLabel(mode?: string | null) {
  return matchFinishModeOptions.find((option) => option.value === mode)?.label || "领先过半即结束";
}

export function getSoftGameLabel(game?: string | null) {
  return softGameOptions.find((option) => option.value === game)?.label || "软镖 501";
}

export function getGameVariantLabel(input: {
  dartMode?: string | null;
  gameVariant?: string | number | null;
}) {
  if (input.dartMode === "soft") return getSoftGameLabel(String(input.gameVariant || "soft_501"));
  return `硬镖 ${input.gameVariant || 501}`;
}

export function getLegParticipantModeLabel(mode?: string | null) {
  return legParticipantModeOptions.find((option) => option.value === mode)?.label || "双人";
}

export function getLegRuleLabel(rule: MatchLegRule) {
  return `第 ${rule.legNumber} 局 ${getLegParticipantModeLabel(rule.participantMode)} · ${getGameVariantLabel({
    dartMode: rule.dartMode,
    gameVariant: rule.gameVariant
  })}`;
}

export function hasCustomLegRules(value?: unknown): value is MatchLegRule[] {
  if (Array.isArray(value)) return value.length > 0;
  if (isTemplateSet(value)) return Boolean(value.steel?.length || value.soft?.length);
  return false;
}

export function isSnowGame(game?: string | null) {
  return game === "snow_501" || game === "snow_701";
}

export function getDefaultParticipantMode(input: {
  tournamentType?: TournamentType | string | null;
  teamSize?: number | string | null;
}): LegParticipantMode {
  if (input.tournamentType === "individual" || Number(input.teamSize || 1) <= 1) return "singles";
  if (input.tournamentType === "team" || Number(input.teamSize || 2) > 2) return "team";
  return "doubles";
}

export function getMatchDartMode(input: {
  dartMode?: DartMode | string | null;
  mixedFirstDartMode?: MixedFirstDartMode | string | null;
  roundNumber?: number | null;
}): MatchDartMode {
  if (input.dartMode === "soft") return "soft";
  if (input.dartMode !== "mixed_alternating") return "steel";

  const roundNumber = Math.max(1, Number(input.roundNumber || 1));
  const firstMode = input.mixedFirstDartMode === "steel" ? "steel" : "soft";
  const isFirstModeRound = roundNumber % 2 === 1;
  return isFirstModeRound ? firstMode : firstMode === "soft" ? "steel" : "soft";
}

export function getMatchGameVariant(input: {
  matchDartMode: MatchDartMode;
  dartGame?: number | string | null;
  softGame?: SoftGameVariant | string | null;
}) {
  if (input.matchDartMode === "soft") return input.softGame || "soft_501";
  return String(input.dartGame || 501);
}

export function buildStandardLegRules(input: {
  dartMode?: DartMode | string | null;
  dartGame?: number | string | null;
  softGame?: SoftGameVariant | string | null;
  bestOf?: number | string | null;
  tournamentType?: TournamentType | string | null;
  teamSize?: number | string | null;
  roundNumber?: number | null;
  mixedFirstDartMode?: MixedFirstDartMode | string | null;
}): MatchLegRule[] {
  const bestOf = Number(input.bestOf || 3);
  const legCount = bestOf === 5 || bestOf === 7 ? bestOf : 3;
  const dartMode = getMatchDartMode({
    dartMode: input.dartMode,
    mixedFirstDartMode: input.mixedFirstDartMode,
    roundNumber: input.roundNumber
  });
  const participantMode = getDefaultParticipantMode({
    tournamentType: input.tournamentType,
    teamSize: input.teamSize
  });
  const gameVariant = getMatchGameVariant({
    matchDartMode: dartMode,
    dartGame: input.dartGame,
    softGame: input.softGame
  }) as LegGameVariant;

  return Array.from({ length: legCount }, (_, index) => ({
    legNumber: index + 1,
    participantMode,
    dartMode,
    gameVariant
  }));
}

export function normalizeMatchLegRules(rules: unknown): MatchLegRule[] {
  if (!Array.isArray(rules)) return [];

  return rules
    .map((rule, index) => {
      const value = rule as Partial<MatchLegRule>;
      const dartMode: MatchDartMode = value.dartMode === "soft" ? "soft" : "steel";
      const participantMode: LegParticipantMode =
        value.participantMode === "singles" || value.participantMode === "team"
          ? value.participantMode
          : "doubles";
      const gameVariant = String(
        value.gameVariant || (dartMode === "soft" ? "soft_501" : "501")
      ) as LegGameVariant;

      return {
        legNumber: Number(value.legNumber || index + 1),
        participantMode,
        dartMode,
        gameVariant
      };
    })
    .sort((a, b) => a.legNumber - b.legNumber)
    .map((rule, index) => ({ ...rule, legNumber: index + 1 }));
}

function getFallbackVariant(dartMode: MatchDartMode, defaults?: RuleDefaults) {
  return getMatchGameVariant({
    matchDartMode: dartMode,
    dartGame: defaults?.dartGame,
    softGame: defaults?.softGame
  }) as LegGameVariant;
}

function coerceGameVariant(input: {
  rule: MatchLegRule;
  targetDartMode: MatchDartMode;
  defaults?: RuleDefaults;
}) {
  const value = String(input.rule.gameVariant);
  if (input.targetDartMode === "steel") {
    if (value.endsWith("301")) return "301";
    if (value.endsWith("701")) return "701";
    if (value.endsWith("501")) return "501";
    return getFallbackVariant("steel", input.defaults);
  }

  if (value === "301") return "soft_301";
  if (value === "501") return "soft_501";
  if (value === "701") return "soft_701";
  if (softGameOptions.some((option) => option.value === value)) return value as LegGameVariant;
  return getFallbackVariant("soft", input.defaults);
}

export function coerceRuleToDartMode(
  rule: MatchLegRule,
  targetDartMode: MatchDartMode,
  defaults?: RuleDefaults
): MatchLegRule {
  return {
    ...rule,
    dartMode: targetDartMode,
    gameVariant: coerceGameVariant({ rule, targetDartMode, defaults })
  };
}

function renumberRules(rules: MatchLegRule[]) {
  return rules.map((rule, index) => ({ ...rule, legNumber: index + 1 }));
}

export function normalizeMatchLegRuleTemplates(value: unknown): Required<MatchLegRuleTemplateSet> {
  if (isTemplateSet(value)) {
    return {
      steel: renumberRules(normalizeMatchLegRules(value.steel).map((rule) => coerceRuleToDartMode(rule, "steel"))),
      soft: renumberRules(normalizeMatchLegRules(value.soft).map((rule) => coerceRuleToDartMode(rule, "soft")))
    };
  }

  const rules = normalizeMatchLegRules(value);
  return {
    steel: renumberRules(rules.filter((rule) => rule.dartMode === "steel")),
    soft: renumberRules(rules.filter((rule) => rule.dartMode === "soft"))
  };
}

export function selectMatchLegRules(input: {
  customRules?: unknown;
  matchDartMode: MatchDartMode;
  dartMode?: DartMode | string | null;
  dartGame?: number | string | null;
  softGame?: SoftGameVariant | string | null;
}) {
  if (isTemplateSet(input.customRules)) {
    const templates = normalizeMatchLegRuleTemplates(input.customRules);
    return renumberRules(templates[input.matchDartMode]);
  }

  const rules = normalizeMatchLegRules(input.customRules);
  if (rules.length === 0) return [];

  if (rules.every((rule) => rule.dartMode === input.matchDartMode)) {
    return renumberRules(rules);
  }

  const matchingRules = rules.filter((rule) => rule.dartMode === input.matchDartMode);
  if (matchingRules.length > 0) return renumberRules(matchingRules);

  return renumberRules(
    rules.map((rule) =>
      coerceRuleToDartMode(rule, input.matchDartMode, {
        dartGame: input.dartGame,
        softGame: input.softGame
      })
    )
  );
}

export function resolveMatchLegRules(input: {
  matchRuleMode?: MatchRuleMode | string | null;
  customRules?: unknown;
  dartMode?: DartMode | string | null;
  dartGame?: number | string | null;
  softGame?: SoftGameVariant | string | null;
  bestOf?: number | string | null;
  tournamentType?: TournamentType | string | null;
  teamSize?: number | string | null;
  roundNumber?: number | null;
  mixedFirstDartMode?: MixedFirstDartMode | string | null;
}) {
  const matchDartMode = getMatchDartMode({
    dartMode: input.dartMode,
    mixedFirstDartMode: input.mixedFirstDartMode,
    roundNumber: input.roundNumber
  });
  const customRules = selectMatchLegRules({ ...input, matchDartMode });
  if (input.matchRuleMode === "custom_legs" && customRules.length > 0) {
    return customRules;
  }

  return buildStandardLegRules(input);
}

export function getLegStartingScore(rule?: MatchLegRule | null): 301 | 501 | 701 {
  const value = String(rule?.gameVariant || "501");
  if (value.endsWith("301")) return 301;
  if (value.endsWith("701")) return 701;
  return 501;
}

export function validateMatchLegRules(input: {
  dartMode: MatchDartMode;
  rules: MatchLegRule[];
  finishMode?: MatchFinishMode;
}) {
  if (input.rules.length === 0) return "请至少设置一局比赛。";
  if (input.rules.length % 2 === 0) return "自定义赛制需要设置奇数局，避免出现平局。";

  const mixedDartMode = input.rules.some((rule) => rule.dartMode !== input.dartMode);
  if (mixedDartMode) return "同一套 BO 赛制内不能混合软镖和硬镖。";

  const invalidSoft = input.rules.some((rule) => {
    if (rule.dartMode !== "soft") return false;
    return !softGameOptions.some((option) => option.value === rule.gameVariant);
  });
  if (invalidSoft) return "软镖赛制只能选择 301、501、701、米老鼠/Cricket、HALF-IT、HIGH SCORE、雪分制501、雪分制701。";

  const invalidSteel = input.rules.some((rule) => {
    if (rule.dartMode !== "steel") return false;
    return !steelLegGameOptions.some((option) => option.value === rule.gameVariant);
  });
  if (invalidSteel) return "硬镖赛制只能选择 301、501、701。";

  const invalidSnow = input.rules.some(
    (rule) => rule.dartMode === "soft" && isSnowGame(rule.gameVariant) && rule.participantMode !== "doubles"
  );
  if (invalidSnow) return "雪分制 501/701 仅限双人局。";

  return null;
}
