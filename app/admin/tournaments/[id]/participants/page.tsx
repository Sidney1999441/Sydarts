import {
  addTournamentTeamMemberAction,
  adminAddRegistrationByUserIdAction,
  createTournamentTeamManualAction,
  generateTeamsAction,
  registerSavedTeamForTournamentAction,
  removeTournamentTeamMemberAction,
  replaceTournamentTeamMembersAction,
  saveTournamentTeamAsSavedAction,
  updateRegistrationStatusAction,
  updateTournamentTeamAction
} from "@/lib/actions/tournaments";
import { UsersRound } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { AvatarUploader } from "@/components/ui/AvatarUploader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function ParticipantsAdminPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const [
    { data: tournament },
    { data: registrations },
    { data: participants },
    { data: teams },
    { data: members },
    { data: savedTeams }
  ] =
    await Promise.all([
      supabase.from("tournaments").select("*").eq("id", id).single(),
      supabase
        .from("tournament_registrations")
        .select("*")
        .eq("tournament_id", id)
        .order("created_at"),
      supabase
        .from("tournament_participants")
        .select("*")
        .eq("tournament_id", id)
        .order("seed"),
      supabase.from("teams").select("*").eq("tournament_id", id).order("created_at"),
      supabase.from("team_members").select("*"),
      supabase.from("saved_teams").select("*").eq("status", "active").order("updated_at", { ascending: false })
    ]);

  const userIds = [
    ...new Set([
      ...(registrations || []).map((registration) => registration.user_id),
      ...(registrations || [])
        .map((registration) => registration.preferred_partner_user_id)
        .filter(Boolean),
      ...(members || []).map((member) => member.user_id),
      ...(teams || []).map((team) => team.captain_user_id).filter(Boolean),
      ...(savedTeams || []).map((team) => team.captain_user_id).filter(Boolean)
    ])
  ];
  const { data: profiles } =
    userIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, uid, display_name, rating, skill_level")
          .in("id", userIds)
      : { data: [] };
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));

  return (
    <div className="grid gap-6">
      <CodlPageHeader
        kicker="CODL Admin"
        title="参赛选手管理"
        description={`${tournament?.name} · ${tournament?.tournament_type} · 每队 ${tournament?.team_size} 人`}
        icon={<UsersRound className="h-6 w-6" aria-hidden />}
        art="pattern"
      />

      <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">报名列表</h2>
            <form action={generateTeamsAction}>
              <input type="hidden" name="tournament_id" value={id} />
              <Button type="submit">自动生成队伍/参赛主体</Button>
            </form>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-2">用户</th>
                  <th>Rating</th>
                  <th>等级</th>
                  <th>意向搭档</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {(registrations || []).map((registration) => {
                  const profile = profileById.get(registration.user_id);
                  return (
                    <tr key={registration.id} className="border-t border-wire">
                      <td className="py-3">
                        <div className="font-semibold">{profile?.display_name || registration.user_id}</div>
                        <div className="text-xs text-muted">UID {profile?.uid || "------"}</div>
                        <div className="text-xs text-muted">{registration.user_id}</div>
                      </td>
                      <td>{registration.rating_snapshot}</td>
                      <td>{registration.skill_level_snapshot}</td>
                      <td>
                        {registration.preferred_partner_user_id
                          ? `${profileById.get(registration.preferred_partner_user_id)?.display_name ||
                              registration.preferred_partner_user_id} · UID ${
                              profileById.get(registration.preferred_partner_user_id)?.uid || "------"
                            }`
                          : "-"}
                      </td>
                      <td>{registration.status}</td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <RegistrationStatusForm registrationId={registration.id} tournamentId={id} status="confirmed" label="确认" />
                          <RegistrationStatusForm registrationId={registration.id} tournamentId={id} status="removed" label="移除" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {(registrations || []).length === 0 ? (
                  <tr>
                    <td className="py-4 text-muted" colSpan={6}>暂无报名。</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">手动添加用户</h2>
          <form action={adminAddRegistrationByUserIdAction} className="mt-4 grid gap-3">
            <input type="hidden" name="tournament_id" value={id} />
            <label className="label">
              用户 ID
              <input className="form-input" name="user_identifier" placeholder="UID 或用户 ID" required />
            </label>
            <Button type="submit" variant="secondary">添加到报名并确认</Button>
          </form>
        </Card>
      </section>

      {Number(tournament?.team_size || 1) > 1 ? (
        <Card>
          <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <h2 className="text-lg font-bold">手动创建赛事队伍</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                直接输入队名和本队队员 UID，系统会创建赛事队伍、参赛主体，并把队员同步为 confirmed 报名。
              </p>
              <p className="mt-2 text-xs font-semibold text-board">
                可先添加 1 人占位，之后再补齐；本赛事每队最多 {tournament?.team_size || 2} 人，队员不能同时属于另一支 active 队伍。
              </p>
            </div>
            <form action={createTournamentTeamManualAction} className="grid gap-3">
              <input type="hidden" name="tournament_id" value={id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="label">
                  队伍名称
                  <input className="form-input" name="team_name" placeholder="例如：蓝圈二队" />
                </label>
                <label className="label">
                  队长 UID
                  <input className="form-input" name="captain_identifier" placeholder="不填则默认第一行队员" />
                </label>
              </div>
              <label className="label">
                队员 UID
                <textarea
                  className="form-input min-h-28"
                  name="member_identifiers"
                  placeholder={`每行一个 UID，可先填 1 人，最多 ${tournament?.team_size || 2} 人`}
                  required
                />
              </label>
              <Button type="submit">创建赛事队伍</Button>
            </form>
          </div>
        </Card>
      ) : null}

      {Number(tournament?.team_size || 1) > 1 ? (
        <Card>
          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h2 className="text-lg font-bold">长期队伍复用</h2>
              <p className="mt-2 text-sm text-muted">
                长期队伍只复用名称、头像和队长；本次赛事队员请用 UID 逐个填写。
              </p>
            </div>
            <form action={registerSavedTeamForTournamentAction} className="grid gap-3">
              <input type="hidden" name="tournament_id" value={id} />
              <label className="label">
                长期队伍
                <select className="form-input" name="saved_team_id" required>
                  <option value="">选择长期队伍</option>
                  {(savedTeams || []).map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name} · 队长 {profileById.get(team.captain_user_id)?.display_name || team.captain_user_id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                本次队员 UID
                <textarea
                  className="form-input min-h-24"
                  name="member_identifiers"
                  placeholder={`每行一个 UID，本赛事每队 ${tournament?.team_size || 2} 人，必须包含队长`}
                  required
                />
              </label>
              <Button type="submit" variant="secondary">使用长期队伍报名</Button>
            </form>
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-lg font-bold">已生成队伍/参赛主体</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(participants || []).map((participant) => {
            const team = (teams || []).find((item) => item.id === participant.team_id);
            const teamMembers = (members || []).filter((member) => member.team_id === participant.team_id);
            const captain = team?.captain_user_id ? profileById.get(team.captain_user_id) : null;
            const linkedSavedTeam = team?.saved_team_id
              ? (savedTeams || []).find((item) => item.id === team.saved_team_id)
              : null;
            return (
              <div key={participant.id} className="grid gap-4 rounded-lg border border-wire p-4">
                <div>
                  <div className="font-bold">{participant.display_name}</div>
                  <div className="mt-1 text-sm text-muted">Rating {participant.rating_snapshot}</div>
                  {team ? (
                    <div className="mt-1 text-xs text-muted">
                      队长 {captain?.display_name || team.captain_user_id || "未设置"}
                      {captain?.uid ? ` · UID ${captain.uid}` : ""}
                      {linkedSavedTeam ? ` · 已保存：${linkedSavedTeam.name}` : ""}
                    </div>
                  ) : null}
                </div>
                {team ? (
                  <form action={updateTournamentTeamAction} className="grid gap-2 rounded-lg bg-field p-3">
                    <input type="hidden" name="tournament_id" value={id} />
                    <input type="hidden" name="team_id" value={team.id} />
                    <AvatarUploader
                      entityType="tournament_team"
                      entityId={team.id}
                      initialUrl={team.avatar_url}
                      fallback={team.name}
                      label="上传头像"
                      size="sm"
                    />
                    <label className="label">
                      队伍名称
                      <input className="form-input" name="name" defaultValue={team.name} required />
                    </label>
                    <label className="label">
                      队长 UID
                      <input className="form-input" name="captain_identifier" defaultValue={captain?.uid || ""} placeholder="6 位 UID" />
                    </label>
                    <Button type="submit" variant="secondary">保存队伍</Button>
                  </form>
                ) : null}
                {team ? (
                  <form action={replaceTournamentTeamMembersAction} className="grid gap-2 rounded-lg border border-board/20 bg-board/5 p-3">
                    <input type="hidden" name="tournament_id" value={id} />
                    <input type="hidden" name="team_id" value={team.id} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="label">
                        队长 UID
                        <input className="form-input" name="captain_identifier" defaultValue={captain?.uid || ""} placeholder="不填则默认第一行队员" />
                      </label>
                      <div className="rounded-lg bg-surface/80 p-3 text-xs font-semibold leading-5 text-muted">
                        可先保存 1 人，后续再补齐；会同步报名、队长、队伍总 rating 和参赛主体快照。
                      </div>
                    </div>
                    <label className="label">
                      队员 UID
                      <textarea
                        className="form-input min-h-24"
                        name="member_identifiers"
                        defaultValue={teamMembers
                          .map((member) => profileById.get(member.user_id)?.uid || member.user_id)
                          .join("\n")}
                        required
                      />
                    </label>
                    <Button type="submit" variant="secondary">保存整队队员</Button>
                  </form>
                ) : null}
                {teamMembers.length > 0 ? (
                  <ul className="mt-3 grid gap-1 text-xs text-muted">
                    {teamMembers.map((member) => (
                      <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-field px-3 py-2">
                        {profileById.get(member.user_id)?.display_name || member.user_id} · {member.rating_snapshot} · {member.role}
                        <span className="ml-2">UID {profileById.get(member.user_id)?.uid || "------"}</span>
                        {team ? (
                          <form action={removeTournamentTeamMemberAction}>
                            <input type="hidden" name="tournament_id" value={id} />
                            <input type="hidden" name="team_id" value={team.id} />
                            <input type="hidden" name="user_id" value={member.user_id} />
                            <Button type="submit" variant="secondary">移除</Button>
                          </form>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {team ? (
                  <div className="grid gap-2">
                    <form action={addTournamentTeamMemberAction} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                      <input type="hidden" name="tournament_id" value={id} />
                      <input type="hidden" name="team_id" value={team.id} />
                      <label className="label">
                        添加队员 UID
                        <input className="form-input" name="user_identifier" placeholder="例如 123456" required />
                      </label>
                      <Button type="submit" variant="secondary">添加</Button>
                    </form>
                    <form action={saveTournamentTeamAsSavedAction}>
                      <input type="hidden" name="tournament_id" value={id} />
                      <input type="hidden" name="team_id" value={team.id} />
                      <Button type="submit">{team.saved_team_id ? "同步长期队伍" : "保存为长期队伍"}</Button>
                    </form>
                  </div>
                ) : null}
              </div>
            );
          })}
          {(participants || []).length === 0 ? <p className="text-sm text-muted">尚未生成参赛主体。</p> : null}
        </div>
      </Card>
    </div>
  );
}

function RegistrationStatusForm({
  registrationId,
  tournamentId,
  status,
  label
}: {
  registrationId: string;
  tournamentId: string;
  status: string;
  label: string;
}) {
  return (
    <form action={updateRegistrationStatusAction}>
      <input type="hidden" name="registration_id" value={registrationId} />
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant="secondary">{label}</Button>
    </form>
  );
}
