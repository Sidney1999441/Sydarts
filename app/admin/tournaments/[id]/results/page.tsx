import { adminUpdateMatchResultAction } from "@/lib/actions/matches";
import { requireAdmin } from "@/lib/auth/guards";
import { getMatchRulesSummary, getLegRuleLabel } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { createResultSubmissionId } from "@/lib/results/submission";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { MatchDartMode, MatchLegRule } from "@/types/domain";

export const dynamic = "force-dynamic";

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
  const teamMembersByTeamId = new Map<string, Array<{ userId: string; name: string }>>();
  for (const member of teamMembers || []) {
    const members = teamMembersByTeamId.get(member.team_id) || [];
    members.push({
      userId: member.user_id,
      name: statProfileById.get(member.user_id)?.display_name || member.user_id
    });
    teamMembersByTeamId.set(member.team_id, members);
  }
  const participantMembersById = new Map<string, Array<{ userId: string; name: string }>>();
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
      <div>
        <h1 className="text-2xl font-bold">成绩管理</h1>
        <p className="mt-2 text-sm text-muted">管理员可修改结果、处理确认记录，并补录个人数据。</p>
      </div>
      <Card>
        <div className="grid gap-4">
          {(matches || []).map((match) => {
            const dartMode = ((match.dart_mode || "steel") === "soft" ? "soft" : "steel") as MatchDartMode;
            const legRules = Array.isArray(match.leg_rules) ? match.leg_rules as MatchLegRule[] : [];

            return (
              <form key={match.id} action={adminUpdateMatchResultAction} className="grid gap-3 rounded-lg border border-wire p-4">
                <input type="hidden" name="match_id" value={match.id} />
                <input type="hidden" name="tournament_id" value={id} />
                <input type="hidden" name="submission_id" value={createResultSubmissionId()} />
                <div className="grid gap-3 lg:grid-cols-[1fr_120px_120px_220px_auto] lg:items-end">
                  <div>
                    <div className="text-xs font-semibold text-muted">
                      R{match.round_number} M{match.match_number} / {match.status}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-board">
                      {getMatchRulesSummary({
                        dartMode,
                        gameVariant: match.game_variant,
                        legRules: match.leg_rules
                      })}
                    </div>
                    <div className="mt-1 font-bold">
                      {participantById.get(match.participant_a_id)?.display_name || "TBD"} vs {participantById.get(match.participant_b_id)?.display_name || "TBD"}
                    </div>
                  </div>
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
                      {match.participant_a_id ? <option value={match.participant_a_id}>{participantById.get(match.participant_a_id)?.display_name}</option> : null}
                      {match.participant_b_id ? <option value={match.participant_b_id}>{participantById.get(match.participant_b_id)?.display_name}</option> : null}
                    </select>
                  </label>
                  <Button type="submit" variant="secondary">保存</Button>
                </div>
                {legRules.length > 0 ? (
                  <LegLineupFields
                    legRules={legRules}
                    participantAName={match.participant_a_id ? participantById.get(match.participant_a_id)?.display_name || "A" : "A"}
                    participantBName={match.participant_b_id ? participantById.get(match.participant_b_id)?.display_name || "B" : "B"}
                    participantAMembers={match.participant_a_id ? participantMembersById.get(match.participant_a_id) || [] : []}
                    participantBMembers={match.participant_b_id ? participantMembersById.get(match.participant_b_id) || [] : []}
                  />
                ) : null}
                <div className="grid gap-3 rounded-lg bg-field p-3">
                  <div className="text-xs font-bold text-muted">个人数据</div>
                  {match.participant_a_id ? (
                    <ManualStatsFields
                      title={`A / ${participantById.get(match.participant_a_id)?.display_name || "A"}`}
                      dartMode={dartMode}
                      members={participantMembersById.get(match.participant_a_id) || []}
                    />
                  ) : null}
                  {match.participant_b_id ? (
                    <ManualStatsFields
                      title={`B / ${participantById.get(match.participant_b_id)?.display_name || "B"}`}
                      dartMode={dartMode}
                      members={participantMembersById.get(match.participant_b_id) || []}
                    />
                  ) : null}
                </div>
              </form>
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
  members: Array<{ userId: string; name: string }>;
}) {
  if (members.length === 0) return null;

  return (
    <div className="grid gap-2 rounded-lg border border-wire bg-surface p-3">
      <div className="text-xs font-bold text-muted">{title}</div>
      <div className="text-[11px] font-semibold text-muted">
        {dartMode === "soft"
          ? "软镖 01 录均分和拆分；米老鼠录 MPR、总标数、5/6/7 标、帽子戏法和白马。"
          : "可录入三镖均分、180、100+、140+、最高拆和高拆。"}
      </div>
      {members.map((member) => (
        <div key={member.userId} className="grid gap-2">
          <div className="text-xs font-semibold text-muted">{member.name}</div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            <input className="form-input" type="number" step="0.01" min={0} name={`stats_${member.userId}_average_score`} placeholder={dartMode === "soft" ? "01均分" : "三镖均分"} />
            {dartMode === "steel" ? (
              <>
                <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_100_plus`} placeholder="100+" />
                <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_140_plus`} placeholder="140+" />
                <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_180`} placeholder="180" />
              </>
            ) : (
              <>
                <input className="form-input" type="number" step="0.01" min={0} name={`stats_${member.userId}_average_mpr`} placeholder="MPR" />
                <input className="form-input" type="number" min={0} name={`stats_${member.userId}_total_marks`} placeholder="总标数" />
                <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_5_marks`} placeholder="5标" />
                <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_6_marks`} placeholder="6标" />
                <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_7_marks`} placeholder="7标" />
                <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_9_marks`} placeholder="9 Mark" />
                <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_ton80`} placeholder="TON80" />
                <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_hat_trick`} placeholder="帽子戏法" />
                <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_white_horse`} placeholder="白马" />
              </>
            )}
            <input className="form-input" type="number" min={0} name={`stats_${member.userId}_highest_checkout`} placeholder="最高拆" />
            <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_high_checkout`} placeholder="高拆次数" />
          </div>
        </div>
      ))}
    </div>
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
  participantAMembers: Array<{ userId: string; name: string }>;
  participantBMembers: Array<{ userId: string; name: string }>;
}) {
  return (
    <div className="grid gap-2 rounded-lg bg-field p-3">
      <div className="text-xs font-bold text-muted">每局出场</div>
      {legRules.map((rule) => (
        <div key={rule.legNumber} className="grid gap-2 rounded-lg border border-wire bg-surface p-2">
          <div className="text-xs font-bold text-muted">{getLegRuleLabel(rule)}</div>
          {rule.participantMode === "singles" ? (
            <div className="grid gap-2 md:grid-cols-2">
              <label className="label">
                {participantAName}
                <select className="form-input" name={`leg_${rule.legNumber}_participant_a_user_id`} required>
                  <option value="">选择选手</option>
                  {participantAMembers.map((member) => (
                    <option key={member.userId} value={member.userId}>{member.name}</option>
                  ))}
                </select>
              </label>
              <label className="label">
                {participantBName}
                <select className="form-input" name={`leg_${rule.legNumber}_participant_b_user_id`} required>
                  <option value="">选择选手</option>
                  {participantBMembers.map((member) => (
                    <option key={member.userId} value={member.userId}>{member.name}</option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <p className="text-xs text-muted">本局默认记录双方全部队员。</p>
          )}
        </div>
      ))}
    </div>
  );
}
