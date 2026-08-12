import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Clock3,
  Gauge,
  IdCard,
  MapPin,
  Monitor,
  ShieldCheck,
  Trophy
} from "lucide-react";
import { SetupNotice } from "@/components/SetupNotice";
import { TournamentCard } from "@/components/TournamentCard";
import {
  BoardReservationPanel,
  MatchBoardReservationBadge,
  type BoardReservationBoard,
  type BoardReservationRow,
  type BoardReservationSlot
} from "@/components/tournament/BoardReservationPanel";
import { Card } from "@/components/ui/Card";
import { PlayerIdentity } from "@/components/ui/PlayerIdentity";
import { getCurrentUserAndProfile } from "@/lib/auth/guards";
import { getCompactMatchRulesSummary, getDartModeLabel } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { getMatchStatusLabel, isUnplayedMatch } from "@/lib/matches/status";
import { formatUserDisplayName, isOpaqueIdentifier } from "@/lib/scorer/display-names";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { defaultSiteTheme } from "@/lib/theme";
import { cn, formatDateTime } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import type {
  MatchBoardReservation,
  MatchDartMode,
  MatchSummary,
  Tournament,
  TournamentBoard,
  TournamentBoardTimeSlot
} from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { user, profile } = await getCurrentUserAndProfile();
  const platformName = defaultSiteTheme.platformName;

  if (!hasSupabaseEnv()) {
    return (
      <div className="grid gap-5">
        <SetupNotice />
        <Hero platformName={platformName} isAdmin={profile?.role === "admin"} />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*")
    .in("status", ["registration_open", "in_progress"])
    .order("tournament_start_at", { ascending: true })
    .limit(6);

  const weeklySchedule = user ? await loadWeeklySchedule(supabase, user.id, profile?.role === "admin") : null;

  const activeTournaments = tournaments || [];
  const needsRealName = Boolean(user && (!profile?.real_name || !profile?.id_card_number));

  return (
    <div className="grid gap-5">
      <WeeklySchedulePanel schedule={weeklySchedule} isSignedIn={Boolean(user)} />

      {needsRealName ? <RealNamePrompt /> : null}

      <Hero platformName={platformName} isAdmin={profile?.role === "admin"} />

      <section className="grid gap-3 md:grid-cols-3">
        <MiniMetric label="用户" value={profile?.display_name || "访客"} />
        <MiniMetric label="报名中" value={activeTournaments.filter((item) => item.status === "registration_open").length} />
        <MiniMetric label="进行中" value={activeTournaments.filter((item) => item.status === "in_progress").length} />
      </section>

      <section className="grid gap-3">
        <div className="grid gap-3">
          <SectionTitle title="赛事" href="/tournaments" />
          <div className="grid gap-3 md:grid-cols-2">
            {activeTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament as Tournament} />
            ))}
            {activeTournaments.length === 0 ? (
              <Card>
                <p className="text-sm text-muted">暂无开放赛事。</p>
              </Card>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type HomeParticipantRow = {
  id: string;
  tournament_id: string;
  display_name: string;
  user_id: string | null;
  team_id: string | null;
  participant_type: "user" | "team";
};

type HomeTeamMemberRow = {
  team_id: string;
  user_id: string;
  role?: string | null;
};

type HomeTeamRow = {
  id: string;
  avatar_url?: string | null;
  captain_user_id?: string | null;
};

type HomeProfileRow = {
  id: string;
  uid?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type HomeMatchRow = MatchSummary & {
  tournament_id: string;
  stage: "group" | "knockout";
  round_number: number;
  match_number: number;
  scheduled_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type WeeklyScheduleMatch = {
  match: HomeMatchRow;
  tournament: Tournament;
  dartMode: MatchDartMode;
  participantAName: string;
  participantBName: string;
  participantAAvatarUrl: string | null;
  participantBAvatarUrl: string | null;
  participantAIsMine: boolean;
  participantBIsMine: boolean;
  currentReservation: BoardReservationRow | null;
  currentBoard: BoardReservationBoard | null;
  boardRows: BoardReservationBoard[];
  reservationRows: BoardReservationRow[];
  canReserve: boolean;
  isOverdue: boolean;
};

type WeeklyScheduleData = {
  weekLabel: string;
  items: WeeklyScheduleMatch[];
  nextWeekLabel: string;
  nextWeekItems: WeeklyScheduleMatch[];
  overdueCount: number;
};

async function loadWeeklySchedule(
  supabase: SupabaseServerClient,
  userId: string,
  isAdmin: boolean
): Promise<WeeklyScheduleData> {
  const now = new Date();
  const weekStart = startOfLocalWeek(now);
  const weekEnd = addLocalDays(weekStart, 7);
  const nextWeekEnd = addLocalDays(weekEnd, 7);
  const emptySchedule = (): WeeklyScheduleData => ({
    weekLabel: formatWeekRange(weekStart, weekEnd),
    items: [],
    nextWeekLabel: formatWeekRange(weekEnd, nextWeekEnd),
    nextWeekItems: [],
    overdueCount: 0
  });
  const visibleMatchStatuses = ["not_started", "in_progress", "pending_confirmation", "disputed", "completed"];

  const { data: teamMemberships } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);
  const teamIds = [...new Set((teamMemberships || []).map((item) => item.team_id).filter(Boolean))] as string[];

  const [{ data: directParticipants }, teamParticipantsResult] = await Promise.all([
    supabase
      .from("tournament_participants")
      .select("id, tournament_id, display_name, user_id, team_id, participant_type")
      .eq("user_id", userId)
      .eq("status", "active"),
    teamIds.length > 0
      ? supabase
          .from("tournament_participants")
          .select("id, tournament_id, display_name, user_id, team_id, participant_type")
          .in("team_id", teamIds)
          .eq("status", "active")
      : Promise.resolve({ data: [] })
  ]);

  const myParticipants = uniqueById([...(directParticipants || []), ...((teamParticipantsResult.data || []) as HomeParticipantRow[])]) as HomeParticipantRow[];
  const myParticipantIds = myParticipants.map((participant) => participant.id);

  if (myParticipantIds.length === 0) {
    return emptySchedule();
  }

  const [matchesAsA, matchesAsB] = await Promise.all([
    supabase
      .from("matches")
      .select("*")
      .in("participant_a_id", myParticipantIds)
      .in("status", visibleMatchStatuses)
      .order("round_number")
      .order("match_number"),
    supabase
      .from("matches")
      .select("*")
      .in("participant_b_id", myParticipantIds)
      .in("status", visibleMatchStatuses)
      .order("round_number")
      .order("match_number")
  ]);

  const matchRows = uniqueById([...(matchesAsA.data || []), ...(matchesAsB.data || [])]) as HomeMatchRow[];
  const tournamentIds = [...new Set(matchRows.map((match) => match.tournament_id).filter(Boolean))] as string[];
  const allParticipantIds = [
    ...new Set(matchRows.flatMap((match) => [match.participant_a_id, match.participant_b_id]).filter(Boolean))
  ] as string[];

  if (tournamentIds.length === 0 || allParticipantIds.length === 0) {
    return emptySchedule();
  }

  const [
    { data: tournamentRows },
    { data: allParticipants },
    { data: boards },
    { data: boardSlots },
    { data: reservations }
  ] = await Promise.all([
    supabase.from("tournaments").select("*").in("id", tournamentIds),
    supabase
      .from("tournament_participants")
      .select("id, tournament_id, display_name, user_id, team_id, participant_type")
      .in("id", allParticipantIds),
    supabase.from("tournament_boards").select("*").in("tournament_id", tournamentIds).order("available_start_at"),
    supabase.from("tournament_board_time_slots").select("*").in("tournament_id", tournamentIds).order("daily_start_time"),
    supabase
      .from("match_board_reservations")
      .select("*")
      .in("tournament_id", tournamentIds)
      .eq("status", "active")
      .order("reserved_start_at")
  ]);

  const activeTournaments = ((tournamentRows || []) as Tournament[]).filter((tournament) =>
    ["registration_open", "in_progress"].includes(tournament.status)
  );
  const tournamentById = new Map(activeTournaments.map((tournament) => [tournament.id, tournament]));
  const participantRows = (allParticipants || []) as HomeParticipantRow[];
  const participantRowById = new Map(participantRows.map((participant) => [participant.id, participant]));
  const allTeamIds = [...new Set(participantRows.map((participant) => participant.team_id).filter(Boolean))] as string[];
  const allUserIds = [...new Set(participantRows.map((participant) => participant.user_id).filter(Boolean))] as string[];

  const [{ data: teamMembers }, { data: participantTeams }] = await Promise.all([
    allTeamIds.length > 0
      ? supabase.from("team_members").select("team_id, user_id, role").in("team_id", allTeamIds)
      : Promise.resolve({ data: [] }),
    allTeamIds.length > 0
      ? supabase.from("teams").select("id, avatar_url, captain_user_id").in("id", allTeamIds)
      : Promise.resolve({ data: [] })
  ]);
  const memberRows = (teamMembers || []) as HomeTeamMemberRow[];
  const profileIds = [...new Set([...allUserIds, ...memberRows.map((member) => member.user_id)])];
  const profileRows = await fetchHomeProfiles(supabase, profileIds);
  const profileById = new Map(profileRows.map((profile) => [profile.id, profile]));
  const teamById = new Map(((participantTeams || []) as HomeTeamRow[]).map((team) => [team.id, team]));
  const teamMembersByTeamId = new Map<string, Array<{ userId: string; name: string; avatarUrl?: string | null }>>();

  for (const member of memberRows) {
    const list = teamMembersByTeamId.get(member.team_id) || [];
    const profile = profileById.get(member.user_id);
    list.push({
      userId: member.user_id,
      name: formatUserDisplayName({
        userId: member.user_id,
        displayName: profile?.display_name,
        uid: profile?.uid
      }),
      avatarUrl: profile?.avatar_url || null
    });
    teamMembersByTeamId.set(member.team_id, list);
  }

  const participantMembersById = new Map<string, Array<{ userId: string; name: string; avatarUrl?: string | null }>>();
  const participantAvatarById = new Map<string, string | null>();
  const participantDisplayNameById = new Map<string, string>();

  for (const participant of participantRows) {
    if (participant.participant_type === "user" && participant.user_id) {
      const profile = profileById.get(participant.user_id);
      const name = formatUserDisplayName({
        userId: participant.user_id,
        displayName: profile?.display_name,
        uid: profile?.uid,
        fallback: participant.display_name,
        includeUid: false
      });
      participantMembersById.set(participant.id, [{ userId: participant.user_id, name, avatarUrl: profile?.avatar_url || null }]);
      participantAvatarById.set(participant.id, profile?.avatar_url || null);
      participantDisplayNameById.set(participant.id, participant.display_name && !isOpaqueIdentifier(participant.display_name) ? participant.display_name : name);
      continue;
    }

    const members = participant.team_id ? teamMembersByTeamId.get(participant.team_id) || [] : [];
    const firstMemberAvatar = members.map((member) => member.avatarUrl || null).find(Boolean) || null;
    const teamAvatar = participant.team_id ? teamById.get(participant.team_id)?.avatar_url || null : null;
    const memberNames = members.map((member) => member.name).filter(Boolean).join(" / ");
    participantMembersById.set(participant.id, members);
    participantAvatarById.set(participant.id, teamAvatar || firstMemberAvatar || null);
    participantDisplayNameById.set(
      participant.id,
      participant.display_name && !isOpaqueIdentifier(participant.display_name)
        ? participant.display_name
        : memberNames || participant.display_name || "TBD"
    );
  }

  const boardSlotRows = (boardSlots || []) as TournamentBoardTimeSlot[];
  const slotsByBoardId = groupBoardSlots(boardSlotRows);
  const boardRows = ((boards || []) as TournamentBoard[]).map((board) => toBoardView(board, slotsByBoardId.get(board.id)));
  const boardRowsByTournamentId = new Map<string, BoardReservationBoard[]>();
  for (const board of boardRows) {
    const source = (boards || []).find((item) => item.id === board.id) as TournamentBoard | undefined;
    if (!source) continue;
    const list = boardRowsByTournamentId.get(source.tournament_id) || [];
    list.push(board);
    boardRowsByTournamentId.set(source.tournament_id, list);
  }
  const reservationSourceRows = (reservations || []) as MatchBoardReservation[];
  const reservationRows = reservationSourceRows.map(toReservationView);
  const reservationsByTournamentId = new Map<string, BoardReservationRow[]>();
  for (const reservation of reservationSourceRows) {
    const list = reservationsByTournamentId.get(reservation.tournament_id) || [];
    list.push(toReservationView(reservation));
    reservationsByTournamentId.set(reservation.tournament_id, list);
  }
  const boardById = new Map(boardRows.map((board) => [board.id, board]));
  const reservationByMatchId = new Map(reservationRows.map((reservation) => [reservation.matchId, reservation]));
  const selectedIds = new Set<string>();
  const items: WeeklyScheduleMatch[] = [];
  const nextWeekSelectedIds = new Set<string>();
  const nextWeekItems: WeeklyScheduleMatch[] = [];
  const sortedMatches = matchRows
    .filter((match) => tournamentById.has(match.tournament_id) && (isUnplayedMatch(match.status) || match.status === "completed"))
    .sort(compareHomeMatches);

  const buildScheduleItem = (match: HomeMatchRow, isOverdue: boolean): WeeklyScheduleMatch | null => {
    const tournament = tournamentById.get(match.tournament_id);
    if (!tournament) return null;
    const currentReservation = reservationByMatchId.get(match.id) || null;
    const tournamentBoards = boardRowsByTournamentId.get(match.tournament_id) || [];
    const tournamentReservations = reservationsByTournamentId.get(match.tournament_id) || [];
    const participantAIsMine = myParticipantIds.includes(match.participant_a_id || "");
    const participantBIsMine = myParticipantIds.includes(match.participant_b_id || "");
    const currentBoard = currentReservation ? boardById.get(currentReservation.boardId) || null : null;

    return {
      match,
      tournament,
      dartMode: match.dart_mode === "soft" ? "soft" : "steel",
      participantAName: getParticipantDisplayName(participantDisplayNameById, participantRowById, match.participant_a_id),
      participantBName: getParticipantDisplayName(participantDisplayNameById, participantRowById, match.participant_b_id),
      participantAAvatarUrl: match.participant_a_id ? participantAvatarById.get(match.participant_a_id) || null : null,
      participantBAvatarUrl: match.participant_b_id ? participantAvatarById.get(match.participant_b_id) || null : null,
      participantAIsMine,
      participantBIsMine,
      currentReservation,
      currentBoard,
      boardRows: tournamentBoards,
      reservationRows: tournamentReservations,
      canReserve: isUnplayedMatch(match.status) && Boolean(isAdmin || participantAIsMine || participantBIsMine),
      isOverdue
    };
  };

  const addItem = (match: HomeMatchRow, isOverdue: boolean) => {
    if (selectedIds.has(match.id)) return;
    const item = buildScheduleItem(match, isOverdue);
    if (!item) return;
    items.push(item);
    selectedIds.add(match.id);
  };

  const addNextWeekItem = (match: HomeMatchRow) => {
    if (selectedIds.has(match.id) || nextWeekSelectedIds.has(match.id)) return;
    const item = buildScheduleItem(match, false);
    if (!item) return;
    nextWeekItems.push(item);
    nextWeekSelectedIds.add(match.id);
  };

  for (const match of sortedMatches) {
    const tournament = tournamentById.get(match.tournament_id);
    if (!tournament) continue;
    const currentReservation = reservationByMatchId.get(match.id) || null;
    const matchTime = getMatchScheduleTime(match, currentReservation);
    const scheduledThisWeek = Boolean(matchTime && matchTime >= weekStart && matchTime < weekEnd);
    const completedTime = match.status === "completed" ? getMatchCompletionTime(match, currentReservation) : null;
    const completedThisWeek = Boolean(completedTime && completedTime >= weekStart && completedTime < weekEnd);
    const overdue = isUnplayedMatch(match.status) && isMatchOverdue(match, tournament, currentReservation, weekStart);
    if (overdue || scheduledThisWeek || completedThisWeek) {
      addItem(match, overdue);
    }
  }

  const selectedCurrentWeekModeKeys = new Set(
    items
      .filter((item) => !item.isOverdue)
      .map((item) => `${item.match.tournament_id}:${item.dartMode}`)
  );

  for (const tournament of activeTournaments) {
    for (const dartMode of ["soft", "steel"] as MatchDartMode[]) {
      const key = `${tournament.id}:${dartMode}`;
      if (selectedCurrentWeekModeKeys.has(key)) continue;
      const nextMatch = sortedMatches.find(
        (match) =>
          match.tournament_id === tournament.id &&
          (match.dart_mode === "soft" ? "soft" : "steel") === dartMode &&
          isUnplayedMatch(match.status) &&
          !selectedIds.has(match.id) &&
          !isMatchOverdue(match, tournament, reservationByMatchId.get(match.id) || null, weekStart)
      );
      if (nextMatch) {
        addItem(nextMatch, false);
        selectedCurrentWeekModeKeys.add(key);
      }
    }
  }

  const selectedNextWeekModeKeys = new Set<string>();
  for (const tournament of activeTournaments) {
    for (const dartMode of ["soft", "steel"] as MatchDartMode[]) {
      const key = `${tournament.id}:${dartMode}`;
      if (selectedNextWeekModeKeys.has(key)) continue;
      const nextMatch = sortedMatches.find(
        (match) =>
          match.tournament_id === tournament.id &&
          (match.dart_mode === "soft" ? "soft" : "steel") === dartMode &&
          isUnplayedMatch(match.status) &&
          !selectedIds.has(match.id) &&
          !isMatchOverdue(match, tournament, reservationByMatchId.get(match.id) || null, weekStart)
      );
      if (nextMatch) {
        addNextWeekItem(nextMatch);
        selectedNextWeekModeKeys.add(key);
      }
    }
  }

  items.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    const aTime = getMatchScheduleTime(a.match, a.currentReservation)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = getMatchScheduleTime(b.match, b.currentReservation)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime || compareHomeMatches(a.match, b.match);
  });
  nextWeekItems.sort((a, b) => compareHomeMatches(a.match, b.match));

  return {
    weekLabel: formatWeekRange(weekStart, weekEnd),
    items,
    nextWeekLabel: formatWeekRange(weekEnd, nextWeekEnd),
    nextWeekItems,
    overdueCount: items.filter((item) => item.isOverdue).length
  };
}

async function fetchHomeProfiles(supabase: SupabaseServerClient, profileIds: string[]) {
  if (profileIds.length === 0) return [] as HomeProfileRow[];

  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.from("profiles").select("id, uid, display_name, avatar_url").in("id", profileIds);
    return (data || []) as HomeProfileRow[];
  } catch {
    const { data } = await supabase.from("profiles").select("id, uid, display_name, avatar_url").in("id", profileIds);
    return (data || []) as HomeProfileRow[];
  }
}

function WeeklySchedulePanel({
  schedule,
  isSignedIn
}: {
  schedule: WeeklyScheduleData | null;
  isSignedIn: boolean;
}) {
  return (
    <Card className="border-board/20 bg-gradient-to-b from-sky-50 to-surface">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase text-board">
            <Clock3 className="h-4 w-4" aria-hidden />
            Weekly Matches
          </div>
          <h2 className="mt-1 text-xl font-black">本周赛程</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-muted">
            {schedule ? `${schedule.weekLabel} · 本周默认安排一软一硬，未完成补赛会标黄保留。` : "登录后自动显示你本周要处理的比赛。"}
          </p>
        </div>
        {schedule?.overdueCount ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">
            {schedule.overdueCount} 场补赛
          </span>
        ) : null}
      </div>

      {!isSignedIn ? (
        <Link
          href="/auth/login"
          className="mt-4 inline-flex min-h-11 touch-manipulation items-center justify-center rounded-lg bg-board px-4 text-sm font-black text-white"
        >
          登录查看本周赛程
        </Link>
      ) : schedule && schedule.items.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {schedule.items.map((item) => (
            <WeeklyScheduleMatchCard key={item.match.id} item={item} />
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-surface p-3 text-sm font-semibold text-muted">
          本周暂无待处理比赛。可以先去赛事页查看完整排名和历史赛程。
        </p>
      )}

      {isSignedIn && schedule && schedule.nextWeekItems.length > 0 ? (
        <NextWeekOpponentPanel schedule={schedule} />
      ) : null}
    </Card>
  );
}

function WeeklyScheduleMatchCard({ item }: { item: WeeklyScheduleMatch }) {
  const scheduledTime = getMatchScheduleTime(item.match, item.currentReservation);
  const completedTime = item.match.status === "completed" ? getMatchCompletionTime(item.match, item.currentReservation) : null;
  const isCompleted = item.match.status === "completed";
  const winnerName = getMatchWinnerName(item);

  return (
    <article
      className={cn(
        "grid min-w-0 gap-3 rounded-lg border p-3 shadow-[0_12px_28px_rgb(17_24_39/0.05)]",
        isCompleted ? "border-emerald-200 bg-emerald-50/70" : item.isOverdue ? "border-amber-300 bg-amber-50" : "border-wire bg-surface"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <DartModeBadge dartMode={item.dartMode} />
        {item.isOverdue ? (
          <span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-black text-amber-900">补赛</span>
        ) : null}
        <span className="rounded-full bg-field px-2.5 py-1 text-xs font-black text-muted">
          {getMatchStatusLabel(item.match.status)}
        </span>
        {isCompleted ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">本周赛果</span>
        ) : null}
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-black text-board">{item.tournament.name}</div>
        <div className="mt-1 text-base font-black">
          第 {item.match.round_number} 轮 · 第 {item.match.match_number} 场
        </div>
        <div className="mt-1 text-xs font-bold text-muted">
          {getCompactMatchRulesSummary({
            dartMode: item.dartMode,
            gameVariant: item.match.game_variant,
            legRules: item.match.leg_rules
          })}
        </div>
      </div>

      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <PlayerIdentity
          className={cn("rounded-lg bg-field p-2", item.participantAIsMine && "bg-board/10 ring-1 ring-board/25")}
          name={item.participantAName}
          avatarUrl={item.participantAAvatarUrl}
          subtitle={`比分 ${item.match.score_a}`}
          size="sm"
          compact
        />
        <PlayerIdentity
          className={cn("rounded-lg bg-field p-2", item.participantBIsMine && "bg-board/10 ring-1 ring-board/25")}
          name={item.participantBName}
          avatarUrl={item.participantBAvatarUrl}
          subtitle={`比分 ${item.match.score_b}`}
          size="sm"
          compact
        />
      </div>

      {isCompleted ? (
        <div className="rounded-lg border border-emerald-200 bg-white/80 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-black uppercase text-emerald-700">Result</span>
            {completedTime ? (
              <span className="text-xs font-bold text-muted">{formatDateTime(completedTime.toISOString())}</span>
            ) : null}
          </div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div className="text-2xl font-black text-primary">
              {item.match.score_a}:{item.match.score_b}
            </div>
            <div className="min-w-0 text-right text-sm font-black text-emerald-800">
              胜方 {winnerName}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-muted">
        {item.currentReservation || !isCompleted ? (
          <MatchBoardReservationBadge reservation={item.currentReservation} board={item.currentBoard} />
        ) : null}
        {scheduledTime ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-field px-2 py-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            {formatDateTime(scheduledTime.toISOString())}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link
          href={isCompleted ? `/reports/official/${item.match.id}` : `/scorer/${item.match.id}`}
          className={cn(
            "inline-flex min-h-11 touch-manipulation items-center justify-center rounded-lg px-3 text-sm font-black",
            isCompleted ? "bg-emerald-700 text-white" : "bg-board text-white"
          )}
        >
          {isCompleted ? "查看战报" : "排阵 / 计分"}
        </Link>
        <Link
          href={`/tournaments/${item.tournament.id}?schedule=mine#schedule`}
          className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-lg border border-wire bg-surface px-3 text-sm font-black text-board"
        >
          查看赛程
        </Link>
      </div>

      {!isCompleted && (item.canReserve || item.currentReservation) ? (
        <BoardReservationPanel
          matchId={item.match.id}
          boards={item.boardRows}
          reservations={item.reservationRows}
          currentReservation={item.currentReservation}
          canReserve={item.canReserve}
        />
      ) : null}
    </article>
  );
}

function NextWeekOpponentPanel({ schedule }: { schedule: WeeklyScheduleData }) {
  return (
    <div className="mt-5 border-t border-wire pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-black">下周对手</h3>
          <p className="text-xs font-semibold text-muted">{schedule.nextWeekLabel} · 方便提前约时间和准备布阵。</p>
        </div>
        <Link
          href="/tournaments"
          className="inline-flex min-h-9 touch-manipulation items-center justify-center rounded-lg border border-wire bg-surface px-3 text-xs font-black text-board"
        >
          查看赛事
        </Link>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {schedule.nextWeekItems.map((item) => (
          <NextWeekOpponentCard key={item.match.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function NextWeekOpponentCard({ item }: { item: WeeklyScheduleMatch }) {
  const opponent = getOpponentIdentity(item);

  return (
    <Link
      href={`/tournaments/${item.tournament.id}?schedule=mine#schedule`}
      className="grid min-w-0 gap-2 rounded-lg border border-wire bg-white/80 p-3 text-primary shadow-[0_10px_24px_rgb(17_24_39/0.04)] active:bg-field"
    >
      <div className="flex items-center justify-between gap-2">
        <DartModeBadge dartMode={item.dartMode} />
        <span className="text-xs font-black text-muted">第 {item.match.round_number} 轮</span>
      </div>
      <PlayerIdentity
        className="min-w-0"
        name={opponent.name}
        avatarUrl={opponent.avatarUrl}
        subtitle={`${item.tournament.name} · 第 ${item.match.match_number} 场`}
        size="sm"
        compact
      />
    </Link>
  );
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

function uniqueById<T extends { id: string }>(items: T[]) {
  const map = new Map<string, T>();
  for (const item of items) map.set(item.id, item);
  return [...map.values()];
}

function compareHomeMatches(a: HomeMatchRow, b: HomeMatchRow) {
  return (
    a.round_number - b.round_number ||
    a.match_number - b.match_number ||
    a.id.localeCompare(b.id)
  );
}

function getParticipantDisplayName(
  displayNameById: Map<string, string>,
  participantById: Map<string, HomeParticipantRow>,
  participantId?: string | null
) {
  if (!participantId) return "TBD";
  return displayNameById.get(participantId) || participantById.get(participantId)?.display_name || "TBD";
}

function getMatchScheduleTime(match: HomeMatchRow, reservation?: BoardReservationRow | null) {
  const value = reservation?.reservedStartAt || match.scheduled_at || null;
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getMatchCompletionTime(match: HomeMatchRow, reservation?: BoardReservationRow | null) {
  const value = match.updated_at || reservation?.reservedStartAt || match.scheduled_at || match.created_at || null;
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getMatchWinnerName(item: WeeklyScheduleMatch) {
  if (item.match.winner_participant_id === item.match.participant_a_id) return item.participantAName;
  if (item.match.winner_participant_id === item.match.participant_b_id) return item.participantBName;
  if (item.match.score_a > item.match.score_b) return item.participantAName;
  if (item.match.score_b > item.match.score_a) return item.participantBName;
  return "未设定";
}

function getOpponentIdentity(item: WeeklyScheduleMatch) {
  if (item.participantAIsMine && !item.participantBIsMine) {
    return {
      name: item.participantBName,
      avatarUrl: item.participantBAvatarUrl
    };
  }
  if (item.participantBIsMine && !item.participantAIsMine) {
    return {
      name: item.participantAName,
      avatarUrl: item.participantAAvatarUrl
    };
  }
  return {
    name: `${item.participantAName} vs ${item.participantBName}`,
    avatarUrl: item.participantAAvatarUrl || item.participantBAvatarUrl
  };
}

function isMatchOverdue(
  match: HomeMatchRow,
  tournament: Tournament,
  reservation: BoardReservationRow | null,
  weekStart: Date
) {
  const scheduledTime = getMatchScheduleTime(match, reservation);
  if (scheduledTime && scheduledTime < weekStart) return true;
  if (!tournament.tournament_start_at) return false;

  const tournamentWeekStart = startOfLocalWeek(new Date(tournament.tournament_start_at));
  if (weekStart <= tournamentWeekStart) return false;
  const expectedRound = Math.floor((weekStart.getTime() - tournamentWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return match.round_number < expectedRound;
}

function startOfLocalWeek(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return date;
}

function addLocalDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function formatWeekRange(weekStart: Date, weekEnd: Date) {
  const formatter = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" });
  return `${formatter.format(weekStart)}-${formatter.format(addLocalDays(weekEnd, -1))}`;
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

function RealNamePrompt() {
  return (
    <section className="relative overflow-hidden rounded-lg border border-board bg-slate-950 p-4 text-white shadow-[0_18px_45px_rgb(8_121_184/0.22)] sm:p-5">
      <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full border-[32px] border-board/30" aria-hidden />
      <div className="relative grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-board text-white">
            <IdCard className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-black sm:text-xl">请完成实名认证</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-white/75">
              赛事报名、现场核验和成绩归档需要真实姓名与身份证号。完成后这条提示会自动消失。
            </p>
          </div>
        </div>
        <Link
          className="inline-flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-black text-primary shadow-sm active:bg-field"
          href="/profile/real-name"
        >
          开始实名
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

function Hero({ platformName, isAdmin }: { platformName: string; isAdmin: boolean }) {
  return (
    <section className="codl-hero relative overflow-hidden rounded-lg border border-wire bg-surface text-ink shadow-[0_24px_70px_rgb(17_24_39/0.10)]">
      <div className="codl-hero-art" aria-hidden />
      <div className="codl-hero-content relative grid min-h-[360px] content-between gap-8 p-5 sm:p-6 lg:p-8">
        <div className="max-w-2xl">
          <div className="codl-page-kicker">
            <span className="codl-rule" aria-hidden />
            Caliburn Office Darts League 2026
            <span className="ml-2 rounded-full border border-board/25 bg-board/10 px-2 py-0.5 text-[11px] text-board">
              {APP_VERSION}
            </span>
          </div>
          <img
            src="/codl/codl-logo-light.png"
            alt={`${platformName} logo`}
            className="codl-hero-logo mt-4 h-auto w-full max-w-[560px] object-contain"
            style={{ height: "auto", maxWidth: "min(560px, 100%)", width: "100%" }}
          />
          <h1 className="sr-only">{platformName}</h1>
          <p className="mt-3 max-w-xl text-base font-bold text-muted sm:text-lg">
            软镖、硬镖、团队联赛、个人数据和现场计分全部集中在一个赛事系统里。
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <HeroAction href="/tournaments" icon={<CalendarDays className="h-5 w-5" />} label="赛事" />
          <HeroAction href="/scorer" icon={<Gauge className="h-5 w-5" />} label="计分" />
          <HeroAction href="/display" icon={<Monitor className="h-5 w-5" />} label="大屏" />
          {isAdmin ? (
            <HeroAction href="/admin" icon={<ShieldCheck className="h-5 w-5" />} label="后台" />
          ) : (
            <HeroAction href="/profile" icon={<BarChart3 className="h-5 w-5" />} label="数据" />
          )}
        </div>
      </div>
    </section>
  );
}

function HeroAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-16 touch-manipulation items-center justify-between gap-3 rounded-lg border border-primary/10 bg-primary px-4 text-sm font-black text-white shadow-[0_14px_30px_rgb(32_32_32/0.12)] transition-colors duration-75 hover:bg-board active:bg-board"
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-wire bg-surface/95 p-4 shadow-[0_14px_34px_rgb(17_24_39/0.05)]">
      <div className="text-xs font-black uppercase text-muted">{label}</div>
      <div className="mt-1 truncate text-2xl font-black">{value}</div>
    </div>
  );
}

function SectionTitle({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-3 text-xl font-black">
        <span className="h-4 w-4 rounded-full bg-board" aria-hidden />
        {title}
      </h2>
      <Link className="inline-flex min-h-11 touch-manipulation items-center gap-1 rounded-lg px-3 text-sm font-black text-board hover:bg-board/10" href={href}>
        全部
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
