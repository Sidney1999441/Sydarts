"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { submitMatchLineupFormAction } from "@/lib/actions/matches";
import { getLegRuleLabel } from "@/lib/darts/variants";
import { Button } from "@/components/ui/Button";
import type { MatchLineupActionState } from "@/lib/actions/matches";
import type { MatchLegRule } from "@/types/domain";

type PlayerOption = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
};

const initialActionState: MatchLineupActionState = {
  ok: false,
  message: null,
  error: null
};

export function MatchLineupSubmissionForm({
  matchId,
  participantId,
  legRules,
  members,
  submittedLegLineups = [],
  hasExistingSubmission = false,
  compact = false
}: {
  matchId: string;
  participantId: string;
  legRules: MatchLegRule[];
  members: PlayerOption[];
  submittedLegLineups?: Array<{ legNumber: number; playerIds: string[] }>;
  hasExistingSubmission?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(submitMatchLineupFormAction, initialActionState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  if (members.length === 0) {
    return <p className="rounded-lg bg-field p-3 text-sm font-semibold text-muted">当前队伍暂无可布阵队员。</p>;
  }

  const hasSubmission = hasExistingSubmission || submittedLegLineups.length > 0;

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="match_id" value={matchId} />
      <input type="hidden" name="participant_id" value={participantId} />
      <div className="grid gap-2">
        {legRules.map((rule) => {
          const selectedIds = submittedLegLineups.find((lineup) => lineup.legNumber === rule.legNumber)?.playerIds || [];
          const slots = lineupSlotCount(rule, members);

          return (
            <div key={rule.legNumber} className="grid gap-2 rounded-lg bg-field p-3">
              <div>
                <div className="text-sm font-black">第 {rule.legNumber} 局</div>
                <div className="mt-0.5 text-xs font-semibold text-muted">{getLegRuleLabel(rule)}</div>
              </div>
              <div className={compact ? "grid gap-2" : "grid gap-2 sm:grid-cols-2"}>
                {Array.from({ length: slots }, (_, index) => (
                  <label key={`${rule.legNumber}-${index}`} className="label">
                    {slots === 1 ? "出场选手" : `第 ${index + 1} 位`}
                    <input type="hidden" name="leg_numbers" value={rule.legNumber} />
                    <select
                      className="form-input"
                      name={`leg_${rule.legNumber}_player_ids`}
                      defaultValue={selectedIds[index] || ""}
                      required
                    >
                      <option value="">选择队员</option>
                      {members.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs font-semibold text-muted">
        单人局不能由同一名选手连续出战两场；双人局不参与这个连续限制。
      </p>
      {state.error ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700"
          role="status"
        >
          {state.message}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant={compact ? "secondary" : "primary"} pendingText="提交中">
          {hasSubmission ? "更新我方布阵" : "提交我方布阵"}
        </Button>
      </div>
    </form>
  );
}

function lineupSlotCount(rule: MatchLegRule, members: PlayerOption[]) {
  if (members.length === 0) return 0;
  if (rule.participantMode === "singles") return 1;
  if (rule.participantMode === "doubles") return Math.min(2, members.length);
  return members.length;
}
