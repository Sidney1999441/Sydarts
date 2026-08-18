import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarDays, FileImage, Monitor, Trophy } from "lucide-react";
import {
  cancelRegistrationAction,
  registerForTournamentAction,
  registerSavedTeamForTournamentAction
} from "@/lib/actions/tournaments";
import { getCurrentUserAndProfile } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import type { ScoreTurn } from "@/lib/algorithms/scoring";
import { updateTournamentStandings, type StandingRow } from "@/lib/algorithms/standings";
import { calculatePlayerLevel } from "@/lib/algorithms/player-level";
import { buildLegUserStatsFromTurns } from "@/lib/darts/leg-stats";
import { getCompactMatchRulesSummary, getDartModeLabel, getGameVariantLabel, resolveMatchLegRules } from "@/lib/darts/variants";
import {
  areBothMatchLineupsSubmitted,
  buildLineupsFromSubmissions,
  getMatchLineupSubmissions
} from "@/lib/matches/lineups";
import { getMatchStatusLabel, isUnplayedMatch } from "@/lib/matches/status";
import { compactPlayerName, formatUserDisplayName, isOpaqueIdentifier } from "@/lib/scorer/display-names";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  evaluateWeeklyStars,
  mergeWeeklyStarOverrides,
  type WeeklyStarIdentity,
  type WeeklyStarOverride
} from "@/lib/tournaments/weekly-stars";
import {
  comparePersonalBest,
  shouldReplacePersonalBest,
  type PersonalStatSourceMode
} from "@/lib/tournaments/personal-ranking";
import { cn, formatDateTime } from "@/lib/utils";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { TournamentBracket } from "@/components/TournamentBracket";
import { MatchLineupSubmissionForm } from "@/components/scorer/MatchLineupSubmissionForm";
import {
  MatchBoardReservationBadge,
  type BoardReservationBoard,
  type BoardReservationRow
} from "@/components/tournament/BoardReservationPanel";
import { WeeklyStarBoard } from "@/components/tournament/WeeklyStarBoard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PlayerAvatar, PlayerIdentity } from "@/components/ui/PlayerIdentity";
import type {
  MatchBoardReservation,
  MatchDartMode,
  MatchLegLineup,
  MatchLegRule,
  MatchSummary,
  ParticipantSeed,
  Tournament,
  TournamentBoard
} from "@/types/domain";

export const dynamic = "force-dynamic";

type MatchRow = MatchSummary & {
  stage: "group" | "knockout";
  round_number: number;
  match_number: number;
  updated_at: string;
};

type MatchTurnRow = {
  match_id: string;
  participant_id: string;
  user_id: string | null;
  score: number;
  darts: number | null;
  leg_number: number;
  remaining_before: number;
  remaining_after: number;
  is_bust: boolean;
  is_checkout: boolean;
};

export default async function TournamentDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ schedule?: string }>;
}) {
  const { id } = await params;
  const query = (await searchParams) || {};
  const schedule = query.schedule || "all";
  const shouldOpenSchedule = Boolean(query.schedule);
  const { user, profile } = await getCurrentUserAndProfile();

  if (!hasSupabaseEnv()) return <SetupNotice />;

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
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
    { data: reservations },
    { data: weeklyStarOverrides }
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
    supabase
      .from("match_board_reservations")
      .select("*")
      .eq("tournament_id", id)
      .eq("status", "active")
      .order("reserved_start_at"),
    admin
      .from("tournament_weekly_stars")
      .select("week_start, user_id, reason")
      .eq("tournament_id", id)
      .order("week_start", { ascending: false })
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
  const hardMatchesNeedingTurnBackfill = matchRows.filter(needsHardTurnBackfill);
  const matchTurnResponses = await Promise.all(
    hardMatchesNeedingTurnBackfill.map((match) =>
      admin
        .from("match_turns")
        .select("match_id, participant_id, user_id, score, darts, leg_number, remaining_before, remaining_after, is_bust, is_checkout")
        .eq("match_id", match.id)
        .order("turn_number", { ascending: true })
    )
  );
  const matchTurnRows = matchTurnResponses.flatMap((response) => response.data || []);
  const turnsByMatchId = new Map<string, ScoreTurn[]>();
  for (const row of matchTurnRows as MatchTurnRow[]) {
    if (!row.match_id || !row.participant_id) continue;
    const turns = turnsByMatchId.get(row.match_id) || [];
    turns.push({
      participantId: row.participant_id,
      userId: row.user_id || undefined,
      legNumber: Number(row.leg_number),
      score: Number(row.score),
      darts: row.darts === null ? undefined : Number(row.darts),
      remainingBefore: Number(row.remaining_before),
      remainingAfter: Number(row.remaining_after),
      isBust: Boolean(row.is_bust),
      isCheckout: Boolean(row.is_checkout)
    });
    turnsByMatchId.set(row.match_id, turns);
  }
  const boardRows = ((boards || []) as TournamentBoard[]).map((board) => toBoardView(board));
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
      ? await admin.from("profiles").select("id, uid, display_name, avatar_url, rating, tournament_rating").in("id", statUserIds)
      : { data: [] };
  const statProfileById = new Map((statProfiles || []).map((item) => [item.id, item]));
  const tournamentRatingByUserId = new Map(
    (statProfiles || []).map((item) => [item.id, Number(item.tournament_rating ?? item.rating ?? 1000)])
  );
  const teamAvatarById = new Map((participantTeams || []).map((team) => [team.id, team.avatar_url]));
  const teamById = new Map((participantTeams || []).map((team) => [team.id, team]));
  const teamMembersByTeamId = new Map<string, Array<{ userId: string; name: string }>>();
  for (const member of teamMembers || []) {
    const members = teamMembersByTeamId.get(member.team_id) || [];
    const profileRow = statProfileById.get(member.user_id);
    members.push({
      userId: member.user_id,
      name: formatUserDisplayName({
        userId: member.user_id,
        displayName: profileRow?.display_name,
        uid: profileRow?.uid
      })
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
          name: formatUserDisplayName({
            userId: participant.user_id,
            displayName: profileRow?.display_name,
            uid: profileRow?.uid,
            fallback: participant.display_name
          })
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
  const participantDisplayNameById = new Map<string, string>();
  for (const participant of participants || []) {
    const rawName = participant.display_name || "";
    const memberNames = (participantMembersById.get(participant.id) || [])
      .map((member) => member.name)
      .filter(Boolean)
      .join(" / ");
    participantDisplayNameById.set(
      participant.id,
      rawName && !isOpaqueIdentifier(rawName) ? rawName : memberNames || rawName || "TBD"
    );
  }
  const getParticipantDisplayName = (participantId?: string | null, fallback = "TBD") =>
    participantId ? participantDisplayNameById.get(participantId) || participantById.get(participantId)?.name || fallback : fallback;
  const participantLevel = (participantId: string) => {
    const participant = participantRowById.get(participantId);
    const snapshotRating = Number(participantById.get(participantId)?.rating || 1000);
    const memberIds = (participantMembersById.get(participantId) || []).map((member) => member.userId);
    const memberRatings = memberIds
      .map((userId) => tournamentRatingByUserId.get(userId))
      .filter((rating): rating is number => Number.isFinite(rating));
    const isTeamParticipant = participant?.participant_type === "team" || Boolean(participant?.team_id);
    const ratingForLevel =
      memberRatings.length > 0
        ? Math.round(memberRatings.reduce((total, rating) => total + rating, 0) / memberRatings.length)
        : isTeamParticipant
          ? Math.round(snapshotRating / Math.max(memberIds.length || 2, 1))
          : snapshotRating;

    return calculatePlayerLevel({ rating: ratingForLevel }).level;
  };
  const personalLeaderboards = buildPersonalLeaderboards({
    matches: matchRows,
    turnsByMatchId,
    profilesByUserId: statProfileById,
    participantMembersById,
    participantById,
    participantDisplayNameById
  });
  const weeklyStarIdentities = new Map<string, WeeklyStarIdentity>();
  for (const [participantId, members] of participantMembersById) {
    const participant = participantRowById.get(participantId);
    const teamName = participant?.participant_type === "team"
      ? participantDisplayNameById.get(participantId) || ""
      : "";
    for (const member of members) {
      const profileRow = statProfileById.get(member.userId);
      weeklyStarIdentities.set(member.userId, {
        name: compactPlayerName(member.name) || member.name,
        avatarUrl: profileRow?.avatar_url || null,
        teamName
      });
    }
  }
  const weeklyStarEvaluation = evaluateWeeklyStars({
    matches: matchRows,
    participantMembersById,
    identitiesByUserId: weeklyStarIdentities,
    turnsByMatchId
  });
  const weeklyStars = mergeWeeklyStarOverrides({
    evaluation: weeklyStarEvaluation,
    overrides: (weeklyStarOverrides || []) as WeeklyStarOverride[],
    identitiesByUserId: weeklyStarIdentities
  });
  const standingPodiumRows = standings.slice(0, 3).map((row, index) => ({
    row,
    rank: index + 1,
    name: getParticipantDisplayName(row.participantId, row.name),
    avatarUrl: participantAvatarById.get(row.participantId) || null,
    level: participantLevel(row.participantId),
    points: Number.isFinite(Number(row.points)) ? Number(row.points) : row.wins * 3,
    members: participantMembersById.get(row.participantId) || []
  }));
  const standingListRows = standings.slice(3);
  const showStandings = tournamentData.format !== "single_elimination";
  const showGroups = (groups || []).length > 1;

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
              className="inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg bg-board px-4 text-sm font-black text-white shadow-soft"
              href={`/tournaments/${id}?schedule=all#schedule`}
            >
              <CalendarDays className="h-4 w-4" aria-hidden />
              查看赛程
            </Link>
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

      <WeeklyStarBoard stars={weeklyStars} tournamentStartAt={tournamentData.tournament_start_at} />

      {showStandings || showGroups ? (
        <section className={cn("grid min-w-0 gap-4", showStandings && showGroups && "lg:grid-cols-[1.1fr_0.9fr]")}>
          {showStandings ? (
            <Card>
              <h2 className="text-lg font-bold">
                {tournamentData.format === "league_playoff" ? "联赛排名" : "排名"}
              </h2>
              {standingPodiumRows.length > 0 ? (
                <div className="mt-4">
                  <StandingPodium rows={standingPodiumRows} />
                </div>
              ) : null}
              {standingListRows.length > 0 ? (
                <div className="mt-4 grid gap-2">
                  {standingListRows.map((row, index) => {
                  const points = Number.isFinite(Number(row.points)) ? Number(row.points) : row.wins * 3;
                  const rank = index + 4;
                  return (
                    <div
                      key={row.participantId}
                      className={cn(
                        "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg border p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center",
                        getPodiumTone(rank, "list")
                      )}
                    >
                      <div className={cn(
                        "grid h-10 w-10 place-items-center rounded-lg text-sm font-black",
                        getPodiumTone(rank, "rank")
                      )}>
                        {rank}
                      </div>
                      <PlayerIdentity
                        name={getParticipantDisplayName(row.participantId, row.name)}
                        avatarUrl={participantAvatarById.get(row.participantId)}
                        level={participantLevel(row.participantId)}
                        subtitle={`${row.played} 场 · ${row.wins} 胜 ${row.losses} 负 · 等级 ${participantLevel(row.participantId)}`}
                        size="sm"
                        compact
                      />
                      <div className="col-span-2 grid grid-cols-[1.05fr_repeat(4,1fr)] gap-1 text-center text-xs font-black sm:col-span-1 sm:min-w-[300px]">
                        <RankMetric label="积分" value={points} strong compact />
                        <RankMetric label="场" value={row.played} compact />
                        <RankMetric label="胜" value={row.wins} compact />
                        <RankMetric label="负" value={row.losses} compact />
                        <RankMetric label="Leg" value={row.legDiff > 0 ? `+${row.legDiff}` : row.legDiff} compact />
                      </div>
                    </div>
                  );
                  })}
                </div>
              ) : standings.length === 0 ? (
                <p className="mt-4 text-sm text-muted">暂无排名数据。</p>
              ) : null}
            </Card>
          ) : null}

          {showGroups ? (
            <Card>
              <h2 className="text-lg font-bold">分组</h2>
              <div className="mt-4 grid min-w-0 gap-4">
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
                              name={getParticipantDisplayName(member.id, member.name)}
                              avatarUrl={participantAvatarById.get(member.id)}
                              level={participantLevel(member.id)}
                              subtitle={`等级 ${participantLevel(member.id)}`}
                              size="sm"
                              compact
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}
        </section>
      ) : null}

      {hasPersonalLeaderboards(personalLeaderboards) ? (
        <Card>
          <h2 className="text-lg font-bold">个人排行榜</h2>
          <div className="mt-4 grid gap-4">
            <LeaderboardSection
              title="硬镖榜单"
              description="只统计硬镖比赛和混合赛制中的硬镖局。"
              lists={[
                {
                  title: "最高均分",
                  rows: personalLeaderboards.steel.average,
                  metric: (row) => row.bestAverage.toFixed(1),
                  sourceBadge: (row) => getPersonalStatSourceBadge(row.bestAverageMode),
                  emptyText: "暂无硬镖均分数据"
                },
                {
                  title: "180 榜",
                  rows: personalLeaderboards.steel.count180,
                  metric: (row) => `${row.count180}`,
                  sourceBadge: (row) => row.count180IncludesDoubles ? "含双人" : null,
                  emptyText: "暂无 180 数据"
                },
                {
                  title: "最高拆分",
                  rows: personalLeaderboards.steel.checkout,
                  metric: (row) => `${row.bestCheckout}`,
                  sourceBadge: (row) => getPersonalStatSourceBadge(row.bestCheckoutMode),
                  emptyText: "暂无硬镖拆分数据"
                }
              ]}
            />
            <LeaderboardSection
              title="软镖榜单"
              description="只统计软镖比赛和混合赛制中的软镖局。"
              lists={[
                {
                  title: "PPR 榜",
                  rows: personalLeaderboards.soft.average,
                  metric: (row) => row.bestAverage.toFixed(1),
                  sourceBadge: (row) => getPersonalStatSourceBadge(row.bestAverageMode),
                  emptyText: "暂无软镖 PPR 数据"
                },
                {
                  title: "MPR 榜",
                  rows: personalLeaderboards.soft.mpr,
                  metric: (row) => row.bestMpr.toFixed(2),
                  sourceBadge: (row) => getPersonalStatSourceBadge(row.bestMprMode),
                  emptyText: "暂无 MPR 数据"
                },
                {
                  title: "帽子榜",
                  rows: personalLeaderboards.soft.hats,
                  metric: (row) => `${row.hats}`,
                  sourceBadge: (row) => row.hatsIncludesDoubles ? "含双人" : null,
                  emptyText: "暂无软镖帽子数据"
                },
                {
                  title: "高分赛榜",
                  rows: personalLeaderboards.soft.highScore,
                  metric: (row) => `${row.bestHighScore}`,
                  sourceBadge: (row) => getPersonalStatSourceBadge(row.bestHighScoreMode),
                  emptyText: "暂无高分赛数据"
                },
                {
                  title: "白马榜",
                  rows: personalLeaderboards.soft.whiteHorse,
                  metric: (row) => `${row.whiteHorse}`,
                  sourceBadge: (row) => row.whiteHorseIncludesDoubles ? "含双人" : null,
                  emptyText: "暂无白马数据"
                }
              ]}
            />
          </div>
        </Card>
      ) : null}

      <TournamentInfoDetails tournament={tournamentData} participantCount={participantSeeds.length} />

      {knockoutMatches.length > 0 ? (
        <Card>
          <TournamentBracket
            title={tournamentData.format === "league_playoff" ? "季后赛对阵" : "淘汰赛对阵"}
            matches={knockoutMatches}
            participants={(participants || []).map((participant) => ({
              id: participant.id,
              display_name: getParticipantDisplayName(participant.id, participant.display_name),
              avatar_url: participantAvatarById.get(participant.id) || null
            }))}
          />
        </Card>
      ) : null}

      {(groupMatches.length > 0 || knockoutMatches.length === 0) ? (
        <details
          id="schedule"
          open={shouldOpenSchedule}
          className="scroll-mt-24 rounded-lg border border-wire bg-surface/95 p-4 shadow-[0_18px_45px_rgb(17_24_39/0.06)] sm:p-5"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-lg font-bold marker:hidden">
            <span>{tournamentData.format === "league_playoff" ? "联赛赛程" : "赛程"}</span>
            <span className="rounded-full bg-field px-3 py-1 text-xs font-black text-board">点击展开/收起</span>
          </summary>
          <div className="mt-4 flex flex-wrap gap-2">
            <ScheduleFilterLink href={`/tournaments/${id}?schedule=all#schedule`} active={schedule === "all"}>
              全部赛程
            </ScheduleFilterLink>
            <ScheduleFilterLink href={`/tournaments/${id}?schedule=mine#schedule`} active={schedule === "mine"}>
              我的比赛
            </ScheduleFilterLink>
            <ScheduleFilterLink href={`/tournaments/${id}?schedule=pending#schedule`} active={schedule === "pending"}>
              未开始
            </ScheduleFilterLink>
            <ScheduleFilterLink href={`/tournaments/${id}?schedule=completed#schedule`} active={schedule === "completed"}>
              已结束
            </ScheduleFilterLink>
          </div>
          <div className="mt-4 grid min-w-0 gap-3">
            {filteredScheduleRows.map((match) => {
            const dartMode = ((match.dart_mode || "steel") === "soft" ? "soft" : "steel") as MatchDartMode;
            const participantAName = getParticipantDisplayName(match.participant_a_id, "TBD");
            const participantBName = getParticipantDisplayName(match.participant_b_id, "TBD");
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

            return (
              <div key={match.id} className="grid min-w-0 gap-3 rounded-lg border border-wire bg-surface/90 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <DartModeBadge dartMode={dartMode} />
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
        </details>
      ) : null}
    </div>
  );
}

type PersonalLeaderboardRow = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  teamName: string;
  hats: number;
  whiteHorse: number;
  count180: number;
  bestAverage: number;
  bestAverageMode: PersonalStatSourceMode;
  bestMpr: number;
  bestMprMode: PersonalStatSourceMode;
  bestHighScore: number;
  bestHighScoreMode: PersonalStatSourceMode;
  bestCheckout: number;
  bestCheckoutMode: PersonalStatSourceMode;
  hatsIncludesDoubles: boolean;
  whiteHorseIncludesDoubles: boolean;
  count180IncludesDoubles: boolean;
};

type PersonalLeaderboardGroup = {
  hats: PersonalLeaderboardRow[];
  whiteHorse: PersonalLeaderboardRow[];
  count180: PersonalLeaderboardRow[];
  highScore: PersonalLeaderboardRow[];
  average: PersonalLeaderboardRow[];
  mpr: PersonalLeaderboardRow[];
  checkout: PersonalLeaderboardRow[];
};

type PersonalLeaderboards = {
  steel: PersonalLeaderboardGroup;
  soft: PersonalLeaderboardGroup;
};

type PersonalStatEntry = {
  userId: string;
  dartMode: MatchDartMode;
  gameVariant?: string | number | null;
  stats: Record<string, unknown>;
  legNumber?: number;
  participantMode: PersonalStatSourceMode;
  isLegLevel: boolean;
};

function buildPersonalLeaderboards({
  matches,
  turnsByMatchId,
  profilesByUserId,
  participantMembersById,
  participantById,
  participantDisplayNameById
}: {
  matches: MatchRow[];
  turnsByMatchId: Map<string, ScoreTurn[]>;
  profilesByUserId: Map<string, { display_name?: string | null; avatar_url?: string | null }>;
  participantMembersById: Map<string, Array<{ userId: string; name: string }>>;
  participantById: Map<string, ParticipantSeed>;
  participantDisplayNameById: Map<string, string>;
}) {
  const teamNameByUserId = new Map<string, string>();
  const fallbackNameByUserId = new Map<string, string>();

  for (const [participantId, members] of participantMembersById) {
    const teamName = participantDisplayNameById.get(participantId) || participantById.get(participantId)?.name || "";
    for (const member of members) {
      teamNameByUserId.set(member.userId, teamName);
      fallbackNameByUserId.set(member.userId, member.name);
    }
  }

  const rowsByMode = {
    steel: new Map<string, PersonalLeaderboardRow>(),
    soft: new Map<string, PersonalLeaderboardRow>()
  };

  for (const match of matches) {
    if (match.status !== "completed") continue;

    for (const statEntry of readPersonalStatEntries(match, turnsByMatchId.get(match.id) || [])) {
      const stats = statEntry.stats;
      const hats = statNumber(stats, ["countHatTrick"]) || 0;
      const whiteHorse = statNumber(stats, ["countWhiteHorse"]) || 0;
      const count180 = statNumber(stats, ["count180", "countTon80"]) || 0;
      const average = statEntry.isLegLevel ? statNumber(stats, ["averageScore", "averagePer3Darts"]) || 0 : 0;
      const mpr = statEntry.isLegLevel ? statNumber(stats, ["averageMpr"]) || 0 : 0;
      const highScore =
        statEntry.isLegLevel && statEntry.dartMode === "soft" && String(statEntry.gameVariant || "") === "soft_high_score"
          ? statNumber(stats, ["highestTurnScore", "totalScoredPoints"]) || 0
          : 0;
      const checkout = statNumber(stats, ["highestCheckout"]) || 0;
      const hasSteelStat = average > 0 || count180 > 0 || checkout > 0;
      const hasSoftStat = average > 0 || mpr > 0 || hats > 0 || whiteHorse > 0 || highScore > 0 || checkout > 0;
      if (statEntry.dartMode === "steel" && !hasSteelStat) continue;
      if (statEntry.dartMode === "soft" && !hasSoftStat) continue;

      const profile = profilesByUserId.get(statEntry.userId);
      const current = rowsByMode[statEntry.dartMode].get(statEntry.userId) || {
        userId: statEntry.userId,
        name: profile?.display_name || fallbackNameByUserId.get(statEntry.userId) || `选手 ${statEntry.userId.slice(0, 6)}`,
        avatarUrl: profile?.avatar_url || null,
        teamName: teamNameByUserId.get(statEntry.userId) || "",
        hats: 0,
        whiteHorse: 0,
        count180: 0,
        bestAverage: 0,
        bestAverageMode: null,
        bestMpr: 0,
        bestMprMode: null,
        bestHighScore: 0,
        bestHighScoreMode: null,
        bestCheckout: 0,
        bestCheckoutMode: null,
        hatsIncludesDoubles: false,
        whiteHorseIncludesDoubles: false,
        count180IncludesDoubles: false
      };
      current.hats += hats;
      current.whiteHorse += whiteHorse;
      current.count180 += count180;
      if (statEntry.participantMode === "doubles") {
        current.hatsIncludesDoubles ||= hats > 0;
        current.whiteHorseIncludesDoubles ||= whiteHorse > 0;
        current.count180IncludesDoubles ||= count180 > 0;
      }
      if (shouldReplacePersonalBest({
        currentValue: current.bestAverage,
        currentMode: current.bestAverageMode,
        nextValue: average,
        nextMode: statEntry.participantMode
      })) {
        current.bestAverage = average;
        current.bestAverageMode = statEntry.participantMode;
      }
      if (shouldReplacePersonalBest({
        currentValue: current.bestMpr,
        currentMode: current.bestMprMode,
        nextValue: mpr,
        nextMode: statEntry.participantMode
      })) {
        current.bestMpr = mpr;
        current.bestMprMode = statEntry.participantMode;
      }
      if (shouldReplacePersonalBest({
        currentValue: current.bestHighScore,
        currentMode: current.bestHighScoreMode,
        nextValue: highScore,
        nextMode: statEntry.participantMode
      })) {
        current.bestHighScore = highScore;
        current.bestHighScoreMode = statEntry.participantMode;
      }
      if (shouldReplacePersonalBest({
        currentValue: current.bestCheckout,
        currentMode: current.bestCheckoutMode,
        nextValue: checkout,
        nextMode: statEntry.participantMode
      })) {
        current.bestCheckout = checkout;
        current.bestCheckoutMode = statEntry.participantMode;
      }
      rowsByMode[statEntry.dartMode].set(statEntry.userId, current);
    }
  }

  return {
    steel: rankPersonalRows([...rowsByMode.steel.values()]),
    soft: rankPersonalRows([...rowsByMode.soft.values()])
  };
}

function hasPersonalLeaderboards(leaderboards: PersonalLeaderboards) {
  return Object.values(leaderboards).some((group) =>
    Object.values(group).some((rows) => rows.length > 0)
  );
}

function rankPersonalRows(rows: PersonalLeaderboardRow[]): PersonalLeaderboardGroup {
  return {
    hats: rows
      .filter((row) => row.hats > 0)
      .sort((a, b) => b.hats - a.hats || b.bestAverage - a.bestAverage)
      .slice(0, 5),
    whiteHorse: rows
      .filter((row) => row.whiteHorse > 0)
      .sort((a, b) => b.whiteHorse - a.whiteHorse || b.bestMpr - a.bestMpr)
      .slice(0, 5),
    count180: rows
      .filter((row) => row.count180 > 0)
      .sort((a, b) => b.count180 - a.count180 || b.bestAverage - a.bestAverage)
      .slice(0, 5),
    highScore: rows
      .filter((row) => row.bestHighScore > 0)
      .sort((a, b) => b.bestHighScore - a.bestHighScore || b.hats - a.hats)
      .slice(0, 5),
    average: rows
      .filter((row) => row.bestAverage > 0)
      .sort((a, b) => comparePersonalBest(a.bestAverage, a.bestAverageMode, b.bestAverage, b.bestAverageMode))
      .slice(0, 5),
    mpr: rows
      .filter((row) => row.bestMpr > 0)
      .sort((a, b) => comparePersonalBest(a.bestMpr, a.bestMprMode, b.bestMpr, b.bestMprMode))
      .slice(0, 5),
    checkout: rows
      .filter((row) => row.bestCheckout > 0)
      .sort((a, b) => b.bestCheckout - a.bestCheckout)
      .slice(0, 5)
  };
}

function readPersonalStatEntries(match: MatchRow, turns: ScoreTurn[]): PersonalStatEntry[] {
  const legEntries = readLegUserStatEntries(match.details, match.leg_rules || []);
  const legEntryKeys = new Set(legEntries.map((entry) => `${entry.legNumber}:${entry.userId}`));
  const turnEntries = buildLegUserStatsFromTurns(turns).flatMap((entry) => {
    const rule = (match.leg_rules || []).find((item) => item.legNumber === entry.legNumber);
    if (rule?.dartMode === "soft") return [];
    return Object.entries(entry.userStats).flatMap(([userId, stats]) => {
      if (legEntryKeys.has(`${entry.legNumber}:${userId}`)) return [];
      return [{
        userId,
        dartMode: "steel" as const,
        gameVariant: rule?.gameVariant || match.game_variant,
        stats,
        legNumber: entry.legNumber,
        participantMode: rule?.participantMode || null,
        isLegLevel: true
      }];
    });
  });
  if (legEntries.length > 0 || turnEntries.length > 0) return [...legEntries, ...turnEntries];

  const matchDartMode: MatchDartMode = match.dart_mode === "soft" ? "soft" : "steel";
  return Object.entries(readMatchUserStats(match.details)).map(([userId, stats]) => ({
    userId,
    dartMode: matchDartMode,
    gameVariant: match.game_variant,
    stats,
    participantMode: null,
    isLegLevel: false
  }));
}

function needsHardTurnBackfill(match: MatchRow) {
  if (match.status !== "completed") return false;
  const steelLegEntries = readLegUserStatEntries(match.details, match.leg_rules || []).filter((entry) => entry.dartMode === "steel");
  const details = match.details && typeof match.details === "object" && !Array.isArray(match.details)
    ? match.details
    : null;
  const rawLegResults = details && Array.isArray(details.legResults) ? details.legResults : [];
  const playedHardLegNumbers = rawLegResults.flatMap((rawResult) => {
    if (!rawResult || typeof rawResult !== "object" || Array.isArray(rawResult)) return [];
    const result = rawResult as Record<string, unknown>;
    const legNumber = Number(result.legNumber);
    const rule = (match.leg_rules || []).find((item) => item.legNumber === legNumber);
    const dartMode = result.dartMode === "soft" || result.dartMode === "steel" ? result.dartMode : rule?.dartMode;
    return Number.isFinite(legNumber) && dartMode !== "soft" ? [legNumber] : [];
  });
  if (playedHardLegNumbers.length > 0) {
    const storedLegNumbers = new Set(steelLegEntries.map((entry) => entry.legNumber));
    return playedHardLegNumbers.some((legNumber) => !storedLegNumbers.has(legNumber));
  }
  return match.dart_mode !== "soft" && steelLegEntries.length === 0;
}

function readLegUserStatEntries(details: unknown, legRules: MatchLegRule[] = []): PersonalStatEntry[] {
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];
  const legResults = (details as { legResults?: unknown }).legResults;
  if (!Array.isArray(legResults)) return [];

  return legResults.flatMap((legResult) => {
    if (!legResult || typeof legResult !== "object" || Array.isArray(legResult)) return [];
    const dartMode: MatchDartMode = (legResult as { dartMode?: unknown }).dartMode === "soft" ? "soft" : "steel";
    const gameVariant = (legResult as { gameVariant?: unknown }).gameVariant;
    const legNumber = Number((legResult as { legNumber?: unknown }).legNumber);
    const rawParticipantMode = (legResult as { participantMode?: unknown }).participantMode;
    const participantMode: PersonalStatSourceMode =
      rawParticipantMode === "singles" || rawParticipantMode === "doubles" || rawParticipantMode === "team"
        ? rawParticipantMode
        : legRules.find((rule) => rule.legNumber === legNumber)?.participantMode || null;
    const userStats = (legResult as { userStats?: unknown }).userStats;
    if (!userStats || typeof userStats !== "object" || Array.isArray(userStats)) return [];
    return Object.entries(userStats as Record<string, Record<string, unknown>>).map(([userId, stats]) => ({
      userId,
      dartMode,
      gameVariant: typeof gameVariant === "string" || typeof gameVariant === "number" ? gameVariant : null,
      stats,
      legNumber: Number.isFinite(legNumber) ? legNumber : undefined,
      participantMode,
      isLegLevel: true
    }));
  });
}

function getPersonalStatSourceBadge(mode: PersonalStatSourceMode) {
  return mode === "doubles" ? "双人" : null;
}

function readMatchUserStats(details: unknown) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};
  const userStats = (details as { userStats?: unknown }).userStats;
  if (!userStats || typeof userStats !== "object" || Array.isArray(userStats)) return {};
  return userStats as Record<string, Record<string, unknown>>;
}

function statNumber(stats: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = stats[key];
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

function RankMetric({
  label,
  value,
  strong = false,
  compact = false
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg text-center shadow-sm",
        compact ? "px-1 py-1.5" : "px-1.5 py-2",
        strong ? "bg-board text-white" : "bg-surface"
      )}
    >
      <div className={cn("whitespace-nowrap font-black", compact ? "text-[9px]" : "text-[10px]", strong ? "text-white/75" : "text-muted")}>
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-black leading-none">{value}</div>
    </div>
  );
}

type StandingPodiumRow = {
  row: StandingRow;
  rank: number;
  name: string;
  avatarUrl: string | null;
  level: number;
  points: number;
  members: Array<{ userId: string; name: string }>;
};

function StandingPodium({ rows }: { rows: StandingPodiumRow[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {rows.map((item) => (
        <article
          key={item.row.participantId}
          className={cn(
            "codl-podium-card relative overflow-hidden rounded-lg border p-3 shadow-soft",
            getPodiumTone(item.rank, "card"),
            item.rank === 1 && "sm:-mt-2 sm:pb-5"
          )}
        >
          <div className="codl-podium-shine" aria-hidden />
          <div className="relative flex items-start justify-between gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-black", getPodiumTone(item.rank, "badge"))}>
              TOP {item.rank}
            </span>
            <Trophy className={cn("h-5 w-5", getPodiumTone(item.rank, "icon"))} aria-hidden />
          </div>
          <div className="relative mt-3 flex items-center gap-3">
            <PlayerAvatar
              name={item.name}
              avatarUrl={item.avatarUrl}
              level={item.level}
              size={item.rank === 1 ? "xl" : "lg"}
              className={cn("codl-podium-avatar", getPodiumTone(item.rank, "avatar"))}
            />
            <div className="min-w-0">
              <div className="truncate text-base font-black text-ink">{item.name}</div>
              <div className="mt-1 text-xs font-bold text-muted">
                {item.row.played} 场 · {item.row.wins} 胜 · 等级 {item.level}
              </div>
              {item.members.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.members.slice(0, 4).map((member) => (
                    <span
                      key={member.userId}
                      className="max-w-full truncate rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-black text-muted ring-1 ring-wire/70"
                    >
                      {member.name}
                    </span>
                  ))}
                  {item.members.length > 4 ? (
                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-black text-muted ring-1 ring-wire/70">
                      +{item.members.length - 4}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="relative mt-3 grid grid-cols-3 gap-1 text-center">
            <RankMetric label="积分" value={item.points} strong />
            <RankMetric label="Leg" value={item.row.legDiff > 0 ? `+${item.row.legDiff}` : item.row.legDiff} />
            <RankMetric label="胜率" value={item.row.played > 0 ? `${Math.round((item.row.wins / item.row.played) * 100)}%` : "-"} />
          </div>
        </article>
      ))}
    </div>
  );
}

function LeaderboardSection({
  title,
  description,
  lists
}: {
  title: string;
  description: string;
  lists: Array<{
    title: string;
    rows: PersonalLeaderboardRow[];
    metric: (row: PersonalLeaderboardRow) => string;
    sourceBadge?: (row: PersonalLeaderboardRow) => string | null;
    emptyText: string;
  }>;
}) {
  return (
    <section className="rounded-lg border border-wire bg-field/75 p-3 sm:p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-base font-black text-ink">{title}</h3>
          <p className="mt-1 text-xs font-semibold text-muted">{description}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {lists.map((list) => (
          <PersonalLeaderboardList
            key={list.title}
            title={list.title}
            rows={list.rows}
            metric={list.metric}
            sourceBadge={list.sourceBadge}
            emptyText={list.emptyText}
          />
        ))}
      </div>
    </section>
  );
}

function PersonalLeaderboardList({
  title,
  rows,
  metric,
  sourceBadge,
  emptyText
}: {
  title: string;
  rows: PersonalLeaderboardRow[];
  metric: (row: PersonalLeaderboardRow) => string;
  sourceBadge?: (row: PersonalLeaderboardRow) => string | null;
  emptyText: string;
}) {
  const topRows = rows.slice(0, 3);
  const restRows = rows.slice(3);

  return (
    <section className="rounded-lg border border-wire bg-surface p-3">
      <h3 className="text-sm font-black text-board">{title}</h3>
      {topRows.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {topRows.map((row, index) => (
            <PersonalPodiumCard
              key={row.userId}
              row={row}
              rank={index + 1}
              metric={metric(row)}
              sourceBadge={sourceBadge?.(row) || null}
            />
          ))}
        </div>
      ) : null}
      <div className="mt-3 grid gap-2">
        {restRows.map((row, index) => (
          <div key={row.userId} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-field/70 p-2">
            <div className={cn(
              "grid h-8 w-8 place-items-center rounded-lg text-xs font-black",
              "bg-surface text-board"
            )}>
              {index + 4}
            </div>
            <PlayerIdentity
              name={row.name}
              avatarUrl={row.avatarUrl}
              subtitle={row.teamName || undefined}
              size="sm"
              compact
            />
            <PersonalMetric value={metric(row)} sourceBadge={sourceBadge?.(row) || null} />
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm font-semibold text-muted">{emptyText}</p> : null}
      </div>
    </section>
  );
}

function PersonalPodiumCard({
  row,
  rank,
  metric,
  sourceBadge
}: {
  row: PersonalLeaderboardRow;
  rank: number;
  metric: string;
  sourceBadge: string | null;
}) {
  return (
    <article className={cn("codl-podium-card relative overflow-hidden rounded-lg border p-3", getPodiumTone(rank, "card"))}>
      <div className="codl-podium-shine" aria-hidden />
      <div className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <PlayerAvatar
          name={row.name}
          avatarUrl={row.avatarUrl}
          size={rank === 1 ? "lg" : "md"}
          className={cn("codl-podium-avatar", getPodiumTone(rank, "avatar"))}
        />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black", getPodiumTone(rank, "badge"))}>
              TOP {rank}
            </span>
            <span className="truncate text-sm font-black text-ink">{row.name}</span>
          </div>
          {row.teamName ? <div className="mt-1 truncate text-xs font-semibold text-muted">{row.teamName}</div> : null}
        </div>
        <PersonalMetric value={metric} sourceBadge={sourceBadge} podium />
      </div>
    </article>
  );
}

function PersonalMetric({
  value,
  sourceBadge,
  podium = false
}: {
  value: string;
  sourceBadge: string | null;
  podium?: boolean;
}) {
  return (
    <div className={cn(
      "flex shrink-0 items-center justify-end gap-1 rounded-lg px-2 py-1 text-right font-black text-board",
      podium ? "bg-white/80 text-xl shadow-sm" : "bg-board/10 text-lg"
    )}>
      <span>{value}</span>
      {sourceBadge ? (
        <span className="whitespace-nowrap rounded bg-board px-1 py-0.5 text-[9px] font-black leading-none text-white">
          {sourceBadge}
        </span>
      ) : null}
    </div>
  );
}

function getPodiumTone(rank: number, part: "card" | "badge" | "rank" | "icon" | "avatar" | "list") {
  if (rank === 1) {
    if (part === "card") return "border-amber-300 bg-gradient-to-br from-amber-50 via-white to-sky-50";
    if (part === "badge" || part === "rank") return "bg-amber-400 text-slate-950";
    if (part === "icon") return "text-amber-500";
    if (part === "avatar") return "border-amber-300 ring-amber-300";
    return "border-amber-200 bg-amber-50/75";
  }
  if (rank === 2) {
    if (part === "card") return "border-slate-300 bg-gradient-to-br from-slate-100 via-white to-sky-50";
    if (part === "badge" || part === "rank") return "bg-slate-300 text-slate-950";
    if (part === "icon") return "text-slate-500";
    if (part === "avatar") return "border-slate-300 ring-slate-300";
    return "border-slate-200 bg-slate-50";
  }
  if (rank === 3) {
    if (part === "card") return "border-orange-300 bg-gradient-to-br from-orange-50 via-white to-sky-50";
    if (part === "badge" || part === "rank") return "bg-orange-300 text-slate-950";
    if (part === "icon") return "text-orange-500";
    if (part === "avatar") return "border-orange-300 ring-orange-300";
    return "border-orange-200 bg-orange-50/80";
  }
  if (part === "rank") return "bg-surface text-board";
  return "border-wire bg-field/75";
}

function DartModeBadge({ dartMode }: { dartMode?: string | null }) {
  const isSoft = dartMode === "soft";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black",
        isSoft ? "bg-sky-100 text-board ring-1 ring-sky-200" : "bg-zinc-900 text-white"
      )}
    >
      {getDartModeLabel(dartMode)}
    </span>
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

function toBoardView(board: TournamentBoard): BoardReservationBoard {
  return {
    id: board.id,
    name: board.name,
    availableStartAt: board.available_start_at,
    availableEndAt: board.available_end_at,
    status: board.status
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

function TournamentInfoDetails({
  tournament,
  participantCount
}: {
  tournament: Tournament;
  participantCount: number;
}) {
  return (
    <Card className="p-0 sm:p-0">
      <details className="codl-mobile-fold group">
        <summary className="flex min-h-14 cursor-pointer touch-manipulation items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-black">赛事信息</h2>
            <p className="mt-1 truncate text-xs font-semibold text-muted">
              {getTournamentFormatLabel(tournament.format)} · {getDartModeLabel(tournament.dart_mode)} · {tournament.location || "地点待定"}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-field px-3 py-1 text-xs font-black text-board group-open:hidden">
            展开
          </span>
          <span className="hidden shrink-0 rounded-full bg-board px-3 py-1 text-xs font-black text-white group-open:inline-flex">
            收起
          </span>
        </summary>
        <div className="border-t border-wire px-4 pb-4 sm:px-5 sm:pb-5">
          <dl className="mt-4 grid gap-3 text-sm md:grid-cols-4">
            <Info label="地点" value={tournament.location || "待定"} />
            <Info label="比赛开始" value={formatDateTime(tournament.tournament_start_at)} />
            <Info label="赛制" value={getTournamentFormatLabel(tournament.format)} />
            <Info label="参赛" value={`${participantCount}/${tournament.max_participants}`} />
            <Info label="类型" value={`${tournament.tournament_type} / 每队 ${tournament.team_size} 人`} />
            <Info label="镖种" value={getDartModeLabel(tournament.dart_mode)} />
            <Info label="硬镖" value={`${tournament.dart_game} / BO${tournament.best_of}`} />
            <Info label="软镖" value={getGameVariantLabel({ dartMode: "soft", gameVariant: tournament.soft_game })} />
            <Info label="报名开始" value={formatDateTime(tournament.registration_start_at)} />
            <Info label="报名截止" value={formatDateTime(tournament.registration_end_at)} />
          </dl>
        </div>
      </details>
    </Card>
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
