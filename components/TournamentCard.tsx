import Link from "next/link";
import { CalendarDays, MapPin, Target, UsersRound } from "lucide-react";
import { getDartModeLabel, getGameVariantLabel } from "@/lib/darts/variants";
import { formatDateTime } from "@/lib/utils";
import type { Tournament, TournamentStatus, TournamentType } from "@/types/domain";

const statusLabels: Record<TournamentStatus, string> = {
  draft: "草稿",
  registration_open: "报名中",
  registration_closed: "报名结束",
  in_progress: "进行中",
  completed: "完成"
};

const typeLabels: Record<TournamentType, string> = {
  individual: "单人",
  doubles: "双人",
  team: "队制"
};

export function TournamentCard({ tournament }: { tournament: Tournament }) {
  const gameLabel =
    tournament.dart_mode === "steel"
      ? `${tournament.dart_game}`
      : tournament.dart_mode === "soft"
        ? getGameVariantLabel({ dartMode: "soft", gameVariant: tournament.soft_game })
        : "软硬轮换";

  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      className="group relative grid min-h-44 touch-manipulation gap-4 overflow-hidden rounded-lg border border-wire bg-surface/95 p-4 shadow-[0_14px_34px_rgb(17_24_39/0.05)] transition-colors duration-75 hover:border-board/40 active:bg-field"
    >
      <span className="absolute right-[-2.25rem] top-[-2.25rem] h-24 w-24 rounded-full border-[18px] border-board/10" aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-ink group-hover:text-board">{tournament.name}</h3>
          <p className="mt-1 line-clamp-1 text-sm text-muted">{tournament.location || "地点待定"}</p>
        </div>
        <span className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-black text-white">
          {statusLabels[tournament.status] || tournament.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs font-black text-muted">
        <Meta icon={<UsersRound className="h-4 w-4" />} text={`${typeLabels[tournament.tournament_type]} / ${tournament.team_size}人`} />
        <Meta icon={<Target className="h-4 w-4" />} text={`${getDartModeLabel(tournament.dart_mode)} / ${gameLabel}`} />
        <Meta icon={<CalendarDays className="h-4 w-4" />} text={formatDateTime(tournament.tournament_start_at)} />
        <Meta icon={<MapPin className="h-4 w-4" />} text={tournament.location || "待定"} />
      </div>
    </Link>
  );
}

function Meta({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="text-board">{icon}</span>
      <span className="truncate">{text}</span>
    </span>
  );
}
