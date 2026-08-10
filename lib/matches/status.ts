import type { MatchStatus } from "@/types/domain";

export function getMatchStatusLabel(status?: MatchStatus | string | null) {
  switch (status) {
    case "not_started":
      return "待进行";
    case "in_progress":
      return "进行中";
    case "pending_confirmation":
      return "待确认";
    case "disputed":
      return "有争议";
    case "completed":
      return "已结束";
    case "bye":
      return "轮空";
    default:
      return "待进行";
  }
}

export function isUnplayedMatch(status?: MatchStatus | string | null) {
  return status === "not_started" || status === "in_progress" || status === "pending_confirmation" || status === "disputed";
}
