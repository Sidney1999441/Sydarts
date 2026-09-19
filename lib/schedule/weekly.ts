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
  dart_mode: string;
  format: string;
  tournament_start_at: string;
};
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
) {
  const weekStart = startOfChinaWeek(now);
  const weekEnd = addDays(weekStart, 7);
  const start = startOfChinaWeek(new Date(tournament.tournament_start_at));
  const expectedWeek =
    Math.floor((weekStart.getTime() - start.getTime()) / (7 * DAY)) + 1;
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
      (inWeek(scheduledTime) || plannedWeek === expectedWeek)) ||
    (match.status === "completed" &&
      inWeek(new Date(match.completed_at || match.updated_at || ""))) ||
    (match.status === "bye" && plannedWeek === expectedWeek);
  return { current, overdue };
}
