import { ClipboardCheck } from "lucide-react";
import { adminUpdateMatchResultAction } from "@/lib/actions/matches";
import { requireAdmin } from "@/lib/auth/guards";
import { getSoftStatFields, isSoftHighScoreVariant, type SoftStatField } from "@/lib/darts/soft-stats";
import { getLegRuleLabel, getMatchRulesSummary } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { createResultSubmissionId } from "@/lib/results/submission";
import { formatUserDisplayName, isOpaqueIdentifier } from "@/lib/scorer/display-names";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { MatchDartMode, MatchLegLineup, MatchLegResult, MatchLegRule } from "@/types/domain";

export const dynamic = "force-dynamic";

type ResultMember = { userId: string; name: string };
type StoredUserStats = Record<string, Record<string, unknown>>;
type StoredLegResult = MatchLegLineup & {
  winnerParticipantId?: string | null;
  participantMode?: MatchLegResult["participantMode"];
  dartMode?: MatchLegResult["dartMode"];
  gameVariant?: MatchLegResult["gameVariant"];
  checkoutScore?: number | null;
  scoreA?: number | null;
  scoreB?: number | null;
  userStats?: StoredUserStats;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function numberOrNull(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function formDefault(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
}

function readStoredLegLineups(details: unknown): MatchLegLineup[] {
  if (!isRecord(details) || !Array.isArray(details.legLineups)) return [];
  return details.legLineups
    .filter(isRecord)
    .map((lineup) => ({
      legNumber: Number(lineup.legNumber),
      participantAUserIds: stringArray(lineup.participantAUserIds),
      participantBUserIds: stringArray(lineup.participantBUserIds)
    }))
    .filter((lineup) => Number.isFinite(lineup.legNumber));
}

function readStoredLegResults(details: unknown): StoredLegResult[] {
  if (!isRecord(details) || !Array.isArray(details.legResults)) return [];
  return details.legResults
    .filter(isRecord)
    .map((result) => ({
      legNumber: Number(result.legNumber),
      participantAUserIds: stringArray(result.participantAUserIds),
      participantBUserIds: stringArray(result.participantBUserIds),
      winnerParticipantId: typeof result.winnerParticipantId === "string" ? result.winnerParticipantId : null,
      checkoutScore: numberOrNull(result.checkoutScore),
      scoreA: numberOrNull(result.scoreA),
      scoreB: numberOrNull(result.scoreB),
      participantMode: result.participantMode as StoredLegResult["participantMode"],
      dartMode: result.dartMode as StoredLegResult["dartMode"],
      gameVariant: result.gameVariant as StoredLegResult["gameVariant"],
      userStats: isRecord(result.userStats) ? (result.userStats as StoredUserStats) : {}
    }))
    .filter((result) => Number.isFinite(result.legNumber));
}

function readStoredUserStats(details: unknown): StoredUserStats {
  if (!isRecord(details) || !isRecord(details.userStats)) return {};
  return details.userStats as StoredUserStats;
}

function statDefault(stats: Record<string, unknown> | undefined, ...keys: string[]) {
  if (!stats) return undefined;
  for (const key of keys) {
    const value = stats[key];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return undefined;
}

export default async function ResultsAdminPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
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
      ? await admin.from("profiles").select("id, uid, display_name").in("id", statUserIds)
      : { data: [] };
  const statProfileById = new Map((statProfiles || []).map((profile) => [profile.id, profile]));
  const teamMembersByTeamId = new Map<string, ResultMember[]>();

  for (const member of teamMembers || []) {
    const members = teamMembersByTeamId.get(member.team_id) || [];
    const profileRow = statProfileById.get(member.user_id);
    members.push({
      userId: member.user_id,
      name: formatUserDisplayName({
        userId: member.user_id,
        displayName: profileRow?.display_name,
        uid: profileRow?.uid
      })
    });
    teamMembersByTeamId.set(member.team_id, members);
  }

  const participantMembersById = new Map<string, ResultMember[]>();
  for (const participant of participants || []) {
    if (participant.participant_type === "user" && participant.user_id) {
      participantMembersById.set(participant.id, [
        {
          userId: participant.user_id,
          name: formatUserDisplayName({
            userId: participant.user_id,
            displayName: statProfileById.get(participant.user_id)?.display_name,
            uid: statProfileById.get(participant.user_id)?.uid,
            fallback: participant.display_name
          })
        }
      ]);
    } else if (participant.team_id) {
      participantMembersById.set(participant.id, teamMembersByTeamId.get(participant.team_id) || []);
    }
  }
  const getParticipantDisplayName = (participantId: string | null | undefined, fallback: string) => {
    if (!participantId) return fallback;
    const participant = participantById.get(participantId);
    const rawName = participant?.display_name || fallback;
    const memberNames = (participantMembersById.get(participantId) || [])
      .map((member) => member.name)
      .filter(Boolean)
      .join(" / ");
    return rawName && !isOpaqueIdentifier(rawName) ? rawName : memberNames || rawName || fallback;
  };

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
            const participantAName = getParticipantDisplayName(match.participant_a_id, "A");
            const participantBName = getParticipantDisplayName(match.participant_b_id, "B");
            const existingLegLineups = readStoredLegLineups(match.details);
            const existingLegResults = readStoredLegResults(match.details);
            const existingUserStats = readStoredUserStats(match.details);
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
                    <AdminLegResultFields
                      legRules={legRules}
                      participantAId={match.participant_a_id}
                      participantBId={match.participant_b_id}
                      participantAName={participantAName}
                      participantBName={participantBName}
                      participantAMembers={match.participant_a_id ? participantMembersById.get(match.participant_a_id) || [] : []}
                      participantBMembers={match.participant_b_id ? participantMembersById.get(match.participant_b_id) || [] : []}
                      existingLegLineups={existingLegLineups}
                      existingLegResults={existingLegResults}
                    />
                  ) : null}

                  <div className="grid gap-3 rounded-lg bg-field p-3">
                    <div className="text-xs font-bold text-muted">个人数据（可选）</div>
                    {match.participant_a_id ? (
                      <ManualStatsFields
                        title={`A / ${participantAName}`}
                        dartMode={dartMode}
                        members={participantMembersById.get(match.participant_a_id) || []}
                        existingUserStats={existingUserStats}
                      />
                    ) : null}
                    {match.participant_b_id ? (
                      <ManualStatsFields
                        title={`B / ${participantBName}`}
                        dartMode={dartMode}
                        members={participantMembersById.get(match.participant_b_id) || []}
                        existingUserStats={existingUserStats}
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
  members,
  existingUserStats = {}
}: {
  title: string;
  dartMode: "steel" | "soft";
  members: ResultMember[];
  existingUserStats?: StoredUserStats;
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
        {members.map((member, index) => {
          const existingStats = existingUserStats[member.userId];
          return (
          <details key={member.userId} className="rounded-lg bg-field p-3" open={members.length <= 2 && index === 0}>
            <summary className="cursor-pointer text-sm font-bold">{member.name}</summary>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
              <input
                className="form-input"
                type="number"
                step="0.01"
                min={0}
                name={`stats_${member.userId}_average_score`}
                defaultValue={statDefault(existingStats, "averageScore", "averagePer3Darts")}
                placeholder={dartMode === "soft" ? "PPR/均分" : "三镖均分"}
              />
              {dartMode === "steel" ? (
                <>
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_100_plus`} placeholder="100+" defaultValue={statDefault(existingStats, "count100Plus")} />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_140_plus`} placeholder="140+" defaultValue={statDefault(existingStats, "count140Plus")} />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_180`} placeholder="180" defaultValue={statDefault(existingStats, "count180", "countTon80")} />
                </>
              ) : (
                <>
                  <input className="form-input" type="number" step="0.01" min={0} name={`stats_${member.userId}_average_ppd`} placeholder="PPD" />
                  <input className="form-input" type="number" step="0.01" min={0} name={`stats_${member.userId}_average_mpr`} placeholder="MPR" defaultValue={statDefault(existingStats, "averageMpr")} />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_5_marks`} placeholder="5 Mark" defaultValue={statDefault(existingStats, "count5Marks")} />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_6_marks`} placeholder="6 Mark" defaultValue={statDefault(existingStats, "count6Marks")} />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_7_marks`} placeholder="7 Mark" defaultValue={statDefault(existingStats, "count7Marks")} />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_9_marks`} placeholder="9 Mark" defaultValue={statDefault(existingStats, "count9Marks")} />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_ton80`} placeholder="TON80" defaultValue={statDefault(existingStats, "countTon80", "count180")} />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_hat_trick`} placeholder="帽子" defaultValue={statDefault(existingStats, "countHatTrick")} />
                  <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_white_horse`} placeholder="白马" defaultValue={statDefault(existingStats, "countWhiteHorse")} />
                </>
              )}
              <input className="form-input" type="number" min={0} name={`stats_${member.userId}_highest_checkout`} placeholder="最高拆" defaultValue={statDefault(existingStats, "highestCheckout")} />
              <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_high_checkout`} placeholder="高拆次数" defaultValue={statDefault(existingStats, "countHighCheckout")} />
            </div>
          </details>
          );
        })}
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

function AdminLegResultFields({
  legRules,
  participantAId,
  participantBId,
  participantAName,
  participantBName,
  participantAMembers,
  participantBMembers,
  existingLegLineups,
  existingLegResults
}: {
  legRules: MatchLegRule[];
  participantAId: string;
  participantBId: string;
  participantAName: string;
  participantBName: string;
  participantAMembers: ResultMember[];
  participantBMembers: ResultMember[];
  existingLegLineups: MatchLegLineup[];
  existingLegResults: StoredLegResult[];
}) {
  return (
    <details className="rounded-lg bg-field p-3" open>
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-bold text-muted">每局结果与出场</div>
          <div className="rounded-full bg-surface px-2 py-1 text-[11px] font-bold text-board">{legRules.length} 局</div>
        </div>
      </summary>
      <div className="mt-3 grid gap-3">
        {legRules.map((rule) => {
          const existingResult = existingLegResults.find((item) => item.legNumber === rule.legNumber);
          const existingLineup =
            existingResult || existingLegLineups.find((item) => item.legNumber === rule.legNumber);

          return (
          <div key={rule.legNumber} className="grid gap-3 rounded-lg border border-wire bg-surface p-3">
            <div className="text-xs font-bold text-muted">{getLegRuleLabel(rule)}</div>
            <div className="grid gap-2 md:grid-cols-[minmax(0,1.3fr)_120px_120px_120px] md:items-end">
              <label className="label">
                本局胜方
                <select className="form-input" name={`leg_${rule.legNumber}_winner_participant_id`} defaultValue={existingResult?.winnerParticipantId || ""}>
                  <option value="">未设定</option>
                  <option value={participantAId}>{participantAName}</option>
                  <option value={participantBId}>{participantBName}</option>
                </select>
              </label>
              <label className="label">
                A 局分
                <input className="form-input" type="number" min={0} name={`leg_${rule.legNumber}_score_a`} placeholder="可选" defaultValue={formDefault(existingResult?.scoreA)} />
              </label>
              <label className="label">
                B 局分
                <input className="form-input" type="number" min={0} name={`leg_${rule.legNumber}_score_b`} placeholder="可选" defaultValue={formDefault(existingResult?.scoreB)} />
              </label>
              <label className="label">
                最高拆
                <input className="form-input" type="number" min={0} name={`leg_${rule.legNumber}_checkout_score`} placeholder="可选" defaultValue={formDefault(existingResult?.checkoutScore)} />
              </label>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <AdminLegLineupSide
                legNumber={rule.legNumber}
                fieldPrefix="participant_a"
                rule={rule}
                title={participantAName}
                members={participantAMembers}
                selectedUserIds={existingLineup?.participantAUserIds || []}
              />
              <AdminLegLineupSide
                legNumber={rule.legNumber}
                fieldPrefix="participant_b"
                rule={rule}
                title={participantBName}
                members={participantBMembers}
                selectedUserIds={existingLineup?.participantBUserIds || []}
              />
            </div>
            <details className="rounded-lg bg-field p-2">
              <summary className="cursor-pointer text-xs font-bold text-muted">本局个人数据</summary>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <AdminLegStatsSide legNumber={rule.legNumber} rule={rule} title={participantAName} members={participantAMembers} existingUserStats={existingResult?.userStats || {}} />
                <AdminLegStatsSide legNumber={rule.legNumber} rule={rule} title={participantBName} members={participantBMembers} existingUserStats={existingResult?.userStats || {}} />
              </div>
            </details>
          </div>
          );
        })}
      </div>
    </details>
  );
}

function adminLegSlotCount(rule: MatchLegRule, memberCount: number) {
  if (memberCount <= 0) return 1;
  if (rule.participantMode === "singles") return 1;
  if (rule.participantMode === "doubles") return Math.min(2, memberCount);
  return memberCount;
}

function AdminLegLineupSide({
  legNumber,
  fieldPrefix,
  rule,
  title,
  members,
  selectedUserIds = []
}: {
  legNumber: number;
  fieldPrefix: "participant_a" | "participant_b";
  rule: MatchLegRule;
  title: string;
  members: ResultMember[];
  selectedUserIds?: string[];
}) {
  const slots = adminLegSlotCount(rule, members.length);

  return (
    <div className="grid gap-2 rounded-lg bg-field p-2">
      <div className="text-xs font-bold text-muted">{title}</div>
      {Array.from({ length: slots }, (_, index) => (
        <label key={`${fieldPrefix}-${legNumber}-${index}`} className="label">
          {slots === 1 ? "出场选手" : `第 ${index + 1} 位`}
          <select className="form-input" name={`leg_${legNumber}_${fieldPrefix}_user_id`} defaultValue={selectedUserIds[index] || ""}>
            <option value="">自动/不指定</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>{member.name}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

function AdminLegStatsSide({
  legNumber,
  rule,
  title,
  members,
  existingUserStats = {}
}: {
  legNumber: number;
  rule: MatchLegRule;
  title: string;
  members: ResultMember[];
  existingUserStats?: StoredUserStats;
}) {
  if (members.length === 0) return null;
  const dartMode = rule.dartMode;
  const softFields =
    dartMode === "soft"
      ? getSoftStatFields(rule.gameVariant).filter(
          (field) => !(isSoftHighScoreVariant(rule.gameVariant) && (field.key === "highestTurnScore" || field.key === "totalScoredPoints"))
        )
      : [];

  return (
    <div className="grid gap-2 rounded-lg bg-surface p-2">
      <div className="text-xs font-bold text-muted">{title}</div>
      {members.map((member) => {
        const existingStats = existingUserStats[member.userId];
        return (
        <details key={member.userId} className="rounded-lg bg-field p-2">
          <summary className="cursor-pointer text-xs font-bold">{member.name}</summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {dartMode === "soft" ? (
              <>
                {isSoftHighScoreVariant(rule.gameVariant) ? (
                  <p className="col-span-2 rounded-lg bg-field p-2 text-xs font-semibold text-muted">
                    高分赛个人成绩取上方 A/B 局分；这里只补录帽子、TON80 等特殊数据。
                  </p>
                ) : null}
                {softFields.map((field) => (
                  <AdminSoftStatInput
                    key={`${member.userId}-${field.key}`}
                    legNumber={legNumber}
                    userId={member.userId}
                    field={field}
                    existingStats={existingStats}
                  />
                ))}
              </>
            ) : (
              <>
                <input className="form-input" type="number" step="0.01" min={0} name={`leg_${legNumber}_stats_${member.userId}_average_score`} placeholder="均分" defaultValue={statDefault(existingStats, "averageScore", "averagePer3Darts")} />
                <input className="form-input" type="number" min={0} name={`leg_${legNumber}_stats_${member.userId}_count_100_plus`} placeholder="100+" defaultValue={statDefault(existingStats, "count100Plus")} />
                <input className="form-input" type="number" min={0} name={`leg_${legNumber}_stats_${member.userId}_count_140_plus`} placeholder="140+" defaultValue={statDefault(existingStats, "count140Plus")} />
                <input className="form-input" type="number" min={0} name={`leg_${legNumber}_stats_${member.userId}_count_180`} placeholder="180" defaultValue={statDefault(existingStats, "count180", "countTon80")} />
                <input className="form-input" type="number" min={0} name={`leg_${legNumber}_stats_${member.userId}_highest_checkout`} placeholder="最高拆" defaultValue={statDefault(existingStats, "highestCheckout")} />
                <input className="form-input" type="number" min={0} name={`leg_${legNumber}_stats_${member.userId}_count_high_checkout`} placeholder="高拆次数" defaultValue={statDefault(existingStats, "countHighCheckout")} />
              </>
            )}
          </div>
        </details>
        );
      })}
    </div>
  );
}

function AdminSoftStatInput({
  legNumber,
  userId,
  field,
  existingStats
}: {
  legNumber: number;
  userId: string;
  field: SoftStatField;
  existingStats?: Record<string, unknown>;
}) {
  if (field.key === "averageScore") {
    return (
      <>
        <input
          className="form-input"
          type="number"
          step={field.step || "0.01"}
          min={0}
          name={`leg_${legNumber}_stats_${userId}_average_score`}
          placeholder="PPR"
          defaultValue={statDefault(existingStats, "averageScore", "averagePer3Darts")}
        />
        <input
          className="form-input"
          type="number"
          step="0.01"
          min={0}
          name={`leg_${legNumber}_stats_${userId}_average_ppd`}
          placeholder="PPD"
        />
      </>
    );
  }

  return (
    <input
      className="form-input"
      type="number"
      step={field.step || "1"}
      min={0}
      name={`leg_${legNumber}_stats_${userId}_${statFieldFormKey(field.key)}`}
      placeholder={field.label}
      defaultValue={statDefault(existingStats, String(field.key), field.key === "countTon80" ? "count180" : "")}
    />
  );
}

function statFieldFormKey(key: SoftStatField["key"]) {
  switch (key) {
    case "averageMpr":
      return "average_mpr";
    case "countTon80":
      return "count_ton80";
    case "countHatTrick":
      return "count_hat_trick";
    case "highestCheckout":
      return "highest_checkout";
    case "countHighCheckout":
      return "count_high_checkout";
    case "countWhiteHorse":
      return "count_white_horse";
    case "totalMarks":
      return "total_marks";
    case "count5Marks":
      return "count_5_marks";
    case "count6Marks":
      return "count_6_marks";
    case "count7Marks":
      return "count_7_marks";
    case "count9Marks":
      return "count_9_marks";
    case "totalScoredPoints":
      return "total_scored_points";
    case "totalDarts":
      return "total_darts";
    case "highestTurnScore":
      return "highest_turn_score";
    default:
      return String(key).replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }
}
