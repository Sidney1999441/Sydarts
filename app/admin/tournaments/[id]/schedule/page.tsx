import { generateGroupsAndScheduleAction } from "@/lib/actions/tournaments";
import { requireAdmin } from "@/lib/auth/guards";
import { getDartModeLabel, getGameVariantLabel } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function ScheduleAdminPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const [{ data: tournament }, { data: participants }, { data: groups }, { data: groupMembers }, { data: matches }] =
    await Promise.all([
      supabase.from("tournaments").select("*").eq("id", id).single(),
      supabase.from("tournament_participants").select("*").eq("tournament_id", id).order("seed"),
      supabase.from("groups").select("*").eq("tournament_id", id).order("group_index"),
      supabase.from("group_members").select("*"),
      supabase.from("matches").select("*").eq("tournament_id", id).order("round_number").order("match_number")
    ]);
  const participantById = new Map((participants || []).map((participant) => [participant.id, participant]));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold">分组与赛程</h1>
        <p className="mt-2 text-sm text-muted">
          {tournament?.name} · {tournament?.format} · 当前参赛主体 {(participants || []).length}
        </p>
      </div>
      <Card>
        <form action={generateGroupsAndScheduleAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="tournament_id" value={id} />
          <label className="label w-40">
            分组数量
            <input className="form-input" type="number" min={1} name="group_count" defaultValue={2} />
          </label>
          <Button type="submit">自动分组并生成赛程</Button>
        </form>
      </Card>
      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <h2 className="text-lg font-bold">分组</h2>
          <div className="mt-4 grid gap-3">
            {(groups || []).map((group) => {
              const members = (groupMembers || [])
                .filter((member) => member.group_id === group.id)
                .map((member) => participantById.get(member.participant_id))
                .filter(Boolean);
              return (
                <div key={group.id} className="rounded-lg border border-wire p-4">
                  <div className="font-bold">{group.name} 组</div>
                  <ul className="mt-2 grid gap-1 text-sm text-muted">
                    {members.map((member) => (
                      <li key={member.id}>{member.display_name} · {member.rating_snapshot}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {(groups || []).length === 0 ? <p className="text-sm text-muted">暂无分组。</p> : null}
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">对阵</h2>
          <div className="mt-4 grid gap-3">
            {(matches || []).map((match) => (
              <div key={match.id} className="rounded-lg border border-wire p-4 text-sm">
                <div className="font-semibold text-muted">
                  {match.stage} · R{match.round_number} M{match.match_number} · {match.status}
                </div>
                <div className="mt-1 text-xs font-semibold text-board">
                  {getDartModeLabel(match.dart_mode)} · {getGameVariantLabel({ dartMode: match.dart_mode, gameVariant: match.game_variant })}
                </div>
                <div className="mt-1 font-bold">
                  {participantById.get(match.participant_a_id)?.display_name || "TBD"} vs {participantById.get(match.participant_b_id)?.display_name || "TBD"}
                </div>
              </div>
            ))}
            {(matches || []).length === 0 ? <p className="text-sm text-muted">暂无赛程。</p> : null}
          </div>
        </Card>
      </section>
    </div>
  );
}
