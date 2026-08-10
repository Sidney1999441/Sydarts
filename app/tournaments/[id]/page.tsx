import Link from "next/link";
import type { ReactNode } from "react";
import { FileImage, Monitor, Trophy } from "lucide-react";
import {
  cancelRegistrationAction,
  registerForTournamentAction,
  registerSavedTeamForTournamentAction
} from "@/lib/actions/tournaments";
import { getCurrentUserAndProfile } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { updateTournamentStandings } from "@/lib/algorithms/standings";
import { getCompactMatchRulesSummary, getDartModeLabel, getGameVariantLabel, resolveMatchLegRules } from "@/lib/darts/variants";
import {
  areBothMatchLineupsSubmitted,
  buildLineupsFromSubmissions,
  getMatchLineupSubmissions
} from "@/lib/matches/lineups";
import { getMatchStatusLabel, isUnplayedMatch } from "@/lib/matches/status";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn, formatDateTime } from "@/lib/utils";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { TournamentBracket } from "@/components/TournamentBracket";
import { MatchLineupSubmissionForm } from "@/components/scorer/MatchLineupSubmissionForm";
import {
  BoardReservationPanel,
  MatchBoardReservationBadge,
  type BoardReservationBoard,
  type BoardReservationRow,
  type BoardReservationSlot
} from "@/components/tournament/BoardReservationPanel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PlayerIdentity } from "@/components/ui/PlayerIdentity";
import type {
  MatchBoardReservation,
  MatchDartMode,
  MatchLegLineup,
  MatchLegRule,
  MatchSummary,
  ParticipantSeed,
  Tournament,
  TournamentBoard,
  TournamentBoardTimeSlot
} from "@/types/domain";

export const dynamic = "force-dynamic";

type MatchRow = MatchSummary & {
  stage: "group" | "knockout";
  round_number: number;
  match_number: number;
};

export default async function TournamentDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ schedule?: string }>;
}) {
  const { id } = await params;
  const { schedule = "all" } = (await searchParams) || {};
  const { user, profile } = await getCurrentUserAndProfile();

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
        <p className="text-sm text-muted">赛事不存在或无权访问。</p>
      </Card>
    );
  }

  const [
    { data: participants },
    { data: groups },
    { data: groupMembers },
    { data: matches },
    { data: registration },
    { data: savedTeams },
    { data: boards },
    { data: boardSlots },
    { data: reservations }
  ] = await Promise.all([
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
      : Promise.resolve({ data: null }),
    user
      ? supabase
          .from("saved_teams")
          .select("id, name, avatar_url")
          .eq("captain_user_id", user.id)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from("tournament_boards").select("*").eq("tournament_id", id).order("available_start_at"),
    supabase.from("tournament_board_time_slots").select("*").eq("tournament_id", id).order("daily_start_time"),
    supabase
      .from("match_board_reservations")
      .select("*")
      .eq("tournament_id", id)
      .eq("status", "active")
      .order("reserved_start_at")
  ]);

  const participantSeeds: ParticipantSeed[] = (participants || []).map((participant) => ({
    id: participant.id,
    name: participant.display_name,
    rating: participant.rating_snapshot || 1000
  }));
  const participantById = new Map(participantSeeds.map((participant) => [participant.id, participant]));
  const participantRowById = new Map((participants || []).map((participant) => [participant.id, participant]));
  const tournamentData = tournament as Tournament;
  const matchRows = (matches || []) as MatchRow[];
  const boardSlotRows = (boardSlots || []) as TournamentBoardTimeSlot[];
  const slotsByBoardId = groupBoardSlots(boardSlotRows);
  const boardRows = ((boards || []) as TournamentBoard[]).map((board) => toBoardView(board, slotsByBoardId.get(board.id)));
  const reservationRows = ((reservations || []) as MatchBoardReservation[]).map(toReservationView);
  const boardById = new Map(boardRows.map((board) => [board.id, board]));
  const reservationByMatchId = new Map(reservationRows.map((reservation) => [reservation.matchId, reservation]));
  const groupMatches = matchRows.filter((match) => match.stage === "group");
  const knockoutMatches = matchRows.filter((match) => match.stage === "knockout");
  const standings = updateTournamentStandings(
    participantSeeds,
    (tournamentData.format === "single_elimination"
      ? []
      : groupMatches.length > 0
        ? groupMatches
        : matchRows) as MatchSummary[]
  );
  const teamIds = [
    ...new Set((participants || []).map((participant) => participant.team_id).filter(Boolean))
  ] as string[];
  const [{ data: teamMembers }, { data: participantTeams }] = await Promise.all([
    teamIds.length > 0
      ? supabase.from("team_members").select("team_id, user_id, role").in("team_id", teamIds)
      : Promise.resolve({ data: [] }),
    teamIds.length > 0
      ? supabase.from("teams").select("id, avatar_url, captain_user_id").in("id", teamIds)
      : Promise.resolve({ data: [] })
  ]);
  const statUserIds = [
    ...new Set([
      ...(participants || []).map((participant) => participant.user_id).filter(Boolean),
      ...(teamMembers || []).map((member) => member.user_id)
    ])
  ] as string[];
  const { data: statProfiles } =
    statUserIds.length > 0
      ? await supabase.from("profiles").select("id, uid, display_name, avatar_url").in("id", statUserIds)
      : { data: [] };
  const statProfileById = new Map((statProfiles || []).map((item) => [item.id, item]));
  const teamAvatarById = new Map((participantTeams || []).map((team) => [team.id, team.avatar_url]));
  const teamById = new Map((participantTeams || []).map((team) => [team.id, team]));
  const teamMembersByTeamId = new Map<string, Array<{ userId: string; name: string }>>();
  for (const member of teamMembers || []) {
    const members = teamMembersByTeamId.get(member.team_id) || [];
    const profileRow = statProfileById.get(member.user_id);
    members.push({
      userId: member.user_id,
      name: `${profileRow?.display_name || member.user_id}${profileRow?.uid ? ` / UID ${profileRow.uid}` : ""}`
    });
    teamMembersByTeamId.set(member.team_id, members);
  }
  const participantMembersById = new Map<string, Array<{ userId: string; name: string }>>();
  const participantAvatarById = new Map<string, string | null>();
  for (const participant of participants || []) {
    if (participant.participant_type === "user" && participant.user_id) {
      const profileRow = statProfileById.get(participant.user_id);
      participantAvatarById.set(participant.id, profileRow?.avatar_url || null);
      participantMembersById.set(participant.id, [
        {
          userId: participant.user_id,
          name: `${profileRow?.display_name || participant.display_name}${profileRow?.uid ? ` / UID ${profileRow.uid}` : ""}`
        }
      ]);
    } else if (participant.team_id) {
      const members = teamMembersByTeamId.get(participant.team_id) || [];
      const firstMemberAvatar = (teamMembers || [])
        .filter((member) => member.team_id === participant.team_id)
        .map((member) => statProfileById.get(member.user_id)?.avatar_url || null)
        .find(Boolean) || null;
      participantAvatarById.set(participant.id, teamAvatarById.get(participant.team_id) || firstMemberAvatar || null);
      participantMembersById.set(participant.id, members);
    }
  }

  const currentUserId = user?.id || null;
  const isAdmin = profile?.role === "admin";
  const isUserInParticipant = (participantId?: string | null) =>
    Boolean(
      currentUserId &&
        participantId &&
        (participantMembersById.get(participantId) || []).some((member) => member.userId === currentUserId)
    );
  const canManageLineup = (participantId?: string | null) => {
    if (!participantId) return false;
    const participant = participantRowById.get(participantId);
    if (!participant || !currentUserId) return false;
    if (participant.participant_type === "user") return participant.user_id === currentUserId;
    if (!participant.team_id) return false;
    const teamCaptainId = teamById.get(participant.team_id)?.captain_user_id || null;
    if (teamCaptainId === currentUserId) return true;
    return (teamMembers || []).some(
      (member) => member.team_id === participant.team_id && member.user_id === currentUserId && member.role === "captain"
    );
  };
  const baseScheduleRows = groupMatches.length > 0 ? groupMatches : matchRows;
  const filteredScheduleRows = baseScheduleRows.filter((match) => {
    if (schedule === "mine") return isUserInParticipant(match.participant_a_id) || isUserInParticipant(match.participant_b_id);
    if (schedule === "pending") return isUnplayedMatch(match.status);
    if (schedule === "completed") return match.status === "completed" || match.status === "bye";
    return true;
  });

  return (
    <div className="grid min-w-0 gap-6">
      <CodlPageHeader
        kicker={tournamentData.status}
        title={tournamentData.name}
        description={tournamentData.description || "暂无赛事说明"}
        icon={<Trophy className="h-6 w-6" aria-hidden />}
        art="pattern"
        actions={
          <div className="grid gap-2">
            <Link
              className="inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-black text-white shadow-soft"
              href={`/tournaments/${id}/display`}
            >
              <Monitor className="h-4 w-4" aria-hidden />
              打开大屏
            </Link>
            <RegistrationPanel
              tournament={tournamentData}
              registration={registration}
              savedTeams={savedTeams || []}
            />
          </div>
        }
      />

      <Card>
        <dl className="grid gap-3 text-sm md:grid-cols-4">
          <Info label="地点" value={tournamentData.location || "待定"} />
          <Info label="比赛开始" value={formatDateTime(tournamentData.tournament_start_at)} />
          <Info label="赛制" value={getTournamentFormatLabel(tournamentData.format)} />
          <Info label="参赛" value={`${participantSeeds.length}/${tournamentData.max_participants}`} />
          <Info label="类型" value={`${tournamentData.tournament_type} / 每队 ${tournamentData.team_size} 人`} />
          <Info label="镖种" value={getDartModeLabel(tournamentData.dart_mode)} />
          <Info label="硬镖" value={`${tournamentData.dart_game} / BO${tournamentData.best_of}`} />
          <Info label="软镖" value={getGameVariantLabel({ dartMode: "soft", gameVariant: tournamentData.soft_game })} />
          <Info label="报名开始" value={formatDateTime(tournamentData.registration_start_at)} />
          <Info label="报名截止" value={formatDateTime(tournamentData.registration_end_at)} />
        </dl>
      </Card>

      {tournamentData.format !== "single_elimination" || (groups || []).length > 0 ? (
        <section className="grid min-w-0 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          {tournamentData.format !== "single_elimination" ? (
            <Card>
              <h2 className="text-lg font-bold">
                {tournamentData.format === "league_playoff" ? "联赛排名" : "排名"}
              </h2>
              <div className="mt-4 min-w-0 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-muted">
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
                        <td className="font-semibold">
                          <PlayerIdentity
                            name={row.name}
                            avatarUrl={participantAvatarById.get(row.participantId)}
                            subtitle={`Rating ${participantById.get(row.participantId)?.rating || 1000}`}
                            size="sm"
                            compact
                          />
                        </td>
                        <td>{row.played}</td>
                        <td>{row.wins}</td>
                        <td>{row.losses}</td>
                        <td>{row.legDiff}</td>
                        <td>{row.points}</td>
                      </tr>
                    ))}
                    {standings.length === 0 ? (
                      <tr>
                        <td className="py-4 text-muted" colSpan={7}>暂无排名数据。</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}

          <Card>
          <h2 className="text-lg font-bold">分组</h2>
          <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
            {(groups || []).map((group) => {
              const members = (groupMembers || [])
                .filter((member) => member.group_id === group.id)
                .map((member) => participantById.get(member.participant_id))
                .filter(Boolean) as ParticipantSeed[];
              return (
                <div key={group.id} className="min-w-0 rounded-lg border border-wire p-4">
                  <h3 className="break-words font-bold">{group.name}</h3>
                  <ul className="mt-3 grid gap-2 text-sm text-muted">
                    {members.map((member) => (
                      <li key={member.id} className="rounded-lg bg-field px-3 py-2">
                        <PlayerIdentity
                          name={member.name}
                          avatarUrl={participantAvatarById.get(member.id)}
                          subtitle={`Rating ${member.rating}`}
                          size="sm"
                          compact
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {(groups || []).length === 0 ? <p className="text-sm text-muted">暂未生成分组。</p> : null}
          </div>
          </Card>
        </section>
      ) : null}

      {knockoutMatches.length > 0 ? (
        <Card>
          <TournamentBracket
            title={tournamentData.format === "league_playoff" ? "季后赛对阵" : "淘汰赛对阵"}
            matches={knockoutMatches}
            participants={(participants || []).map((participant) => ({
              id: participant.id,
              display_name: participant.display_name,
              avatar_url: participantAvatarById.get(participant.id) || null
            }))}
          />
        </Card>
      ) : null}

      {(groupMatches.length > 0 || knockoutMatches.length === 0) ? (
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold">
              {tournamentData.format === "league_playoff" ? "联赛赛程" : "赛程"}
            </h2>
            <div className="flex flex-wrap gap-2">
              <ScheduleFilterLink href={`/tournaments/${id}?schedule=all`} active={schedule === "all"}>
                全部赛程
              </ScheduleFilterLink>
              <ScheduleFilterLink href={`/tournaments/${id}?schedule=mine`} active={schedule === "mine"}>
                我的比赛
              </ScheduleFilterLink>
              <ScheduleFilterLink href={`/tournaments/${id}?schedule=pending`} active={schedule === "pending"}>
                未开始
              </ScheduleFilterLink>
              <ScheduleFilterLink href={`/tournaments/${id}?schedule=completed`} active={schedule === "completed"}>
                已结束
              </ScheduleFilterLink>
            </div>
          </div>
          <div className="mt-4 grid min-w-0 gap-3">
            {filteredScheduleRows.map((match) => {
            const dartMode = ((match.dart_mode || "steel") === "soft" ? "soft" : "steel") as MatchDartMode;
            const participantAName = participantById.get(match.participant_a_id || "")?.name || "TBD";
            const participantBName = participantById.get(match.participant_b_id || "")?.name || "TBD";
            const participantAIsMine = isUserInParticipant(match.participant_a_id);
            const participantBIsMine = isUserInParticipant(match.participant_b_id);
            const participantAMembers = match.participant_a_id ? participantMembersById.get(match.participant_a_id) || [] : [];
            const participantBMembers = match.participant_b_id ? participantMembersById.get(match.participant_b_id) || [] : [];
            const matchLegRules = (Array.isArray(match.leg_rules) && match.leg_rules.length > 0
              ? match.leg_rules
              : resolveMatchLegRules({
                  matchRuleMode: tournamentData.match_rule_mode,
                  customRules: tournamentData.match_leg_rules,
                  dartMode: tournamentData.dart_mode || match.dart_mode || "steel",
                  dartGame: tournamentData.dart_game || match.game_variant || 501,
                  softGame: tournamentData.soft_game,
                  bestOf: tournamentData.best_of || 3,
                  tournamentType: tournamentData.tournament_type,
                  teamSize: tournamentData.team_size,
                  roundNumber: match.round_number,
                  mixedFirstDartMode: tournamentData.mixed_first_dart_mode
                }));
            const needsLineup =
              match.status !== "completed" &&
              match.status !== "bye" &&
              ((participantAMembers.length || 0) > 1 || (participantBMembers.length || 0) > 1);
            const lineupSubmissions = getMatchLineupSubmissions(match.details);
            const participantASubmission = match.participant_a_id ? lineupSubmissions[match.participant_a_id] : undefined;
            const participantBSubmission = match.participant_b_id ? lineupSubmissions[match.participant_b_id] : undefined;
            const bothLineupsSubmitted = areBothMatchLineupsSubmitted(match.details, match.participant_a_id, match.participant_b_id);
            const submittedLineups =
              bothLineupsSubmitted && match.participant_a_id && match.participant_b_id && matchLegRules.length > 0
                ? buildLineupsFromSubmissions({
                    details: match.details,
                    legRules: matchLegRules,
                    participantAId: match.participant_a_id,
                    participantBId: match.participant_b_id,
                    participantAUserIds: participantAMembers.map((member) => member.userId),
                    participantBUserIds: participantBMembers.map((member) => member.userId)
                  })
                : [];
            const canScore =
              match.status !== "completed" &&
              match.status !== "bye" &&
              Boolean(match.participant_a_id && match.participant_b_id) &&
              (isAdmin || isUserInParticipant(match.participant_a_id) || isUserInParticipant(match.participant_b_id));
            const currentReservation = reservationByMatchId.get(match.id) || null;
            const currentBoard = currentReservation ? boardById.get(currentReservation.boardId) || null : null;
            const canReserve =
              match.status !== "completed" &&
              match.status !== "bye" &&
              Boolean(match.participant_a_id && match.participant_b_id) &&
              (isAdmin || participantAIsMine || participantBIsMine);

            return (
              <div key={match.id} className="grid min-w-0 gap-3 rounded-lg border border-wire bg-surface/90 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xs font-black uppercase text-muted">
                      第 {match.round_number} 轮 / 第 {match.match_number} 场 / {getMatchStatusLabel(match.status)}
                    </div>
                    <MatchBoardReservationBadge reservation={currentReservation} board={currentBoard} />
                  </div>
                  <div className="mt-1 text-xs font-semibold text-board">
                    {getCompactMatchRulesSummary({
                      dartMode,
                      gameVariant: match.game_variant,
                      legRules: matchLegRules
                    })}
                  </div>
                  <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
                    <PlayerIdentity
                      className={cn("rounded-lg p-2", participantAIsMine && "bg-board/10 ring-1 ring-board/25")}
                      name={participantAName}
                      avatarUrl={match.participant_a_id ? participantAvatarById.get(match.participant_a_id) : null}
                      subtitle={`比分 ${match.score_a}`}
                      size="sm"
                      compact
                    />
                    <PlayerIdentity
                      className={cn("rounded-lg p-2", participantBIsMine && "bg-board/10 ring-1 ring-board/25")}
                      name={participantBName}
                      avatarUrl={match.participant_b_id ? participantAvatarById.get(match.participant_b_id) : null}
                      subtitle={`比分 ${match.score_b}`}
                      size="sm"
                      compact
                    />
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    比分 {match.score_a}:{match.score_b}
                  </div>
                  {needsLineup && match.participant_a_id && match.participant_b_id ? (
                    <TournamentLineupBrief
                      matchId={match.id}
                      participantA={{
                        id: match.participant_a_id,
                        name: participantAName,
                        members: participantAMembers
                      }}
                      participantB={{
                        id: match.participant_b_id,
                        name: participantBName,
                        members: participantBMembers
                      }}
                      legRules={matchLegRules}
                      participantASubmission={participantASubmission?.legLineups || []}
                      participantBSubmission={participantBSubmission?.legLineups || []}
                      participantAHasSubmission={Boolean(participantASubmission)}
                      participantBHasSubmission={Boolean(participantBSubmission)}
                      canSubmitA={canManageLineup(match.participant_a_id)}
                      canSubmitB={canManageLineup(match.participant_b_id)}
                      bothSubmitted={bothLineupsSubmitted}
                      submittedLineups={submittedLineups}
                    />
                  ) : null}
                  {canReserve || currentReservation ? (
                    <BoardReservationPanel
                      matchId={match.id}
                      boards={boardRows}
                      reservations={reservationRows}
                      currentReservation={currentReservation}
                      canReserve={canReserve}
                    />
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-wrap gap-2">
                  {canScore ? (
                    <Link className="rounded-lg bg-board px-3 py-2 text-sm font-black text-white" href={`/scorer/${match.id}`}>
                      计分
                    </Link>
                  ) : null}
                  {match.status === "completed" ? (
                    <Link className="inline-flex items-center gap-1 rounded-lg border border-wire bg-surface px-3 py-2 text-sm font-black text-board" href={`/reports/official/${match.id}`}>
                      <FileImage className="h-4 w-4" aria-hidden />
                      战报
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
            {baseScheduleRows.length === 0 ? <p className="text-sm text-muted">暂无赛程。</p> : null}
            {baseScheduleRows.length > 0 && filteredScheduleRows.length === 0 ? (
              <p className="text-sm text-muted">当前筛选下暂无赛程。</p>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function ScheduleFilterLink({
  href,
  active,
  children
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-9 touch-manipulation items-center rounded-lg border px-3 text-sm font-black transition-colors duration-75",
        active
          ? "border-board bg-board text-white"
          : "border-wire bg-surface text-ink hover:border-board/40 active:bg-field"
      )}
    >
      {children}
    </Link>
  );
}

type ScheduleParticipantInfo = {
  id: string;
  name: string;
  members: Array<{ userId: string; name: string; avatarUrl?: string | null }>;
};

function TournamentLineupBrief({
  matchId,
  participantA,
  participantB,
  legRules,
  participantASubmission,
  participantBSubmission,
  participantAHasSubmission,
  participantBHasSubmission,
  canSubmitA,
  canSubmitB,
  bothSubmitted,
  submittedLineups
}: {
  matchId: string;
  participantA: ScheduleParticipantInfo;
  participantB: ScheduleParticipantInfo;
  legRules: MatchLegRule[];
  participantASubmission: Array<{ legNumber: number; playerIds: string[] }>;
  participantBSubmission: Array<{ legNumber: number; playerIds: string[] }>;
  participantAHasSubmission: boolean;
  participantBHasSubmission: boolean;
  canSubmitA: boolean;
  canSubmitB: boolean;
  bothSubmitted: boolean;
  submittedLineups: MatchLegLineup[];
}) {
  const memberById = new Map(
    [...participantA.members, ...participantB.members].map((member) => [member.userId, member])
  );

  return (
    <details className="mt-3 rounded-lg border border-wire bg-field p-3">
      <summary className="cursor-pointer text-sm font-black text-board">
        赛前布阵 · {participantA.name} {participantAHasSubmission ? "已提交" : "待提交"} · {participantB.name}{" "}
        {participantBHasSubmission ? "已提交" : "待提交"}
      </summary>

      {bothSubmitted ? (
        <div className="mt-3 grid gap-2">
          {submittedLineups.length > 0 ? (
            submittedLineups.slice(0, 4).map((lineup) => {
              const aNames = lineup.participantAUserIds
                .map((userId) => memberById.get(userId)?.name)
                .filter(Boolean)
                .join(" / ");
              const bNames = lineup.participantBUserIds
                .map((userId) => memberById.get(userId)?.name)
                .filter(Boolean)
                .join(" / ");
              return (
                <div key={lineup.legNumber} className="rounded-lg bg-surface px-3 py-2 text-sm font-bold">
                  第 {lineup.legNumber} 局：{aNames || participantA.name} 对 {bNames || participantB.name}
                </div>
              );
            })
          ) : (
            <p className="rounded-lg bg-surface p-3 text-sm font-semibold text-muted">
              双方已提交布阵，进入计分页后公示完整对阵。
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <ScheduleLineupSide
            matchId={matchId}
            participant={participantA}
            legRules={legRules}
            submittedLegLineups={participantASubmission}
            hasSubmitted={participantAHasSubmission}
            canSubmit={canSubmitA}
          />
          <ScheduleLineupSide
            matchId={matchId}
            participant={participantB}
            legRules={legRules}
            submittedLegLineups={participantBSubmission}
            hasSubmitted={participantBHasSubmission}
            canSubmit={canSubmitB}
          />
        </div>
      )}
    </details>
  );
}

function ScheduleLineupSide({
  matchId,
  participant,
  legRules,
  submittedLegLineups,
  hasSubmitted,
  canSubmit
}: {
  matchId: string;
  participant: ScheduleParticipantInfo;
  legRules: MatchLegRule[];
  submittedLegLineups: Array<{ legNumber: number; playerIds: string[] }>;
  hasSubmitted: boolean;
  canSubmit: boolean;
}) {
  const submitted = hasSubmitted || submittedLegLineups.length > 0;

  return (
    <div className="grid gap-2 rounded-lg bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-sm font-black">{participant.name}</div>
        <span className={`rounded-full px-2 py-1 text-xs font-black ${submitted ? "bg-board text-white" : "bg-field text-muted"}`}>
          {submitted ? "已提交" : "待提交"}
        </span>
      </div>
      {canSubmit ? (
        <MatchLineupSubmissionForm
          matchId={matchId}
          participantId={participant.id}
          legRules={legRules}
          members={participant.members}
          submittedLegLineups={submittedLegLineups}
          hasExistingSubmission={submitted}
          compact
        />
      ) : (
        <p className="text-xs font-semibold text-muted">只能查看提交状态，提交前不会公开名单。</p>
      )}
    </div>
  );
}

function groupBoardSlots(slots: TournamentBoardTimeSlot[]) {
  const slotsByBoardId = new Map<string, TournamentBoardTimeSlot[]>();
  for (const slot of slots) {
    const list = slotsByBoardId.get(slot.board_id) || [];
    list.push(slot);
    slotsByBoardId.set(slot.board_id, list);
  }
  return slotsByBoardId;
}

function toBoardView(board: TournamentBoard, slots: TournamentBoardTimeSlot[] = []): BoardReservationBoard {
  return {
    id: board.id,
    name: board.name,
    availableStartAt: board.available_start_at,
    availableEndAt: board.available_end_at,
    status: board.status,
    slots: slots.map(toBoardSlotView)
  };
}

function toBoardSlotView(slot: TournamentBoardTimeSlot): BoardReservationSlot {
  return {
    id: slot.id,
    boardId: slot.board_id,
    availableStartAt: slot.available_start_at,
    availableEndAt: slot.available_end_at,
    dailyStartTime: slot.daily_start_time,
    dailyEndTime: slot.daily_end_time,
    status: slot.status
  };
}

function toReservationView(reservation: MatchBoardReservation): BoardReservationRow {
  return {
    id: reservation.id,
    matchId: reservation.match_id,
    boardId: reservation.board_id,
    reservedStartAt: reservation.reserved_start_at,
    reservedEndAt: reservation.reserved_end_at,
    status: reservation.status
  };
}

function getTournamentFormatLabel(format: Tournament["format"]) {
  if (format === "round_robin") return "小组循环";
  if (format === "single_elimination") return "单淘汰赛";
  if (format === "league_playoff") return "联赛 + 季后赛";
  return "双淘汰赛";
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-wire bg-field/80 p-3">
      <dt className="text-xs font-black text-muted">{label}</dt>
      <dd className="mt-1 break-words font-black">{value}</dd>
    </div>
  );
}

function RegistrationPanel({
  tournament,
  registration,
  savedTeams
}: {
  tournament: Tournament;
  registration: { status?: string } | null;
  savedTeams: Array<{ id: string; name: string; avatar_url: string | null }>;
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
    return <div className="rounded-lg border border-wire bg-surface/95 px-4 py-3 text-sm font-black">当前不可报名</div>;
  }

  return (
    <div className="grid gap-3">
      <form action={registerForTournamentAction} className="grid gap-2">
        <input type="hidden" name="tournament_id" value={tournament.id} />
        {tournament.team_size > 1 ? (
          <input className="form-input" name="preferred_partner_identifier" placeholder="可选：队友 6 位 UID" />
        ) : null}
        <Button type="submit">报名参赛</Button>
      </form>
      {Number(tournament.team_size || 1) > 1 && savedTeams.length > 0 ? (
        <details className="rounded-lg border border-wire bg-surface p-3">
          <summary className="cursor-pointer text-sm font-bold">使用长期队伍报名</summary>
          <form action={registerSavedTeamForTournamentAction} className="mt-3 grid gap-2">
            <input type="hidden" name="tournament_id" value={tournament.id} />
            <select className="form-input" name="saved_team_id" required>
              <option value="">选择长期队伍</option>
              {savedTeams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
            <textarea
              className="form-input min-h-24"
              name="member_identifiers"
              placeholder={`每行一个 UID，本赛事每队 ${tournament.team_size} 人，必须包含队长`}
              required
            />
            <Button type="submit" variant="secondary">报名长期队伍</Button>
          </form>
        </details>
      ) : null}
    </div>
  );
}
