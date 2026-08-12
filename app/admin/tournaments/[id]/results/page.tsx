import { ClipboardCheck } from "lucide-react";
import { adminUpdateMatchResultAction } from "@/lib/actions/matches";
import { requireAdmin } from "@/lib/auth/guards";
import { getLegRuleLabel, getMatchRulesSummary } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { createResultSubmissionId } from "@/lib/results/submission";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { MatchDartMode, MatchLegRule } from "@/types/domain";

export const dynamic = "force-dynamic";

type ResultMember = { userId: string; name: string };

export default async function ResultsAdminPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const [{ data: matches }, { data: participants }, { data: confirmations }] = await Promise.all([
    supabase.from("matches").select("*").eq("tournament_id", id).order("round_number").order("match_number"),
    supabase.from("tournament_participants").select("*").eq("tournament_id", id),
    supabase.from("match_result_confirmations").select("*")
  ]);

  const participantById = new Map((participants || []).map((participant) => [participant.id, participant]));
  const teamIds = [
    ...new Set((participants || []).map((participant) => participant.team_id).filter(Boolean))
  ] as string[];
  const { data: teamMembers } =
    teamIds.length > 0
      ? await supabase.from("team_members").select("team_id, user_id").in("team_id", teamIds)
      : { data: [] };
  const statUserIds = [
    ...new Set([
      ...(participants || []).map((participant) => participant.user_id).filter(Boolean),
      ...(teamMembers || []).map((member) => member.user_id)
    ])
  ] as string[];
  const { data: statProfiles } =
    statUserIds.length > 0
      ? await supabase.from("profiles").select("id, display_name").in("id", statUserIds)
      : { data: [] };
  const statProfileById = new Map((statProfiles || []).map((profile) => [profile.id, profile]));
  const teamMembersByTeamId = new Map<string, ResultMember[]>();

  for (const member of teamMembers || []) {
    const members = teamMembersByTeamId.get(member.team_id) || [];
    members.push({
      userId: member.user_id,
      name: statProfileById.get(member.user_id)?.display_name || member.user_id
    });
    teamMembersByTeamId.set(member.team_id, members);
  }

  const participantMembersById = new Map<string, ResultMember[]>();
  for (const participant of participants || []) {
    if (participant.participant_type === "user" && participant.user_id) {
      participantMembersById.set(participant.id, [
        {
          userId: participant.user_id,
          name: statProfileById.get(participant.user_id)?.display_name || participant.display_name
        }
      ]);
    } else if (participant.team_id) {
      participantMembersById.set(participant.id, teamMembersByTeamId.get(participant.team_id) || []);
    }
  }

  return (
    <div className="grid gap-6">
      <CodlPageHeader
        kicker="CODL Admin"
        title="成绩管理"
        description="管理员可快速修正比分、补录结果，并按需展开每局出场和个人数据。"
        icon={<ClipboardCheck className="h-6 w-6" aria-hidden />}
        art="pattern"
      />
      <Card>
        <div className="grid gap-4">
          {(matches || []).map((match) => {
            const dartMode = ((match.dart_mode || "steel") === "soft" ? "soft" : "steel") as MatchDartMode;
            const legRules = Array.isArray(match.leg_rules) ? (match.leg_rules as MatchLegRule[]) : [];
            const participantAName = match.participant_a_id
              ? participantById.get(match.participant_a_id)?.display_name || "A"
              : "TBD";
            const participantBName = match.participant_b_id
              ? participantById.get(match.participant_b_id)?.display_name || "B"
              : "TBD";
            const rulesSummary = getMatchRulesSummary({
              dartMode,
              gameVariant: match.game_variant,
              legRules
            });

            return (
              <details
                key={match.id}
                className="rounded-lg border border-wire bg-surface p-4 shadow-soft"
                open={match.status !== "completed"}
              >
                <summary className="cursor-pointer list-none">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-muted">
                        R{match.round_number} M{match.match_number} / {match.status}
                      </div>
                      <div className="mt-1 truncate text-xs font-semibold text-board">{rulesSummary}</div>
                      <div className="mt-1 truncate font-bold">
                        {participantAName} vs {participantBName}
                      </div>
                    </div>
                    <div className="rounded-lg bg-board px-4 py-2 text-center text-white">
                      <div className="text-[10px] font-black uppercase opacity-75">比分</div>
                      <div className="text-2xl font-black leading-none">{match.score_a}:{match.score_b}</div>
                    </div>
                  </div>
                </summary>

                <form action={adminUpdateMatchResultAction} className="mt-4 grid gap-3 border-t border-wire pt-4">
                  <input type="hidden" name="match_id" value={match.id} />
                  <input type="hidden" name="tournament_id" value={id} />
                  <input type="hidden" name="submission_id" value={createResultSubmissionId()} />
                  <div className="grid gap-3 lg:grid-cols-[120px_120px_220px_auto] lg:items-end">
                    <label className="label">
                      A
                      <input className="form-input" type="number" name="score_a" min={0} defaultValue={match.score_a} />
                    </label>
                    <label className="label">
                      B
                      <input className="form-input" type="number" name="score_b" min={0} defaultValue={match.score_b} />
                    </label>
                    <label className="label">
                      胜者
                      <select className="form-input" name="winner_participant_id" defaultValue={match.winner_participant_id || ""}>
                        <option value="">未定</option>
                        {match.participant_a_id ? <option value={match.participant_a_id}>{participantAName}</option> : null}
                        {match.participant_b_id ? <option value={match.participant_b_id}>{participantBName}</option> : null}
                      </select>
                    </label>
                    <Button type="submit" variant="secondary">保存</Button>
                  </div>

                  {legRules.length > 0 ? (
                    <LegLineupFields
                      legRules={legRules}
                      participantAName={participantAName}
                      participantBName={participantBName}
                      participantAMembers={match.participant_a_id ? participantMembersById.get(match.participant_a_id) || [] : []}
                      participantBMembers={match.participant_b_id ? participantMembersById.get(match.participant_b_id) || [] : []}
                    />
                  ) : null}

                  <div className="grid gap-3 rounded-lg bg-field p-3">
                    <div className="text-xs font-bold text-muted">个人数据（可选）</div>
                    {match.participant_a_id ? (
                      <ManualStatsFields
                        title={`A / ${participantAName}`}
                        dartMode={dartMode}
                        members={participantMembersById.get(match.participant_a_id) || []}
                      />
                    ) : null}
                    {match.participant_b_id ? (
                      <ManualStatsFields
                        title={`B / ${participantBName}`}
                        dartMode={dartMode}
                        members={participantMembersById.get(match.participant_b_id) || []}
                      />
                    ) : null}
                  </div>
                </form>
              </details>
            );
          })}
          {(matches || []).length === 0 ? <p className="text-sm text-muted">暂无比赛。</p> : null}
        </div>
      </Card>
      <Card>
        <h2 className="text-lg font-bold">结果确认 / 争议</h2>
        <div className="mt-4 grid gap-2 text-sm">
          {(confirmations || []).map((confirmation) => (
            <div key={confirmation.id} className="rounded-lg border border-wire p-3">
              Match {confirmation.match_id.slice(0, 8)} / {confirmation.status} / {confirmation.proposed_score_a}:{confirmation.proposed_score_b}
            </div>
          ))}
          {(confirmations || []).length === 0 ? <p className="text-muted">暂无确认记录。</p> : null}
        </div>
      </Card>
    </div>
  );
}

function ManualStatsFields({
  title,
  dartMode,
  members
}: {
  title: string;
  dartMode: "steel" | "soft";
  members: ResultMember[];
}) {
  if (members.length === 0) return null;

  return (
    <details className="rounded-lg border border-wire bg-surface p-3" open={members.length === 1}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-bold text-muted">{title}</div>
          <div className="rounded-full bg-field px-2 py-1 text-[11px] font-bold text-board">{members.length} 人</div>
        </div>
      </summary>
      <div className="mt-3 grid gap-3">
        <div className="text-[11px] font-semibold text-muted">
          {dartMode === "soft"
            ? "软镖 01 可录 PPR 或 PPD；米老鼠录 MPR、5/6/7/9 Mark、白马；高分赛录帽子和高分。"
            : "硬镖可录三镖均分、100+、140+、180、最高拆和高拆次数。"}
        </div>
        {members.map((member, index) => (
          <details key={member.userId} className="rounded-lg bg-field p-3" open={members.length <= 2 && index === 0}>
            <summary className="cursor-pointer text-sm font-bold">{member.name}</summary>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
              <input
                className="form-input"
                type="number"
                step="0.01"
                min={0}
                name={`stats_${member.userId}_average_score`}
                placeholder={dartMode === "soft" ? "PPR/均分" : "三镖均分"}
              />
              {dartMode === "steel" ? (
                <>
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_100_plus`} placeholder="100+" />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_140_plus`} placeholder="140+" />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_180`} placeholder="180" />
                </>
              ) : (
                <>
                  <input className="form-input" type="number" step="0.01" min={0} name={`stats_${member.userId}_average_ppd`} placeholder="PPD" />
                  <input className="form-input" type="number" step="0.01" min={0} name={`stats_${member.userId}_average_mpr`} placeholder="MPR" />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_5_marks`} placeholder="5 Mark" />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_6_marks`} placeholder="6 Mark" />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_7_marks`} placeholder="7 Mark" />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_9_marks`} placeholder="9 Mark" />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_ton80`} placeholder="TON80" />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_hat_trick`} placeholder="帽子" />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_white_horse`} placeholder="白马" />
                </>
              )}
              <input className="form-input" type="number" min={0} name={`stats_${member.userId}_highest_checkout`} placeholder="最高拆" />
              <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_high_checkout`} placeholder="高拆次数" />
            </div>
          </details>
        ))}
      </div>
    </details>
  );
}

function LegLineupFields({
  legRules,
  participantAName,
  participantBName,
  participantAMembers,
  participantBMembers
}: {
  legRules: MatchLegRule[];
  participantAName: string;
  participantBName: string;
  participantAMembers: ResultMember[];
  participantBMembers: ResultMember[];
}) {
  return (
    <details className="rounded-lg bg-field p-3">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-bold text-muted">每局出场（可选）</div>
          <div className="rounded-full bg-surface px-2 py-1 text-[11px] font-bold text-board">{legRules.length} 局</div>
        </div>
      </summary>
      <div className="mt-3 grid gap-2">
        {legRules.map((rule) => (
          <div key={rule.legNumber} className="grid gap-2 rounded-lg border border-wire bg-surface p-2">
            <div className="text-xs font-bold text-muted">{getLegRuleLabel(rule)}</div>
            {rule.participantMode === "singles" ? (
              <div className="grid gap-2 md:grid-cols-2">
                <label className="label">
                  {participantAName}
                  <select className="form-input" name={`leg_${rule.legNumber}_participant_a_user_id`}>
                    <option value="">不指定</option>
                    {participantAMembers.map((member) => (
                      <option key={member.userId} value={member.userId}>{member.name}</option>
                    ))}
                  </select>
                </label>
                <label className="label">
                  {participantBName}
                  <select className="form-input" name={`leg_${rule.legNumber}_participant_b_user_id`}>
                    <option value="">不指定</option>
                    {participantBMembers.map((member) => (
                      <option key={member.userId} value={member.userId}>{member.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <p className="text-xs text-muted">双人局和团队局默认记录双方全部队员；需要精确到人时建议从计分页完成。</p>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
