import { notFound } from "next/navigation";
import { Gauge } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { getLegStartingScore, getMatchRulesSummary, resolveMatchLegRules } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { Card } from "@/components/ui/Card";
import { Scoreboard } from "@/components/scorer/Scoreboard";
import { SoftScoreboard } from "@/components/scorer/SoftScoreboard";
import type { FirstThrowMode, MatchFinishMode, MatchLegRule, Tournament } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function MatchScorerPage({
  params
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  if (!hasSupabaseEnv()) return <SetupNotice />;

  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: match } = await supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .single();

  if (!match || !match.participant_a_id || !match.participant_b_id) notFound();

  const [{ data: tournament }, { data: participants }] = await Promise.all([
    supabase
      .from("tournaments")
      .select("*")
      .eq("id", match.tournament_id)
      .single(),
    supabase
      .from("tournament_participants")
      .select("id, display_name, user_id, team_id, participant_type")
      .in("id", [match.participant_a_id, match.participant_b_id])
  ]);

  const participantRows = participants || [];
  const teamIds = [...new Set(participantRows.map((participant) => participant.team_id).filter(Boolean))] as string[];
  const userIds = [...new Set(participantRows.map((participant) => participant.user_id).filter(Boolean))] as string[];
  const { data: teamMembers } =
    teamIds.length > 0
      ? await supabase.from("team_members").select("team_id, user_id").in("team_id", teamIds)
      : { data: [] };
  const memberUserIds = [...new Set([...(teamMembers || []).map((member) => member.user_id), ...userIds])] as string[];
  const { data: profiles } =
    memberUserIds.length > 0
      ? await supabase.from("profiles").select("id, uid, display_name").in("id", memberUserIds)
      : { data: [] };
  const profileById = new Map(
    (profiles || []).map((profile) => [
      profile.id,
      `${profile.display_name || profile.id}${profile.uid ? ` / UID ${profile.uid}` : ""}`
    ])
  );
  const membersByTeamId = new Map<string, Array<{ userId: string; name: string }>>();
  for (const member of teamMembers || []) {
    const members = membersByTeamId.get(member.team_id) || [];
    members.push({ userId: member.user_id, name: profileById.get(member.user_id) || member.user_id });
    membersByTeamId.set(member.team_id, members);
  }

  const participantById = new Map(participantRows.map((participant) => [participant.id, participant]));
  function toParticipantInfo(participantId: string, fallback: string) {
    const participant = participantById.get(participantId);
    const members = participant?.participant_type === "user" && participant.user_id
      ? [{ userId: participant.user_id, name: profileById.get(participant.user_id) || participant.display_name }]
      : participant?.team_id
        ? membersByTeamId.get(participant.team_id) || []
        : [];

    return {
      id: participantId,
      name: participant?.display_name || fallback,
      members
    };
  }

  const participantA = toParticipantInfo(match.participant_a_id, "A");
  const participantB = toParticipantInfo(match.participant_b_id, "B");
  const tournamentData = tournament as Tournament | null;
  const legRules = (Array.isArray(match.leg_rules) && match.leg_rules.length > 0
    ? match.leg_rules
    : resolveMatchLegRules({
        matchRuleMode: tournamentData?.match_rule_mode,
        customRules: tournamentData?.match_leg_rules,
        dartMode: tournamentData?.dart_mode || match.dart_mode || "steel",
        dartGame: tournamentData?.dart_game || match.game_variant || 501,
        softGame: tournamentData?.soft_game,
        bestOf: tournamentData?.best_of || 3,
        tournamentType: tournamentData?.tournament_type,
        teamSize: tournamentData?.team_size,
        roundNumber: match.round_number,
        mixedFirstDartMode: tournamentData?.mixed_first_dart_mode
      })) as MatchLegRule[];
  const firstRule = legRules[0];
  const matchDartMode = (firstRule?.dartMode || match.dart_mode || "steel") as "steel" | "soft";
  const matchFinishMode = (match.match_finish_mode || tournamentData?.match_finish_mode || "majority") as MatchFinishMode;
  const firstThrowMode = (match.first_throw_mode || tournamentData?.first_throw_mode || null) as FirstThrowMode | null;

  return (
    <div className="grid gap-6">
      <CodlPageHeader
        dark
        kicker={tournamentData?.name || "比赛计分"}
        title={`第 ${match.round_number} 轮，${participantA.name} 对 ${participantB.name}`}
        description={getMatchRulesSummary({
            dartMode: matchDartMode,
            gameVariant: match.game_variant,
            legRules
          })}
        icon={<Gauge className="h-6 w-6" aria-hidden />}
        art="white"
      />
      {match.status === "completed" ? (
        <Card>
          <p className="text-sm font-semibold text-muted">
            这场比赛已完成，比分 {match.score_a}:{match.score_b}。
          </p>
        </Card>
      ) : matchDartMode === "soft" ? (
        <SoftScoreboard
          matchId={match.id}
          participantA={participantA}
          participantB={participantB}
          legRules={legRules}
          matchFinishMode={matchFinishMode}
        />
      ) : (
        <Scoreboard
          matchId={match.id}
          participantA={participantA}
          participantB={participantB}
          startingScore={getLegStartingScore(firstRule)}
          bestOf={(tournamentData?.best_of || 3) as 3 | 5 | 7}
          legRules={legRules}
          matchFinishMode={matchFinishMode}
          firstThrowMode={firstThrowMode}
        />
      )}
    </div>
  );
}
