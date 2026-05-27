import { adminAddRegistrationByUserIdAction, generateTeamsAction, updateRegistrationStatusAction } from "@/lib/actions/tournaments";
import { requireAdmin } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
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

  const [{ data: tournament }, { data: registrations }, { data: participants }, { data: teams }, { data: members }] =
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
      supabase.from("team_members").select("*")
    ]);

  const userIds = [
    ...new Set([
      ...(registrations || []).map((registration) => registration.user_id),
      ...(registrations || [])
        .map((registration) => registration.preferred_partner_user_id)
        .filter(Boolean),
      ...(members || []).map((member) => member.user_id)
    ])
  ];
  const { data: profiles } =
    userIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, display_name, rating, skill_level")
          .in("id", userIds)
      : { data: [] };
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold">参赛选手管理</h1>
        <p className="mt-2 text-sm text-slate-600">
          {tournament?.name} · {tournament?.tournament_type} · 每队 {tournament?.team_size} 人
        </p>
      </div>

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
              <thead className="text-slate-500">
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
                        <div className="text-xs text-slate-500">{registration.user_id}</div>
                      </td>
                      <td>{registration.rating_snapshot}</td>
                      <td>{registration.skill_level_snapshot}</td>
                      <td>
                        {registration.preferred_partner_user_id
                          ? profileById.get(registration.preferred_partner_user_id)?.display_name ||
                            registration.preferred_partner_user_id
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
                    <td className="py-4 text-slate-500" colSpan={6}>暂无报名。</td>
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
              <input className="form-input" name="user_id" placeholder="profiles.id" required />
            </label>
            <Button type="submit" variant="secondary">添加到报名并确认</Button>
          </form>
        </Card>
      </section>

      <Card>
        <h2 className="text-lg font-bold">已生成队伍/参赛主体</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(participants || []).map((participant) => {
            const team = (teams || []).find((item) => item.id === participant.team_id);
            const teamMembers = (members || []).filter((member) => member.team_id === participant.team_id);
            return (
              <div key={participant.id} className="rounded-lg border border-wire p-4">
                <div className="font-bold">{participant.display_name}</div>
                <div className="mt-1 text-sm text-slate-600">Rating {participant.rating_snapshot}</div>
                {team ? <div className="mt-1 text-xs text-slate-500">{team.name}</div> : null}
                {teamMembers.length > 0 ? (
                  <ul className="mt-3 grid gap-1 text-xs text-slate-500">
                    {teamMembers.map((member) => (
                      <li key={member.id}>
                        {profileById.get(member.user_id)?.display_name || member.user_id} · {member.rating_snapshot} · {member.role}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
          {(participants || []).length === 0 ? <p className="text-sm text-slate-600">尚未生成参赛主体。</p> : null}
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
