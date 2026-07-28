import Link from "next/link";
import { CalendarDays, ChevronRight, MapPin, Plus, Target } from "lucide-react";
import { deleteTournamentAction, setTournamentStatusAction } from "@/lib/actions/tournaments";
import { requireAdmin } from "@/lib/auth/guards";
import { getDartModeLabel, getGameVariantLabel } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { Button } from "@/components/ui/Button";
import type { TournamentStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

const statusLabels: Record<TournamentStatus, string> = {
  draft: "草稿",
  registration_open: "报名中",
  registration_closed: "报名结束",
  in_progress: "进行中",
  completed: "完成"
};

export default async function AdminTournamentsPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="grid gap-5">
      <CodlPageHeader
        kicker="CODL Admin"
        title="赛事"
        description="创建、发布、编排和维护 CODL 赛事。"
        icon={<CalendarDays className="h-6 w-6" aria-hidden />}
        art="pattern"
        actions={
          <Link className="inline-flex min-h-12 touch-manipulation items-center gap-2 rounded-lg bg-board px-4 text-sm font-black text-white" href="/admin/tournaments/new">
          <Plus className="h-4 w-4" aria-hidden />
          创建
        </Link>
        }
      />

      <div className="grid gap-3">
        {(tournaments || []).map((tournament) => {
          const gameLabel =
            tournament.dart_mode === "steel"
              ? `${tournament.dart_game}`
              : tournament.dart_mode === "soft"
                ? getGameVariantLabel({ dartMode: "soft", gameVariant: tournament.soft_game })
                : "软硬轮换";

          return (
            <section key={tournament.id} className="rounded-lg border border-wire bg-surface/95 p-4 shadow-[0_14px_34px_rgb(17_24_39/0.05)]">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-black">{tournament.name}</h2>
                    <span className="rounded-md bg-field px-2.5 py-1 text-xs font-bold text-muted">
                      {statusLabels[tournament.status as TournamentStatus] || tournament.status}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm font-semibold text-muted sm:grid-cols-3">
                    <span className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-board" aria-hidden />
                      {tournament.location || "地点待定"}
                    </span>
                    <span className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-board" aria-hidden />
                      {formatDateTime(tournament.tournament_start_at)}
                    </span>
                    <span className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-board" aria-hidden />
                      {getDartModeLabel(tournament.dart_mode)} / {gameLabel}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <AdminLink href={`/admin/tournaments/${tournament.id}/edit`}>编辑</AdminLink>
                  <AdminLink href={`/admin/tournaments/${tournament.id}/participants`}>选手</AdminLink>
                  <AdminLink href={`/admin/tournaments/${tournament.id}/schedule`}>赛程</AdminLink>
                  <AdminLink href={`/admin/tournaments/${tournament.id}/results`}>成绩</AdminLink>
                  <StatusForm tournamentId={tournament.id} status="registration_open" label="发布" />
                  <StatusForm tournamentId={tournament.id} status="registration_closed" label="关报名" />
                  <form action={deleteTournamentAction}>
                    <input type="hidden" name="tournament_id" value={tournament.id} />
                    <Button type="submit" variant="danger">删除</Button>
                  </form>
                </div>
              </div>
            </section>
          );
        })}
        {(tournaments || []).length === 0 ? (
          <section className="rounded-lg border border-wire bg-surface p-5 text-sm font-semibold text-muted">
            暂无赛事。
          </section>
        ) : null}
      </div>
    </div>
  );
}

function AdminLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link className="inline-flex min-h-12 touch-manipulation items-center gap-1 rounded-lg border border-wire px-4 text-sm font-bold hover:bg-field" href={href}>
      {children}
      <ChevronRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

function StatusForm({ tournamentId, status, label }: { tournamentId: string; status: string; label: string }) {
  return (
    <form action={setTournamentStatusAction}>
      <input type="hidden" name="tournament_id" value={tournamentId} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" variant="secondary">{label}</Button>
    </form>
  );
}
