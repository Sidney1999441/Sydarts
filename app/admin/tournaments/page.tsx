import Link from "next/link";
import { deleteTournamentAction, setTournamentStatusAction } from "@/lib/actions/tournaments";
import { requireAdmin } from "@/lib/auth/guards";
import { getDartModeLabel, getGameVariantLabel } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function AdminTournamentsPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">赛事管理</h1>
          <p className="mt-2 text-sm text-slate-600">双人赛/队制赛默认优先。</p>
        </div>
        <Link className="rounded-lg bg-board px-4 py-2 text-sm font-semibold text-white" href="/admin/tournaments/new">
          创建赛事
        </Link>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2">赛事</th>
                <th>类型</th>
                <th>时间</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {(tournaments || []).map((tournament) => (
                <tr key={tournament.id} className="border-t border-wire">
                  <td className="py-3">
                    <div className="font-bold">{tournament.name}</div>
                    <div className="text-xs text-slate-500">{tournament.location || "地点待定"}</div>
                  </td>
                  <td>
                    <div>{tournament.tournament_type} · {tournament.team_size}人/队</div>
                    <div className="text-xs text-slate-500">
                      {getDartModeLabel(tournament.dart_mode)} · {tournament.dart_mode === "steel" ? `${tournament.dart_game}` : getGameVariantLabel({ dartMode: "soft", gameVariant: tournament.soft_game })}
                    </div>
                  </td>
                  <td>{formatDateTime(tournament.tournament_start_at)}</td>
                  <td>{tournament.status}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <Link className="rounded-lg border border-wire px-3 py-2 font-semibold" href={`/admin/tournaments/${tournament.id}/edit`}>
                        编辑
                      </Link>
                      <Link className="rounded-lg border border-wire px-3 py-2 font-semibold" href={`/admin/tournaments/${tournament.id}/participants`}>
                        选手
                      </Link>
                      <Link className="rounded-lg border border-wire px-3 py-2 font-semibold" href={`/admin/tournaments/${tournament.id}/schedule`}>
                        分组赛程
                      </Link>
                      <Link className="rounded-lg border border-wire px-3 py-2 font-semibold" href={`/admin/tournaments/${tournament.id}/results`}>
                        成绩
                      </Link>
                      <StatusForm tournamentId={tournament.id} status="registration_open" label="发布" />
                      <StatusForm tournamentId={tournament.id} status="registration_closed" label="关闭报名" />
                      <form action={deleteTournamentAction}>
                        <input type="hidden" name="tournament_id" value={tournament.id} />
                        <Button type="submit" variant="danger">删除</Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {(tournaments || []).length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-500" colSpan={5}>暂无赛事。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
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
