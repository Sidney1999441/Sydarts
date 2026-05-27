import Link from "next/link";
import { CalendarDays, MapPin, Target, UsersRound } from "lucide-react";
import { getDartModeLabel, getGameVariantLabel } from "@/lib/darts/variants";
import { formatDateTime } from "@/lib/utils";
import type { Tournament } from "@/types/domain";

export function TournamentCard({ tournament }: { tournament: Tournament }) {
  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      className="block rounded-lg border border-wire bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-teal-300"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-ink">{tournament.name}</h3>
        <span className="rounded-full bg-field px-3 py-1 text-xs font-semibold text-slate-600">
          {tournament.status}
        </span>
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
        {tournament.description || "暂无赛事说明"}
      </p>
      <div className="mt-4 grid gap-2 text-sm text-slate-600">
        <span className="inline-flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-board" aria-hidden />
          {tournament.tournament_type === "doubles" ? "双人赛" : tournament.tournament_type === "team" ? "队制赛" : "个人赛"} · 每队 {tournament.team_size} 人
        </span>
        <span className="inline-flex items-center gap-2">
          <Target className="h-4 w-4 text-board" aria-hidden />
          {getDartModeLabel(tournament.dart_mode)} · {tournament.dart_mode === "steel" ? `${tournament.dart_game}` : getGameVariantLabel({ dartMode: "soft", gameVariant: tournament.soft_game })}
        </span>
        <span className="inline-flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-board" aria-hidden />
          {formatDateTime(tournament.tournament_start_at)}
        </span>
        <span className="inline-flex items-center gap-2">
          <MapPin className="h-4 w-4 text-board" aria-hidden />
          {tournament.location || "地点待定"}
        </span>
      </div>
    </Link>
  );
}
