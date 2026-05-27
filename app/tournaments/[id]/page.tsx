import Link from "next/link";
import { cancelRegistrationAction, registerForTournamentAction } from "@/lib/actions/tournaments";
import { submitManualResultAction } from "@/lib/actions/matches";
import { getCurrentUserAndProfile } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { updateTournamentStandings } from "@/lib/algorithms/standings";
import { getDartModeLabel, getGameVariantLabel, getLegRuleLabel } from "@/lib/darts/variants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { MatchLegRule, MatchSummary, ParticipantSeed, Tournament } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function TournamentDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await getCurrentUserAndProfile();

  if (!hasSupabaseEnv()) return <SetupNotice />;

  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .single();

  if (!tournament) {
    return (
      <Card>
        <p className="text-sm text-slate-600">赛事不存在或无权访问。</p>
      </Card>
    );
  }

  const [{ data: participants }, { data: groups }, { data: groupMembers }, { data: matches }, { data: registration }] =
    await Promise.all([
      supabase
        .from("tournament_participants")
        .select("id, display_name, rating_snapshot, user_id, team_id, participant_type")
        .eq("tournament_id", id)
        .eq("status", "active")
        .order("seed"),
      supabase.from("groups").select("*").eq("tournament_id", id).order("group_index"),
      supabase.from("group_members").select("*"),
      supabase
        .from("matches")
        .select("*")
        .eq("tournament_id", id)
        .order("round_number")
        .order("match_number"),
      user
        ? supabase
            .from("tournament_registrations")
            .select("*")
            .eq("tournament_id", id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null })
    ]);

  const participantSeeds: ParticipantSeed[] = (participants || []).map((participant) => ({
    id: participant.id,
    name: participant.display_name,
    rating: participant.rating_snapshot || 1000
  }));
  const participantById = new Map(participantSeeds.map((participant) => [participant.id, participant]));
  const standings = updateTournamentStandings(participantSeeds, (matches || []) as MatchSummary[]);
  const tournamentData = tournament as Tournament;
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
      <section className="rounded-lg border border-wire bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-board">{tournamentData.status}</div>
            <h1 className="mt-1 text-3xl font-bold">{tournamentData.name}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              {tournamentData.description || "暂无赛事说明"}
            </p>
          </div>
          <RegistrationPanel tournament={tournamentData} registration={registration} />
        </div>
        <dl className="mt-6 grid gap-3 text-sm md:grid-cols-4">
          <Info label="地点" value={tournamentData.location || "待定"} />
          <Info label="比赛开始" value={formatDateTime(tournamentData.tournament_start_at)} />
          <Info label="赛制" value={tournamentData.format === "round_robin" ? "小组循环" : "单淘汰"} />
          <Info label="队伍" value={`${participantSeeds.length}/${tournamentData.max_participants} 个参赛主体`} />
          <Info label="类型" value={`${tournamentData.tournament_type} · 每队 ${tournamentData.team_size} 人`} />
          <Info label="制式" value={getDartModeLabel(tournamentData.dart_mode)} />
          <Info label="硬镖" value={`${tournamentData.dart_game} · BO${tournamentData.best_of}`} />
          <Info label="软镖" value={getGameVariantLabel({ dartMode: "soft", gameVariant: tournamentData.soft_game })} />
          <Info label="报名开始" value={formatDateTime(tournamentData.registration_start_at)} />
          <Info label="报名截止" value={formatDateTime(tournamentData.registration_end_at)} />
        </dl>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <h2 className="text-lg font-bold">排名表</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2">#</th>
                  <th>队伍/选手</th>
                  <th>场</th>
                  <th>胜</th>
                  <th>负</th>
                  <th>Leg +/-</th>
                  <th>积分</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, index) => (
                  <tr key={row.participantId} className="border-t border-wire">
                    <td className="py-2">{index + 1}</td>
                    <td className="font-semibold">{row.name}</td>
                    <td>{row.played}</td>
                    <td>{row.wins}</td>
                    <td>{row.losses}</td>
                    <td>{row.legDiff}</td>
                    <td>{row.points}</td>
                  </tr>
                ))}
                {standings.length === 0 ? (
                  <tr>
                    <td className="py-4 text-slate-500" colSpan={7}>暂无排名数据。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">分组</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {(groups || []).map((group) => {
              const members = (groupMembers || [])
                .filter((member) => member.group_id === group.id)
                .map((member) => participantById.get(member.participant_id))
                .filter(Boolean) as ParticipantSeed[];
              return (
                <div key={group.id} className="rounded-lg border border-wire p-4">
                  <h3 className="font-bold">{group.name} 组</h3>
                  <ul className="mt-3 grid gap-2 text-sm text-slate-600">
                    {members.map((member) => (
                      <li key={member.id} className="rounded-lg bg-field px-3 py-2">
                        <span>{member.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {(groups || []).length === 0 ? <p className="text-sm text-slate-600">暂未生成分组。</p> : null}
          </div>
        </Card>
      </section>

      <Card>
        <h2 className="text-lg font-bold">对阵表</h2>
        <div className="mt-4 grid gap-3">
          {(matches || []).map((match) => (
            <div key={match.id} className="grid gap-3 rounded-lg border border-wire p-4 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {match.stage} · R{match.round_number} M{match.match_number} · {match.status}
                </div>
                <div className="mt-1 text-xs font-semibold text-board">
                  {getDartModeLabel(match.dart_mode)} · {getGameVariantLabel({ dartMode: match.dart_mode, gameVariant: match.game_variant })}
                </div>
                <div className="mt-1 text-base font-bold">
                  {participantById.get(match.participant_a_id || "")?.name || "TBD"}{" "}
                  <span className="text-slate-400">vs</span>{" "}
                  {participantById.get(match.participant_b_id || "")?.name || "TBD"}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  比分 {match.score_a}:{match.score_b}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(match.dart_mode || "steel") === "steel" && match.status !== "completed" ? (
                  <Link className="rounded-lg bg-board px-3 py-2 text-sm font-semibold text-white" href={`/scorer/${match.id}`}>
                    计分
                  </Link>
                ) : null}
                {tournamentData.manual_result_allowed && match.status !== "completed" ? (
                  <ManualResultMiniForm
                    match={match}
                    participantById={participantById}
                    participantMembersById={participantMembersById}
                  />
                ) : null}
              </div>
            </div>
          ))}
          {(matches || []).length === 0 ? <p className="text-sm text-slate-600">暂未生成赛程。</p> : null}
        </div>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-field p-3">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

function RegistrationPanel({
  tournament,
  registration
}: {
  tournament: Tournament;
  registration: { status?: string } | null;
}) {
  if (registration?.status && registration.status !== "cancelled") {
    return (
      <form action={cancelRegistrationAction}>
        <input type="hidden" name="tournament_id" value={tournament.id} />
        <div className="mb-2 text-sm font-semibold text-board">报名状态：{registration.status}</div>
        <Button type="submit" variant="secondary">取消报名</Button>
      </form>
    );
  }

  if (tournament.status !== "registration_open") {
    return <div className="rounded-lg bg-field px-4 py-3 text-sm font-semibold">当前不可报名</div>;
  }

  return (
    <form action={registerForTournamentAction} className="grid gap-2">
      <input type="hidden" name="tournament_id" value={tournament.id} />
      {tournament.team_size > 1 ? (
        <input className="form-input" name="preferred_partner_user_id" placeholder="可选：想搭档的用户 ID" />
      ) : null}
      <Button type="submit">报名参赛</Button>
    </form>
  );
}

function ManualResultMiniForm({
  match,
  participantById,
  participantMembersById
}: {
  match: {
    id: string;
    participant_a_id: string | null;
    participant_b_id: string | null;
    dart_mode?: string | null;
    game_variant?: string | null;
    leg_rules?: MatchLegRule[] | null;
  };
  participantById: Map<string, ParticipantSeed>;
  participantMembersById: Map<string, Array<{ userId: string; name: string }>>;
}) {
  const isSoft = (match.dart_mode || "steel") === "soft";
  const legRules = Array.isArray(match.leg_rules) ? match.leg_rules : [];

  return (
    <details className="rounded-lg border border-wire bg-white px-3 py-2 text-sm">
      <summary className="cursor-pointer font-semibold">手动录入</summary>
      <form action={submitManualResultAction} className="mt-3 grid gap-2">
        <input type="hidden" name="match_id" value={match.id} />
        <select className="form-input" name="winner_participant_id" required>
          <option value="">选择胜者</option>
          {match.participant_a_id ? (
            <option value={match.participant_a_id}>{participantById.get(match.participant_a_id)?.name}</option>
          ) : null}
          {match.participant_b_id ? (
            <option value={match.participant_b_id}>{participantById.get(match.participant_b_id)?.name}</option>
          ) : null}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input className="form-input" type="number" name="score_a" min={0} placeholder="A" />
          <input className="form-input" type="number" name="score_b" min={0} placeholder="B" />
        </div>
        {legRules.length > 0 ? (
          <LegLineupFields
            legRules={legRules}
            participantAName={match.participant_a_id ? participantById.get(match.participant_a_id)?.name || "A" : "A"}
            participantBName={match.participant_b_id ? participantById.get(match.participant_b_id)?.name || "B" : "B"}
            participantAMembers={match.participant_a_id ? participantMembersById.get(match.participant_a_id) || [] : []}
            participantBMembers={match.participant_b_id ? participantMembersById.get(match.participant_b_id) || [] : []}
          />
        ) : null}
        {isSoft ? (
          <div className="grid gap-3 rounded-lg bg-field p-3">
            <div className="text-xs font-bold text-slate-600">软镖个人数据</div>
            {match.participant_a_id ? (
              <SoftStatsFields
                title={`A · ${participantById.get(match.participant_a_id)?.name || "A"}`}
                members={participantMembersById.get(match.participant_a_id) || []}
              />
            ) : null}
            {match.participant_b_id ? (
              <SoftStatsFields
                title={`B · ${participantById.get(match.participant_b_id)?.name || "B"}`}
                members={participantMembersById.get(match.participant_b_id) || []}
              />
            ) : null}
          </div>
        ) : null}
        <Button type="submit" variant="secondary">提交待确认</Button>
      </form>
    </details>
  );
}

function SoftStatsFields({
  title,
  members
}: {
  title: string;
  members: Array<{ userId: string; name: string }>;
}) {
  if (members.length === 0) return null;

  return (
    <div className="grid gap-2 rounded-lg border border-wire bg-white p-3">
      <div className="text-xs font-bold text-slate-700">{title}</div>
      {members.map((member) => (
        <div key={member.userId} className="grid gap-2">
          <div className="text-xs font-semibold text-slate-500">{member.name}</div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <input className="form-input" type="number" step="0.01" min={0} name={`stats_${member.userId}_average_score`} placeholder="均分" />
            <input className="form-input" type="number" step="0.01" min={0} name={`stats_${member.userId}_average_mpr`} placeholder="MPR" />
            <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_ton80`} placeholder="TON80" />
            <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_hat_trick`} placeholder="帽子戏法" />
            <input className="form-input" type="number" min={0} name={`stats_${member.userId}_highest_checkout`} placeholder="最高拆分" />
            <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_high_checkout`} placeholder="高拆次数" />
            <input className="form-input" type="number" min={0} name={`stats_${member.userId}_count_white_horse`} placeholder="白马" />
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
      <div className="text-xs font-bold text-slate-600">每局出场</div>
      {legRules.map((rule) => (
        <div key={rule.legNumber} className="grid gap-2 rounded-lg border border-wire bg-white p-2">
          <div className="text-xs font-bold text-slate-700">{getLegRuleLabel(rule)}</div>
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
            <p className="text-xs text-slate-500">本局默认记录双方全部队员。</p>
          )}
        </div>
      ))}
    </div>
  );
}
