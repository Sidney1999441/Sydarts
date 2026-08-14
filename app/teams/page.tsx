import Link from "next/link";
import { ArrowRight, History, Plus, UsersRound } from "lucide-react";
import { createSavedTeamForCurrentUserAction, updateSavedTeamProfileAction } from "@/lib/actions/teams";
import { saveTournamentTeamAsSavedAction, updateTournamentTeamAction } from "@/lib/actions/tournaments";
import { calculatePlayerLevel } from "@/lib/algorithms/player-level";
import { requireUser } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { AvatarUploader } from "@/components/ui/AvatarUploader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

type ProfileLite = {
  id: string;
  uid: string | null;
  display_name: string | null;
};

export default async function TeamsPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;

  const { user } = await requireUser();
  const admin = createSupabaseAdminClient();

  const [{ data: savedTeams }, { data: captainMemberships }, { data: directCaptainTeams }] = await Promise.all([
    admin
      .from("saved_teams")
      .select("id, name, avatar_url, status, created_at, updated_at")
      .eq("captain_user_id", user.id)
      .order("updated_at", { ascending: false }),
    admin
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id)
      .eq("role", "captain"),
    admin
      .from("teams")
      .select("id")
      .eq("captain_user_id", user.id)
  ]);

  const tournamentTeamIds = [
    ...new Set([
      ...(directCaptainTeams || []).map((team) => team.id),
      ...(captainMemberships || []).map((member) => member.team_id)
    ].filter(Boolean))
  ] as string[];

  const { data: tournamentTeams } =
    tournamentTeamIds.length > 0
      ? await admin
          .from("teams")
          .select("id, tournament_id, saved_team_id, name, avatar_url, captain_user_id, total_rating, status, created_at, updated_at")
          .in("id", tournamentTeamIds)
          .order("updated_at", { ascending: false })
      : { data: [] };

  const tournamentIds = [
    ...new Set((tournamentTeams || []).map((team) => team.tournament_id).filter(Boolean))
  ] as string[];
  const teamIds = (tournamentTeams || []).map((team) => team.id);
  const savedTeamIds = [
    ...new Set((tournamentTeams || []).map((team) => team.saved_team_id).filter(Boolean))
  ] as string[];

  const [{ data: tournaments }, { data: members }, { data: linkedSavedTeams }] = await Promise.all([
    tournamentIds.length > 0
      ? admin.from("tournaments").select("id, name, status, tournament_start_at, team_size").in("id", tournamentIds)
      : Promise.resolve({ data: [] }),
    teamIds.length > 0
      ? admin.from("team_members").select("team_id, user_id, role, rating_snapshot").in("team_id", teamIds)
      : Promise.resolve({ data: [] }),
    savedTeamIds.length > 0
      ? admin.from("saved_teams").select("id, name").in("id", savedTeamIds)
      : Promise.resolve({ data: [] })
  ]);

  const profileIds = [
    ...new Set((members || []).map((member) => member.user_id).filter(Boolean))
  ] as string[];
  const { data: profiles } =
    profileIds.length > 0
      ? await admin.from("profiles").select("id, uid, display_name").in("id", profileIds)
      : { data: [] };

  const tournamentById = new Map((tournaments || []).map((tournament) => [tournament.id, tournament]));
  const linkedSavedTeamById = new Map((linkedSavedTeams || []).map((team) => [team.id, team]));
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile as ProfileLite]));
  const levelFromRating = (rating?: number | null) => calculatePlayerLevel({ rating: rating || 1000 }).level;
  const membersByTeamId = new Map<string, typeof members>();
  for (const member of members || []) {
    const list = membersByTeamId.get(member.team_id) || [];
    list.push(member);
    membersByTeamId.set(member.team_id, list);
  }

  return (
    <div className="grid min-w-0 gap-5">
      <CodlPageHeader
        kicker="Captain Console"
        title="我的队伍"
        description="队长可以维护长期队伍和自己负责的赛事队伍：改名、上传头像、保存为长期队伍，并查看队伍历史。"
        icon={<UsersRound className="h-6 w-6" aria-hidden />}
        art="white"
        actions={
          <Link className="inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-black text-white" href="/profile">
            返回个人中心
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        }
      />

      <section className="grid min-w-0 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <div className="flex min-w-0 items-center gap-2">
            <History className="h-5 w-5 shrink-0 text-board" aria-hidden />
            <h2 className="min-w-0 break-words text-lg font-black">长期队伍</h2>
          </div>

          <form action={createSavedTeamForCurrentUserAction} className="mt-4 grid gap-3 rounded-lg border border-dashed border-board/45 bg-field/70 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="label min-w-0">
              申请/新建长期队伍
              <input className="form-input" name="name" placeholder="例如：蓝圈飞镖队" required />
            </label>
            <Button type="submit">
              <Plus className="h-4 w-4" aria-hidden />
              创建队伍
            </Button>
          </form>

          <div className="mt-4 grid gap-3">
            {(savedTeams || []).map((team) => (
              <form key={team.id} action={updateSavedTeamProfileAction} className="grid min-w-0 gap-3 rounded-lg border border-wire p-4">
                <input type="hidden" name="saved_team_id" value={team.id} />
                <AvatarUploader
                  entityType="saved_team"
                  entityId={team.id}
                  initialUrl={team.avatar_url}
                  fallback={team.name}
                  label="上传队伍头像"
                  size="md"
                />
                <label className="label min-w-0">
                  队伍名称
                  <input className="form-input" name="name" defaultValue={team.name} required />
                </label>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-muted">
                  <span>状态 {team.status}</span>
                  <span>更新 {team.updated_at ? formatDateTime(team.updated_at) : "-"}</span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button type="submit" variant="secondary">保存长期队伍</Button>
                  <Link className="inline-flex min-h-11 touch-manipulation items-center gap-1 rounded-lg px-3 text-sm font-black text-board underline" href={`/teams/${team.id}`}>
                    队伍历史
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              </form>
            ))}
            {(savedTeams || []).length === 0 ? (
              <p className="rounded-lg bg-field p-4 text-sm font-semibold text-muted">
                还没有长期队伍。可以先创建一个长期队伍，也可以把下面的赛事队伍保存为长期队伍。
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <h2 className="break-words text-lg font-black">我担任队长的赛事队伍</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-muted">
            这里维护本次赛事的队伍名称和头像；成员名单由管理员或赛事报名流程确认，避免临场误改。
          </p>

          <div className="mt-4 grid min-w-0 gap-3">
            {(tournamentTeams || []).map((team) => {
              const tournament = tournamentById.get(team.tournament_id);
              const teamMembers = membersByTeamId.get(team.id) || [];
              const linkedSavedTeam = team.saved_team_id ? linkedSavedTeamById.get(team.saved_team_id) : null;

              return (
                <article key={team.id} className="grid min-w-0 gap-3 rounded-lg border border-wire p-4">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-black">{team.name}</h3>
                      <p className="mt-1 break-words text-xs font-semibold text-muted">
                        {tournament?.name || team.tournament_id} · {tournament?.status || "unknown"}
                      </p>
                      <p className="mt-1 text-xs font-bold text-board">
                        {linkedSavedTeam ? `已关联长期队伍：${linkedSavedTeam.name}` : "还未保存为长期队伍"}
                      </p>
                    </div>
                    {tournament ? (
                      <Link className="inline-flex min-h-10 shrink-0 items-center gap-1 text-sm font-bold text-board underline" href={`/tournaments/${tournament.id}`}>
                        赛事页
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    ) : null}
                  </div>

                  <form action={updateTournamentTeamAction} className="grid min-w-0 gap-3 lg:grid-cols-[auto_1fr_auto] lg:items-end">
                    <input type="hidden" name="tournament_id" value={team.tournament_id} />
                    <input type="hidden" name="team_id" value={team.id} />
                    <AvatarUploader
                      entityType="tournament_team"
                      entityId={team.id}
                      initialUrl={team.avatar_url}
                      fallback={team.name}
                      label="上传队伍头像"
                      size="sm"
                    />
                    <label className="label min-w-0">
                      赛事队伍名称
                      <input className="form-input" name="name" defaultValue={team.name} required />
                    </label>
                    <Button type="submit" variant="secondary">保存本次队伍</Button>
                  </form>

                  <div className="grid gap-2 text-sm">
                    {teamMembers.map((member) => {
                      const profile = profileById.get(member.user_id);
                      return (
                        <div key={`${team.id}-${member.user_id}`} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-field px-3 py-2">
                          <span className="min-w-0 break-words font-semibold">
                            {profile?.display_name || member.user_id} / UID {profile?.uid || "------"} / {member.role}
                          </span>
                          <span className="shrink-0 text-xs font-bold text-muted">等级 Lv.{levelFromRating(member.rating_snapshot)}</span>
                        </div>
                      );
                    })}
                    {teamMembers.length === 0 ? <p className="text-sm text-muted">暂无成员。</p> : null}
                  </div>

                  <form action={saveTournamentTeamAsSavedAction} className="flex justify-end">
                    <input type="hidden" name="tournament_id" value={team.tournament_id} />
                    <input type="hidden" name="team_id" value={team.id} />
                    <Button type="submit">
                      {team.saved_team_id ? "同步长期队伍" : "保存为长期队伍"}
                    </Button>
                  </form>
                </article>
              );
            })}
            {(tournamentTeams || []).length === 0 ? (
              <p className="rounded-lg bg-field p-4 text-sm font-semibold text-muted">
                你目前还不是任何赛事队伍的队长。报名或管理员设置队长后，队伍会显示在这里。
              </p>
            ) : null}
          </div>
        </Card>
      </section>
    </div>
  );
}
