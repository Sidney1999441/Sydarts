import { isUnplayedMatch } from "@/lib/matches/status";

const DAY = 86400000;
export function chinaDate(value = new Date()) {
  return new Date(value.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}
export function chinaDay(date: string) {
  return new Date(`${date}T00:00:00+08:00`);
}
export function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY);
}
export function startOfChinaWeek(value: Date) {
  const day = chinaDay(chinaDate(value));
  const weekday = new Date(day.getTime() + 8 * 3600000).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}
type ScheduledMatch = {
  status: string;
  stage: string;
  round_number: number;
  scheduled_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
};
type ScheduleTournament = {
  id?: string;
  dart_mode: string;
  format: string;
  tournament_start_at: string;
};
const HOLIDAY_TOURNAMENT_ID = "eb6e0008-064c-4ae7-97e3-524889a4edf1";
const HOLIDAY_START = chinaDay("2026-09-28");
const HOLIDAY_END = chinaDay("2026-10-12");
const HOLIDAY_LEAGUE_WEEK = 8;

export function isHolidayLeagueBreak(tournamentId: string | undefined, at: Date) {
  return tournamentId === HOLIDAY_TOURNAMENT_ID && at >= HOLIDAY_START && at < HOLIDAY_END;
}

export function expectedLeagueWeek(tournament: ScheduleTournament, at: Date, holidayRoundCompleted = false) {
  const weekStart = startOfChinaWeek(at);
  const start = startOfChinaWeek(new Date(tournament.tournament_start_at));
  const calendarWeek = Math.floor((weekStart.getTime() - start.getTime()) / (7 * DAY)) + 1;
  if (tournament.id !== HOLIDAY_TOURNAMENT_ID || weekStart < HOLIDAY_START) return calendarWeek;
  if (weekStart < HOLIDAY_END) return Math.min(calendarWeek, HOLIDAY_LEAGUE_WEEK);
  return calendarWeek - (holidayRoundCompleted ? 1 : 2);
}

export function hasCompletedHolidayRound(
  matches: Array<{ tournament_id: string; stage: string; round_number: number; status: string;
    participant_a_id: string | null; participant_b_id: string | null }>,
  tournamentId: string,
  participantId: string,
) {
  if (tournamentId !== HOLIDAY_TOURNAMENT_ID) return false;
  return [HOLIDAY_LEAGUE_WEEK * 2 - 1, HOLIDAY_LEAGUE_WEEK * 2].every((roundNumber) => {
    const roundMatches = matches.filter((match) =>
      match.tournament_id === tournamentId && match.stage === "group" && match.round_number === roundNumber
    );
    if (!roundMatches.length) return false;
    const ownMatch = roundMatches.find((match) =>
      match.participant_a_id === participantId || match.participant_b_id === participantId
    );
    return !ownMatch || ownMatch.status === "completed" || ownMatch.status === "bye";
  });
}

export function isHolidayMatchPlayable(
  match: { tournament_id: string; stage: string; round_number: number },
  at: Date,
) {
  if (!isHolidayLeagueBreak(match.tournament_id, at)) return true;
  return match.stage === "group" &&
    (match.round_number === HOLIDAY_LEAGUE_WEEK * 2 - 1 ||
      match.round_number === HOLIDAY_LEAGUE_WEEK * 2);
}
export function leagueWeek(
  match: ScheduledMatch,
  tournament: ScheduleTournament,
) {
  return tournament.dart_mode === "mixed_alternating"
    ? Math.ceil(match.round_number / 2)
    : match.round_number;
}
export function classifyWeeklyMatch(
  match: ScheduledMatch,
  tournament: ScheduleTournament,
  now: Date,
  reservationStart?: string | null,
  holidayRoundCompleted = false,
) {
  const weekStart = startOfChinaWeek(now);
  const weekEnd = addDays(weekStart, 7);
  const expectedWeek = expectedLeagueWeek(tournament, now, holidayRoundCompleted);
  const isLeague =
    match.stage === "group" &&
    ["round_robin", "league_playoff"].includes(tournament.format);
  const plannedWeek = isLeague ? leagueWeek(match, tournament) : null;
  const scheduled = reservationStart || match.scheduled_at;
  const scheduledTime = scheduled ? new Date(scheduled) : null;
  const inWeek = (time: Date | null) =>
    Boolean(time && time >= weekStart && time < weekEnd);
  const overdue =
    isUnplayedMatch(match.status) &&
    (Boolean(scheduledTime && scheduledTime < weekStart) ||
      Boolean(plannedWeek && expectedWeek > plannedWeek));
  // Evaluate each match independently: a newer result must not consume its slot.
  const current =
    overdue ||
    (isUnplayedMatch(match.status) &&
      ((inWeek(scheduledTime) && (!isHolidayLeagueBreak(tournament.id, now) ||
        plannedWeek === null || plannedWeek <= expectedWeek)) || plannedWeek === expectedWeek)) ||
    (match.status === "completed" &&
      inWeek(new Date(match.completed_at || match.updated_at || ""))) ||
    (match.status === "bye" && plannedWeek === expectedWeek);
  return { current, overdue };
}
