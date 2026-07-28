import Link from "next/link";
import { ArrowRight, History, Plus, UsersRound } from "lucide-react";
import {
  addTournamentTeamMemberAction,
  removeTournamentTeamMemberAction,
  saveTournamentTeamAsSavedAction,
  updateTournamentTeamAction
} from "@/lib/actions/tournaments";
import { createSavedTeamAdminAction, updateSavedTeamAdminAction } from "@/lib/actions/teams";
import { requireAdmin } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { AvatarUploader } from "@/components/ui/AvatarUploader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function AdminTeamsPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();

  const [{ data: savedTeams }, { data: tournamentTeams }] = await Promise.all([
    supabase.from("saved_teams").select("*").order("updated_at", { ascending: false }),
    supabase.from("teams").select("*").order("updated_at", { ascending: false }).limit(80)
  ]);

  const teamIds = (tournamentTeams || []).map((team) => team.id);
  const tournamentIds = [...new Set((tournamentTeams || []).map((team) => team.tournament_id))];

  const [{ data: members }, { data: tournaments }] = await Promise.all([
    teamIds.length > 0
      ? supabase.from("team_members").select("*").in("team_id", teamIds)
      : Promise.resolve({ data: [] }),
    tournamentIds.length > 0
      ? supabase.from("tournaments").select("id, name, status, team_size").in("id", tournamentIds)
      : Promise.resolve({ data: [] })
  ]);

  const profileIds = [
    ...new Set([
      ...(savedTeams || []).map((team) => team.captain_user_id).filter(Boolean),
      ...(tournamentTeams || []).map((team) => team.captain_user_id).filter(Boolean),
      ...(members || []).map((member) => member.user_id).filter(Boolean)
    ])
  ];

  const { data: profiles } =
    profileIds.length > 0
      ? await supabase.from("profiles").select("id, uid, display_name, rating, skill_level, status").in("id", profileIds)
      : { data: [] };

  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const tournamentById = new Map((tournaments || []).map((tournament) => [tournament.id, tournament]));
  const savedTeamById = new Map((savedTeams || []).map((team) => [team.id, team]));
  const membersByTeamId = new Map<string, typeof members>();

  for (const member of members || []) {
    const list = membersByTeamId.get(member.team_id) || [];
    list.push(member);
    membersByTeamId.set(member.team_id, list);
  }

  return (
    <div className="grid gap-5">
      <CodlPageHeader
        dark
        kicker="CODL Admin"
        title="队伍管理"
        description="维护长期队伍、赛事队伍和队伍成员关联。"
        icon={<UsersRound className="h-6 w-6" aria-hidden />}
        art="pattern"
        actions={
          <div className="grid grid-cols-2 gap-2 text-sm font-bold">
            <Metric label="长期队伍" value={(savedTeams || []).length} />
            <Metric label="赛事队伍" value={(tournamentTeams || []).length} />
          </div>
        }
      />

      <Card>
        <div className="flex items-center gap-2">
          <Plus className="h-5 w-5 text-board" aria-hidden />
          <h2 className="text-lg font-black">创建长期队伍</h2>
        </div>
        <form action={createSavedTeamAdminAction} className="mt-4 grid gap-3 lg:grid-cols-[1fr_220px_auto] lg:items-end">
          <label className="label">
            队伍名称
            <input className="form-input" name="name" required />
          </label>
          <label className="label">
            队长 UID
            <input className="form-input" name="captain_identifier" placeholder="6 位 UID" required />
          </label>
          <Button type="submit">创建</Button>
        </form>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-board" aria-hidden />
            <h2 className="text-lg font-black">长期队伍</h2>
          </div>
          <div className="mt-4 grid gap-3">
            {(savedTeams || []).map((team) => {
              const captain = profileById.get(team.captain_user_id);
              return (
                <form key={team.id} action={updateSavedTeamAdminAction} className="grid gap-3 rounded-lg border border-wire p-4">
                  <input type="hidden" name="saved_team_id" value={team.id} />
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <AvatarUploader
                        entityType="saved_team"
                        entityId={team.id}
                        initialUrl={team.avatar_url}
                        fallback={team.name}
                        label="上传头像"
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="truncate font-black">{team.name}</div>
                        <div className="text-xs font-semibold text-muted">
                          队长 {captain?.display_name || team.captain_user_id}
                          {captain?.uid ? ` / UID ${captain.uid}` : ""}
                        </div>
                      </div>
                    </div>
                    <Link className="inline-flex min-h-10 items-center gap-1 text-sm font-bold text-board underline" href={`/teams/${team.id}`}>
                      历史
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <label className="label">
                      队伍名称
                      <input className="form-input" name="name" defaultValue={team.name} required />
                    </label>
                    <label className="label">
                      队长 UID
                      <input className="form-input" name="captain_identifier" defaultValue={captain?.uid || team.captain_user_id} required />
                    </label>
                    <label className="label">
                      状态
                      <select className="form-input" name="status" defaultValue={team.status}>
                        <option value="active">active</option>
                        <option value="archived">archived</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" variant="secondary">保存长期队伍</Button>
                  </div>
                </form>
              );
            })}
            {(savedTeams || []).length === 0 ? <p className="text-sm text-muted">暂无长期队伍。</p> : null}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-black">赛事内队伍</h2>
          <div className="mt-4 grid gap-3">
            {(tournamentTeams || []).map((team) => {
              const tournament = tournamentById.get(team.tournament_id);
              const captain = team.captain_user_id ? profileById.get(team.captain_user_id) : null;
              const teamMembers = membersByTeamId.get(team.id) || [];
              const linkedSavedTeam = team.saved_team_id ? savedTeamById.get(team.saved_team_id) : null;

              return (
                <article key={team.id} className="grid gap-3 rounded-lg border border-wire p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-black">{team.name}</div>
                      <div className="text-xs font-semibold text-muted">
                        {tournament?.name || team.tournament_id} / {tournament?.status || "unknown"}
                      </div>
                      <div className="text-xs font-semibold text-board">
                        {linkedSavedTeam ? `已关联长期队伍：${linkedSavedTeam.name}` : "未保存为长期队伍"}
                      </div>
                    </div>
                    <Link
                      className="inline-flex min-h-10 items-center gap-1 text-sm font-bold text-board underline"
                      href={`/admin/tournaments/${team.tournament_id}/participants`}
                    >
                      赛事报名页
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    </Link>
                  </div>

                  <form action={updateTournamentTeamAction} className="grid gap-3 lg:grid-cols-[1fr_1fr_180px_auto] lg:items-end">
                    <input type="hidden" name="tournament_id" value={team.tournament_id} />
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
                    <Button type="submit" variant="secondary">保存赛事队伍</Button>
                  </form>

                  <div className="grid gap-2 text-sm">
                    {teamMembers.map((member) => {
                      const profile = profileById.get(member.user_id);
                      return (
                        <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-field px-3 py-2">
                          <span className="font-semibold">
                            {profile?.display_name || member.user_id} / UID {profile?.uid || "------"} / {member.role}
                          </span>
                          <form action={removeTournamentTeamMemberAction}>
                            <input type="hidden" name="tournament_id" value={team.tournament_id} />
                            <input type="hidden" name="team_id" value={team.id} />
                            <input type="hidden" name="user_id" value={member.user_id} />
                            <Button type="submit" variant="secondary">移除</Button>
                          </form>
                        </div>
                      );
                    })}
                    {teamMembers.length === 0 ? <p className="text-sm text-muted">暂无成员。</p> : null}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <form action={addTournamentTeamMemberAction} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                      <input type="hidden" name="tournament_id" value={team.tournament_id} />
                      <input type="hidden" name="team_id" value={team.id} />
                      <label className="label">
                        添加队员 UID
                        <input className="form-input" name="user_identifier" placeholder="例如 123456" required />
                      </label>
                      <Button type="submit" variant="secondary">添加</Button>
                    </form>
                    <form action={saveTournamentTeamAsSavedAction}>
                      <input type="hidden" name="tournament_id" value={team.tournament_id} />
                      <input type="hidden" name="team_id" value={team.id} />
                      <Button type="submit">{team.saved_team_id ? "同步长期队伍" : "保存为长期队伍"}</Button>
                    </form>
                  </div>
                </article>
              );
            })}
            {(tournamentTeams || []).length === 0 ? <p className="text-sm text-muted">暂无赛事内队伍。</p> : null}
          </div>
        </Card>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white/10 px-4 py-3">
      <div className="text-xs text-white/60">{label}</div>
      <div className="text-2xl font-black">{value}</div>
    </div>
  );
}
