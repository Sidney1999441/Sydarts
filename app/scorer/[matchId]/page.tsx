import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { resolveFirstThrowHandicap } from "@/lib/algorithms/first-throw-handicap";
import { getCompactMatchRulesSummary, getDartModeLabel, getLegRuleLabel, getLegStartingScore, resolveMatchLegRules } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import {
  areBothMatchLineupsSubmitted,
  buildLineupsFromSubmissions,
  getMatchLineupSubmissions
} from "@/lib/matches/lineups";
import { getMatchStatusLabel } from "@/lib/matches/status";
import { formatUserDisplayName, isOpaqueIdentifier } from "@/lib/scorer/display-names";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { Card } from "@/components/ui/Card";
import { MatchLineupSubmissionForm } from "@/components/scorer/MatchLineupSubmissionForm";
import { OfficialLineupGate } from "@/components/scorer/OfficialLineupGate";
import { Scoreboard } from "@/components/scorer/Scoreboard";
import { SoftScoreboard } from "@/components/scorer/SoftScoreboard";
import type { SoftScoringDraftPayload } from "@/components/scorer/SoftMatchScoreboard";
import type { ScoringDraftPayload } from "@/components/scorer/TouchScoreboard";
import type { FirstThrowMode, MatchFinishMode, MatchLegRule, Tournament } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function MatchScorerPage({
  params
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  if (!hasSupabaseEnv()) return <SetupNotice />;

  const { user } = await requireUser();
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
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
      .select("id, display_name, user_id, team_id, participant_type, rating_snapshot")
      .in("id", [match.participant_a_id, match.participant_b_id])
  ]);

  const participantRows = participants || [];
  const teamIds = [...new Set(participantRows.map((participant) => participant.team_id).filter(Boolean))] as string[];
  const userIds = [...new Set(participantRows.map((participant) => participant.user_id).filter(Boolean))] as string[];
  const [{ data: teamMembers }, { data: teams }] = await Promise.all([
    teamIds.length > 0
      ? supabase.from("team_members").select("team_id, user_id, rating_snapshot, role").in("team_id", teamIds)
      : Promise.resolve({ data: [] }),
    teamIds.length > 0
      ? supabase.from("teams").select("id, captain_user_id").in("id", teamIds)
      : Promise.resolve({ data: [] })
  ]);
  const memberUserIds = [...new Set([...(teamMembers || []).map((member) => member.user_id), ...userIds])] as string[];
  const { data: profiles } =
    memberUserIds.length > 0
      ? await admin.from("profiles").select("id, uid, display_name, avatar_url").in("id", memberUserIds)
      : { data: [] };
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  function profileDisplayName(userId: string, fallback?: string | null) {
    const profile = profileById.get(userId) || { id: userId, uid: null, display_name: null, avatar_url: null };
    return formatUserDisplayName({
      userId,
      displayName: profile?.display_name,
      uid: profile?.uid,
      fallback
    });
  }
  const membersByTeamId = new Map<string, Array<{ userId: string; name: string; avatarUrl?: string | null }>>();
  for (const member of teamMembers || []) {
    const members = membersByTeamId.get(member.team_id) || [];
    members.push({
      userId: member.user_id,
      name: profileDisplayName(member.user_id),
      avatarUrl: profileById.get(member.user_id)?.avatar_url || null
    });
    membersByTeamId.set(member.team_id, members);
  }

  const participantById = new Map(participantRows.map((participant) => [participant.id, participant]));
  function toParticipantInfo(participantId: string, fallback: string) {
    const participant = participantById.get(participantId);
    const members = participant?.participant_type === "user" && participant.user_id
      ? [{
          userId: participant.user_id,
          name: profileDisplayName(participant.user_id, participant.display_name),
          avatarUrl: profileById.get(participant.user_id)?.avatar_url || null
        }]
      : participant?.team_id
        ? membersByTeamId.get(participant.team_id) || []
        : [];

    const memberNames = members.map((member) => member.name).filter(Boolean).join(" / ");
    const rawName = participant?.display_name || fallback;
    const displayName = rawName && !isOpaqueIdentifier(rawName) ? rawName : memberNames || rawName;

    return {
      id: participantId,
      name: displayName || fallback,
      avatarUrl: members.find((member) => member.avatarUrl)?.avatarUrl || null,
      members
    };
  }

  const participantA = toParticipantInfo(match.participant_a_id, "A");
  const participantB = toParticipantInfo(match.participant_b_id, "B");
  const teamById = new Map((teams || []).map((team) => [team.id, team]));
  function participantAverageRating(participantId: string) {
    const participant = participantById.get(participantId);
    if (!participant) return 1000;
    if (participant.team_id) {
      const ratings = (teamMembers || [])
        .filter((member) => member.team_id === participant.team_id)
        .map((member) => Number(member.rating_snapshot || 0))
        .filter((rating) => rating > 0);
      if (ratings.length > 0) {
        return ratings.reduce((total, rating) => total + rating, 0) / ratings.length;
      }
    }
    return Number(participant.rating_snapshot || 1000);
  }
  function canManageLineup(participantId: string) {
    const participant = participantById.get(participantId);
    if (!participant) return false;
    if (participant.participant_type === "user") return participant.user_id === user.id;
    if (!participant.team_id) return false;
    const teamCaptainId = teamById.get(participant.team_id)?.captain_user_id || null;
    if (teamCaptainId === user.id) return true;
    return (teamMembers || []).some(
      (member) => member.team_id === participant.team_id && member.user_id === user.id && member.role === "captain"
    );
  }
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
  const firstThrowHandicap = resolveFirstThrowHandicap({
    participantA: {
      id: participantA.id,
      rating: participantAverageRating(participantA.id)
    },
    participantB: {
      id: participantB.id,
      rating: participantAverageRating(participantB.id)
    }
  });
  const firstThrowHandicapNotice = firstThrowHandicap.firstParticipantId
    ? `检测到双方平均等级差 ${firstThrowHandicap.levelGap} 级，可一键让 ${firstThrowHandicap.firstParticipantId === participantA.id ? participantA.name : participantB.name} 先手。`
    : null;
  const lineupSubmissions = getMatchLineupSubmissions(match.details);
  const participantASubmission = lineupSubmissions[participantA.id];
  const participantBSubmission = lineupSubmissions[participantB.id];
  const needsPrivateLineup =
    match.status !== "completed" &&
    match.status !== "bye" &&
    ((participantA.members?.length || 0) > 1 || (participantB.members?.length || 0) > 1);
  const bothLineupsSubmitted = areBothMatchLineupsSubmitted(match.details, participantA.id, participantB.id);
  const submittedLineups = bothLineupsSubmitted
    ? buildLineupsFromSubmissions({
        details: match.details,
        legRules,
        participantAId: participantA.id,
        participantBId: participantB.id,
        participantAUserIds: participantA.members.map((member) => member.userId),
        participantBUserIds: participantB.members.map((member) => member.userId)
      })
    : undefined;
  const lineupPairings = bothLineupsSubmitted
    ? buildLineupPairings({
        participantA,
        participantB,
        legRules,
        lineups: submittedLineups || []
      })
    : [];
  const scoringDraft =
    matchDartMode === "steel" && match.status !== "completed" && match.status !== "bye"
      ? readScoringDraft(match.details, participantA.id, participantB.id)
      : null;
  const softScoringDraft =
    matchDartMode === "soft" && match.status !== "completed" && match.status !== "bye"
      ? readSoftScoringDraft(match.details, participantA.id, participantB.id)
      : null;
  const rulesSummary = getCompactMatchRulesSummary({
    dartMode: matchDartMode,
    gameVariant: match.game_variant,
    legRules
  });

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 sm:gap-4">
      <ScorerMatchHeader
        tournamentName={tournamentData?.name || "比赛计分"}
        roundNumber={match.round_number}
        participantAName={participantA.name}
        participantBName={participantB.name}
        statusLabel={getMatchStatusLabel(match.status)}
        dartModeLabel={getDartModeLabel(matchDartMode)}
        dartMode={matchDartMode}
        rulesSummary={rulesSummary}
        matchScore={`${match.score_a || 0}:${match.score_b || 0}`}
      />
      {match.status === "completed" ? (
        <Card>
          <p className="text-sm font-semibold text-muted">
            这场比赛已完成，比分 {match.score_a}:{match.score_b}。
          </p>
        </Card>
      ) : needsPrivateLineup && !bothLineupsSubmitted ? (
        <PreMatchLineupPanel
          matchId={match.id}
          participantA={participantA}
          participantB={participantB}
          legRules={legRules}
          participantASubmission={participantASubmission?.legLineups || []}
          participantBSubmission={participantBSubmission?.legLineups || []}
          participantAHasSubmission={Boolean(participantASubmission)}
          participantBHasSubmission={Boolean(participantBSubmission)}
          canSubmitA={canManageLineup(participantA.id)}
          canSubmitB={canManageLineup(participantB.id)}
        />
      ) : bothLineupsSubmitted ? (
        <OfficialLineupGate pairings={lineupPairings}>
          {matchDartMode === "soft" ? (
            <SoftScoreboard
              matchId={match.id}
              participantA={participantA}
              participantB={participantB}
              legRules={legRules}
              matchFinishMode={matchFinishMode}
              initialLineups={submittedLineups}
              initialDraft={softScoringDraft}
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
              suggestedFirstParticipantId={firstThrowHandicap.firstParticipantId}
              firstThrowHandicapNotice={firstThrowHandicapNotice}
              initialLineups={submittedLineups}
              initialDraft={scoringDraft}
            />
          )}
        </OfficialLineupGate>
      ) : matchDartMode === "soft" ? (
        <SoftScoreboard
          matchId={match.id}
          participantA={participantA}
          participantB={participantB}
          legRules={legRules}
          matchFinishMode={matchFinishMode}
          initialDraft={softScoringDraft}
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
          suggestedFirstParticipantId={firstThrowHandicap.firstParticipantId}
          firstThrowHandicapNotice={firstThrowHandicapNotice}
          initialDraft={scoringDraft}
        />
      )}
    </div>
  );
}

type ScorerParticipantInfo = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  members: Array<{ userId: string; name: string; avatarUrl?: string | null }>;
};

function readScoringDraft(details: unknown, participantAId: string, participantBId: string): ScoringDraftPayload | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const raw = (details as { scoringDraft?: unknown }).scoringDraft;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const draft = raw as Partial<ScoringDraftPayload>;
  if (draft.version !== 1 || !draft.state || draft.state.winnerParticipantId) return null;
  const participantIds = draft.state.participants?.map((participant) => participant.participantId) || [];
  if (!participantIds.includes(participantAId) || !participantIds.includes(participantBId)) return null;
  if (
    draft.firstParticipantId &&
    draft.firstParticipantId !== participantAId &&
    draft.firstParticipantId !== participantBId
  ) {
    return null;
  }
  if (draft.roundLimit !== 10 && draft.roundLimit !== 15 && draft.roundLimit !== 20 && draft.roundLimit !== "unlimited") {
    return null;
  }
  if (!draft.submissionId || !Array.isArray(draft.lineups)) return null;
  return draft as ScoringDraftPayload;
}

function readSoftScoringDraft(details: unknown, participantAId: string, participantBId: string): SoftScoringDraftPayload | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const raw = (details as { softScoringDraft?: unknown }).softScoringDraft;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const draft = raw as Partial<SoftScoringDraftPayload>;
  if (draft.version !== 1 || !draft.submissionId || !Array.isArray(draft.lineups) || !Array.isArray(draft.legEntries)) {
    return null;
  }
  if (draft.winnerParticipantId && draft.winnerParticipantId !== participantAId && draft.winnerParticipantId !== participantBId) {
    return null;
  }
  if (draft.currentWinner && draft.currentWinner !== participantAId && draft.currentWinner !== participantBId) {
    return null;
  }
  if (draft.legEntries.some((entry) => entry.winnerParticipantId !== participantAId && entry.winnerParticipantId !== participantBId)) {
    return null;
  }
  return draft as SoftScoringDraftPayload;
}

function ScorerMatchHeader({
  tournamentName,
  roundNumber,
  participantAName,
  participantBName,
  statusLabel,
  dartModeLabel,
  dartMode,
  rulesSummary,
  matchScore
}: {
  tournamentName: string;
  roundNumber: number;
  participantAName: string;
  participantBName: string;
  statusLabel: string;
  dartModeLabel: string;
  dartMode: "steel" | "soft";
  rulesSummary: string;
  matchScore: string;
}) {
  return (
    <section className="codl-official-score-header min-h-0 rounded-lg border border-wire bg-surface px-3 py-2 shadow-soft sm:px-4 sm:py-3">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-black uppercase tracking-normal text-board sm:text-xs">
            {tournamentName}
          </div>
          <h1 className="codl-official-score-title mt-0.5 truncate text-base font-black leading-tight text-ink sm:text-xl">
            第 {roundNumber} 轮 · {participantAName} vs {participantBName}
          </h1>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${dartMode === "soft" ? "bg-sky-100 text-board" : "bg-zinc-900 text-white"}`}>
              {dartModeLabel}
            </span>
            <span className="truncate text-xs font-semibold text-muted">
              {statusLabel} · {rulesSummary}
            </span>
          </div>
        </div>
        <div className="rounded-lg bg-board px-3 py-1.5 text-center text-white">
          <div className="text-[10px] font-black uppercase opacity-80">比分</div>
          <div className="text-xl font-black leading-none">{matchScore}</div>
        </div>
      </div>
    </section>
  );
}

function PreMatchLineupPanel({
  matchId,
  participantA,
  participantB,
  legRules,
  participantASubmission,
  participantBSubmission,
  participantAHasSubmission,
  participantBHasSubmission,
  canSubmitA,
  canSubmitB
}: {
  matchId: string;
  participantA: ScorerParticipantInfo;
  participantB: ScorerParticipantInfo;
  legRules: MatchLegRule[];
  participantASubmission: Array<{ legNumber: number; playerIds: string[] }>;
  participantBSubmission: Array<{ legNumber: number; playerIds: string[] }>;
  participantAHasSubmission: boolean;
  participantBHasSubmission: boolean;
  canSubmitA: boolean;
  canSubmitB: boolean;
}) {
  return (
    <Card className="grid gap-4">
      <div>
        <h2 className="text-xl font-black">赛前隐藏布阵</h2>
        <p className="mt-1 text-sm font-semibold text-muted">
          两队队长分别提交本队每一局的出场名单。双方都提交后，系统才会公开对阵并进入计分。
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <LineupSubmissionCard
          matchId={matchId}
          participant={participantA}
          legRules={legRules}
          submittedLegLineups={participantASubmission}
          hasSubmitted={participantAHasSubmission}
          canSubmit={canSubmitA}
        />
        <LineupSubmissionCard
          matchId={matchId}
          participant={participantB}
          legRules={legRules}
          submittedLegLineups={participantBSubmission}
          hasSubmitted={participantBHasSubmission}
          canSubmit={canSubmitB}
        />
      </div>
    </Card>
  );
}

function LineupSubmissionCard({
  matchId,
  participant,
  legRules,
  submittedLegLineups,
  hasSubmitted,
  canSubmit
}: {
  matchId: string;
  participant: ScorerParticipantInfo;
  legRules: MatchLegRule[];
  submittedLegLineups: Array<{ legNumber: number; playerIds: string[] }>;
  hasSubmitted: boolean;
  canSubmit: boolean;
}) {
  const submitted = hasSubmitted || submittedLegLineups.length > 0;

  return (
    <div className="grid gap-3 rounded-lg border border-wire bg-field p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-black">{participant.name}</div>
          <div className="mt-1 text-xs font-bold text-muted">
            {submitted ? "已提交，等待双方完成后公开" : "待队长提交"}
          </div>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-black ${submitted ? "bg-board text-white" : "bg-surface text-muted"}`}>
          {submitted ? "已提交" : "待提交"}
        </span>
      </div>

      {canSubmit ? (
        <details open={!submitted} className="rounded-lg bg-surface p-3">
          <summary className="cursor-pointer text-sm font-black text-board">
            {submitted ? "调整我方布阵" : "提交我方布阵"}
          </summary>
          <div className="mt-3">
            <MatchLineupSubmissionForm
              matchId={matchId}
              participantId={participant.id}
              legRules={legRules}
              members={participant.members}
              submittedLegLineups={submittedLegLineups}
              hasExistingSubmission={submitted}
            />
          </div>
        </details>
      ) : (
        <p className="rounded-lg bg-surface p-3 text-sm font-semibold text-muted">
          只能查看提交状态，提交前不会公开名单。
        </p>
      )}
    </div>
  );
}

function buildLineupPairings({
  participantA,
  participantB,
  legRules,
  lineups
}: {
  participantA: ScorerParticipantInfo;
  participantB: ScorerParticipantInfo;
  legRules: MatchLegRule[];
  lineups: Array<{ legNumber: number; participantAUserIds: string[]; participantBUserIds: string[] }>;
}) {
  const memberById = new Map(
    [...participantA.members, ...participantB.members].map((member) => [member.userId, member])
  );

  return lineups.map((lineup, index) => {
    const rule = legRules.find((item) => item.legNumber === lineup.legNumber) || legRules[index];
    const participantAMembers = lineup.participantAUserIds.map((userId) => memberById.get(userId)).filter(Boolean);
    const participantBMembers = lineup.participantBUserIds.map((userId) => memberById.get(userId)).filter(Boolean);

    return {
      index: lineup.legNumber,
      ruleLabel: rule ? getLegRuleLabel(rule) : undefined,
      participantAName: participantAMembers.map((member) => member?.name).join(" / ") || participantA.name,
      participantBName: participantBMembers.map((member) => member?.name).join(" / ") || participantB.name,
      participantAAvatarUrl: participantAMembers[0]?.avatarUrl || participantA.avatarUrl || null,
      participantBAvatarUrl: participantBMembers[0]?.avatarUrl || participantB.avatarUrl || null
    };
  });
}
