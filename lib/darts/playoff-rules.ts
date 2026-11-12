import { z } from "zod";
import { validateMatchLegRules } from "@/lib/darts/variants";
import type { MatchLegRule } from "@/types/domain";

export const playoffLegCounts = [1, 3, 5, 7, 9, 11, 13, 15];
export const playoffActivityKeys = [
  "lineupSubmissions", "lineup_submissions", "scoringDraft", "softScoringDraft",
  "legLineups", "legResults"
] as const;

export function canEditPlayoffRules(match: { status: string; details?: Record<string, unknown> | null }) {
  return match.status === "not_started" &&
    playoffActivityKeys.every((key) => !Object.hasOwn(match.details || {}, key));
}

const playoffRuleForm = z.object({
  dartMode: z.enum(["steel", "soft"]),
  finishMode: z.enum(["majority", "play_all"]),
  firstThrowMode: z.enum(["", "alternate", "winner", "loser"]),
  legCount: z.coerce.number().refine((count) => playoffLegCounts.includes(count))
});
const legForm = z.object({
  participantMode: z.enum(["singles", "doubles", "team"]),
  gameVariant: z.string().min(1)
});

export function readPlayoffRules(form: FormData, teamSize: number) {
  const parsed = playoffRuleForm.safeParse({
    dartMode: form.get("dart_mode"),
    finishMode: form.get("match_finish_mode"),
    firstThrowMode: form.get("first_throw_mode"),
    legCount: form.get("leg_count")
  });
  if (!parsed.success) throw new Error("请选择有效的镖种、局数和结束方式。");
  const { dartMode, finishMode, firstThrowMode, legCount } = parsed.data;
  const rules = Array.from({ length: legCount }, (_, index): MatchLegRule => {
    const legNumber = index + 1;
    const leg = legForm.safeParse({
      participantMode: form.get(`participant_mode_${legNumber}`),
      gameVariant: form.get(`game_variant_${legNumber}`)
    });
    if (!leg.success) throw new Error(`请完整设置第 ${legNumber} 局。`);
    if (teamSize < 2 && leg.data.participantMode !== "singles") {
      throw new Error("单人赛事只能设置单人局。");
    }
    return { ...leg.data, gameVariant: leg.data.gameVariant as MatchLegRule["gameVariant"], dartMode, legNumber };
  });
  const error = validateMatchLegRules({ dartMode, rules, finishMode });
  if (error) throw new Error(error);
  return {
    dart_mode: dartMode,
    game_variant: rules[0].gameVariant,
    leg_rules: rules,
    match_finish_mode: finishMode,
    first_throw_mode: firstThrowMode || null
  };
}
