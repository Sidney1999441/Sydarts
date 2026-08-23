import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";
import { calculatePlayerLevel } from "@/lib/algorithms/player-level";
import { requireAdmin } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { formatUserDisplayName } from "@/lib/scorer/display-names";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  evaluateWeeklyStars,
  getPreviousWeekEnd,
  getPreviousWeekStart,
  mergeWeeklyStarOverrides,
  type WeeklyStarIdentity,
  type WeeklyStarMatch,
  type WeeklyStarOverride
} from "@/lib/tournaments/weekly-stars";
import { WeeklyStarAdminForm } from "@/components/admin/WeeklyStarAdminForm";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { SetupNotice } from "@/components/SetupNotice";
import { WeeklyStarBoard } from "@/components/tournament/WeeklyStarBoard";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function TournamentStarsAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const admin = createSupabaseAdminClient();

  const [tournamentResult, participantsResult, matchesResult, overridesResult] = await Promise.all([
    admin.from("tournaments").select("id, name, tournament_start_at").eq("id", id).maybeSingle(),
    admin
      .from("tournament_participants")
      .select("id, display_name, user_id, team_id, participant_type")
      .eq("tournament_id", id)
      .eq("status", "active"),
    admin.from("matches").select("*").eq("tournament_id", id).order("updated_at", { ascending: false }),
    admin
      .from("tournament_weekly_stars")
      .select("week_start, user_id, reason")
      .eq("tournament_id", id)
      .order("week_start", { ascending: false })
  ]);

  const tournament = tournamentResult.data;
  if (!tournament) {
    return <Card><p className="text-sm font-semibold text-muted">赛事不存在。</p></Card>;
  }

  const participants = participantsResult.data || [];
  const teamIds = [...new Set(participants.map((participant) => participant.team_id).filter(Boolean))] as string[];
  const teamMembersResult = teamIds.length > 0
    ? await admin.from("team_members").select("team_id, user_id").in("team_id", teamIds)
    : { data: [] as Array<{ team_id: string; user_id: string }> };
  const userIds = [
    ...new Set([
      ...participants.map((participant) => participant.user_id).filter(Boolean),
      ...(teamMembersResult.data || []).map((member) => member.user_id)
    ])
  ] as string[];
  const profilesResult = userIds.length > 0
    ? await admin.from("profiles").select("id, uid, display_name, avatar_url, rating, tournament_rating").in("id", userIds)
    : { data: [] as Array<{ id: string; uid: string; display_name: string | null; avatar_url: string | null; rating: number | null; tournament_rating: number | null }> };
  const profileById = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]));
  const participantMembersById = new Map<string, Array<{ userId: string }>>();
  const identitiesByUserId = new Map<string, WeeklyStarIdentity>();

  for (const participant of participants) {
    const memberIds = participant.user_id
      ? [participant.user_id]
      : (teamMembersResult.data || [])
          .filter((member) => member.team_id === participant.team_id)
          .map((member) => member.user_id);
    participantMembersById.set(participant.id, memberIds.map((userId) => ({ userId })));
    for (const userId of memberIds) {
      const profile = profileById.get(userId);
      identitiesByUserId.set(userId, {
        name: formatUserDisplayName({
          userId,
          displayName: profile?.display_name,
          uid: profile?.uid,
          fallback: participant.participant_type === "user" ? participant.display_name : undefined,
          includeUid: false
        }),
        avatarUrl: profile?.avatar_url || null,
        teamName: participant.participant_type === "team" ? participant.display_name || "" : "",
        strengthLevel: calculatePlayerLevel({
          rating: profile?.tournament_rating ?? profile?.rating ?? 1000
        }).level
      });
    }
  }

  const evaluation = evaluateWeeklyStars({
    matches: (matchesResult.data || []) as WeeklyStarMatch[],
    participantMembersById,
    identitiesByUserId
  });
  const rawOverrides = (overridesResult.data || []) as WeeklyStarOverride[];
  const stars = mergeWeeklyStarOverrides({ evaluation, overrides: rawOverrides, identitiesByUserId });
  const players = [...identitiesByUserId.entries()]
    .map(([userId, identity]) => ({ userId, name: identity.name, teamName: identity.teamName }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const overrides = rawOverrides.map((override) => ({
    weekStart: override.week_start,
    userId: override.user_id,
    playerName: identitiesByUserId.get(override.user_id)?.name || `选手 ${override.user_id.slice(0, 6)}`,
    reason: override.reason || ""
  }));

  return (
    <div className="grid min-w-0 gap-6">
      <CodlPageHeader
        kicker="CODL Admin"
        title="赛事之星"
        description={`${tournament.name} / 自动评选与人工调整`}
        icon={<Star className="h-6 w-6 fill-current" aria-hidden />}
        art="pattern"
        actions={
          <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-wire bg-surface px-4 text-sm font-black" href="/admin/tournaments">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            返回赛事管理
          </Link>
        }
      />

      <WeeklyStarBoard stars={stars} tournamentStartAt={tournament.tournament_start_at} />

      <Card>
        <WeeklyStarAdminForm
          tournamentId={id}
          players={players}
          overrides={overrides}
          defaultDate={getPreviousWeekStart()}
          maxDate={getPreviousWeekEnd()}
          databaseReady={!overridesResult.error}
        />
      </Card>
    </div>
  );
}
