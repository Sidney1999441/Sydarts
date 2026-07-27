import Link from "next/link";
import { notFound } from "next/navigation";
import { UsersRound } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeAvatarUrl } from "@/lib/storage/avatars";
import { formatDateTime } from "@/lib/utils";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function SavedTeamDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, profile } = await requireUser();
  const admin = createSupabaseAdminClient();

  const { data: savedTeam, error } = await admin
    .from("saved_teams")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !savedTeam) notFound();
  if (profile?.role !== "admin" && savedTeam.captain_user_id !== user.id) notFound();

  const { data: teamInstances } = await admin
    .from("teams")
    .select("*")
    .eq("saved_team_id", id)
    .order("created_at", { ascending: false });

  const teamIds = (teamInstances || []).map((team) => team.id);
  const tournamentIds = [...new Set((teamInstances || []).map((team) => team.tournament_id))];
  const [{ data: tournaments }, { data: participants }, { data: members }] = await Promise.all([
    tournamentIds.length > 0
      ? admin.from("tournaments").select("id, name, status, tournament_start_at").in("id", tournamentIds)
      : Promise.resolve({ data: [] }),
    teamIds.length > 0
      ? admin.from("tournament_participants").select("id, team_id, tournament_id, display_name, rating_snapshot").in("team_id", teamIds)
      : Promise.resolve({ data: [] }),
    teamIds.length > 0
      ? admin.from("team_members").select("team_id, user_id, role, rating_snapshot").in("team_id", teamIds)
      : Promise.resolve({ data: [] })
  ]);

  const memberUserIds = [...new Set((members || []).map((member) => member.user_id))];
  const { data: memberProfiles } =
    memberUserIds.length > 0
      ? await admin.from("profiles").select("id, uid, display_name").in("id", memberUserIds)
      : { data: [] };

  const participantIds = (participants || []).map((participant) => participant.id);
  const { data: matches } =
    participantIds.length > 0
      ? await admin
          .from("matches")
          .select("id, tournament_id, participant_a_id, participant_b_id, winner_participant_id, score_a, score_b, status, updated_at")
          .or(`participant_a_id.in.(${participantIds.join(",")}),participant_b_id.in.(${participantIds.join(",")})`)
          .order("updated_at", { ascending: false })
      : { data: [] };

  const tournamentById = new Map((tournaments || []).map((tournament) => [tournament.id, tournament]));
  const participantByTeamId = new Map((participants || []).map((participant) => [participant.team_id, participant]));
  const profileById = new Map((memberProfiles || []).map((item) => [item.id, item]));
  const membersByTeamId = new Map<string, typeof members>();
  for (const member of members || []) {
    const list = membersByTeamId.get(member.team_id) || [];
    list.push(member);
    membersByTeamId.set(member.team_id, list);
  }
  const matchesByParticipantId = new Map<string, typeof matches>();
  for (const match of matches || []) {
    for (const participantId of [match.participant_a_id, match.participant_b_id]) {
      if (!participantId) continue;
      const list = matchesByParticipantId.get(participantId) || [];
      list.push(match);
      matchesByParticipantId.set(participantId, list);
    }
  }

  const completedMatches = (matches || []).filter((match) => match.status === "completed");
  const wins = completedMatches.filter((match) => participantIds.includes(match.winner_participant_id || "")).length;
  const losses = completedMatches.length - wins;
  const savedTeamAvatarUrl = normalizeAvatarUrl(savedTeam.avatar_url);

  return (
    <div className="grid gap-5">
      <CodlPageHeader
        kicker="Saved Team"
        title={savedTeam.name}
        description={`长期队伍 · 状态 ${savedTeam.status}`}
        icon={<UsersRound className="h-6 w-6" aria-hidden />}
        poster="white"
        actions={
          <Link className="inline-flex min-h-11 items-center rounded-lg bg-board px-4 text-sm font-black text-white" href="/profile">
            返回个人中心
          </Link>
        }
      />
      <Card>
        <Link className="text-sm font-semibold text-board underline" href="/profile">
          返回个人中心
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {savedTeamAvatarUrl ? (
            <img
              src={savedTeamAvatarUrl}
              alt=""
              className="h-16 w-16 rounded-lg border border-wire object-cover"
            />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-lg bg-field text-xl font-black text-board">
              {savedTeam.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-sm font-bold text-board">长期队伍</div>
            <h2 className="text-3xl font-black">{savedTeam.name}</h2>
            <p className="mt-1 text-sm text-muted">状态 {savedTeam.status}</p>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <Metric label="参赛次数" value={(teamInstances || []).length} />
          <Metric label="胜场" value={wins} />
          <Metric label="负场" value={losses} />
        </dl>
      </Card>

      <Card>
        <h2 className="text-lg font-bold">历史参赛</h2>
        <div className="mt-4 grid gap-4">
          {(teamInstances || []).map((team) => {
            const tournament = tournamentById.get(team.tournament_id);
            const participant = participantByTeamId.get(team.id);
            const teamMatches = participant ? matchesByParticipantId.get(participant.id) || [] : [];
            const teamMembers = membersByTeamId.get(team.id) || [];

            return (
              <article key={team.id} className="rounded-lg border border-wire p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{tournament?.name || team.name}</h3>
                    <p className="mt-1 text-sm text-muted">
                      {tournament?.tournament_start_at ? formatDateTime(tournament.tournament_start_at) : "时间未定"} · {tournament?.status || "unknown"}
                    </p>
                  </div>
                  {tournament ? (
                    <Link href={`/tournaments/${tournament.id}`}>
                      <Button type="button" variant="secondary">查看赛事</Button>
                    </Link>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-lg bg-field p-3">
                    <div className="text-xs font-bold text-muted">本次成员</div>
                    <div className="mt-2 grid gap-1">
                      {teamMembers.map((member) => {
                        const memberProfile = profileById.get(member.user_id);
                        return (
                          <div key={`${team.id}-${member.user_id}`} className="font-semibold">
                            {memberProfile?.display_name || member.user_id} · UID {memberProfile?.uid || "------"} · {member.role}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="rounded-lg bg-field p-3">
                    <div className="text-xs font-bold text-muted">比赛记录</div>
                    <div className="mt-2 grid gap-1">
                      {teamMatches.slice(0, 6).map((match) => {
                        const isA = participant?.id === match.participant_a_id;
                        const myScore = isA ? match.score_a : match.score_b;
                        const otherScore = isA ? match.score_b : match.score_a;
                        const result =
                          match.status === "completed"
                            ? match.winner_participant_id === participant?.id
                              ? "胜"
                              : "负"
                            : match.status;
                        return (
                          <div key={match.id} className="flex justify-between gap-3 font-semibold">
                            <span>{result}</span>
                            <span>{myScore}:{otherScore}</span>
                          </div>
                        );
                      })}
                      {teamMatches.length === 0 ? <div className="text-muted">暂无比赛记录</div> : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
          {(teamInstances || []).length === 0 ? <p className="text-sm text-muted">这个长期队伍还没有参赛记录。</p> : null}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-field p-3">
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-black">{value}</dd>
    </div>
  );
}
