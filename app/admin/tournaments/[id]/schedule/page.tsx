import { CalendarRange } from "lucide-react";
import { generateGroupsAndScheduleAction, generateLeaguePlayoffsAction } from "@/lib/actions/tournaments";
import { requireAdmin } from "@/lib/auth/guards";
import { getMatchRulesSummary } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { TournamentBracket } from "@/components/TournamentBracket";
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
  const groupMatches = (matches || []).filter((match) => match.stage === "group");
  const knockoutMatches = (matches || []).filter((match) => match.stage === "knockout");
  const isLeaguePlayoff = tournament?.format === "league_playoff";

  return (
    <div className="grid gap-6">
      <CodlPageHeader
        kicker="CODL Admin"
        title="分组与赛程"
        description={`${tournament?.name} / ${tournament?.format} / 当前参赛主体 ${(participants || []).length}`}
        icon={<CalendarRange className="h-6 w-6" aria-hidden />}
        art="white"
      />
      <Card>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <form action={generateGroupsAndScheduleAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="tournament_id" value={id} />
            <label className="label w-40">
              分组数量
              <input
                className="form-input"
                type="number"
                min={1}
                name="group_count"
                defaultValue={isLeaguePlayoff ? 1 : 2}
                disabled={isLeaguePlayoff}
              />
            </label>
            {isLeaguePlayoff ? <input type="hidden" name="group_count" value={1} /> : null}
            <Button type="submit">
              {isLeaguePlayoff ? "生成联赛赛程" : "自动分组并生成赛程"}
            </Button>
          </form>
          {isLeaguePlayoff ? (
            <form action={generateLeaguePlayoffsAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="tournament_id" value={id} />
              <Button type="submit" variant="secondary">根据当前排名生成季后赛</Button>
            </form>
          ) : null}
        </div>
        {isLeaguePlayoff ? (
          <p className="mt-3 text-sm font-semibold text-muted">
            复合赛制先生成一个整体联赛；联赛结果录入后，再按排名生成季后赛：1-2 名进四强，5v8、6v7，胜者分别挑战 4、3，争夺另外两个四强席位。
          </p>
        ) : null}
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
                      <li key={member.id}>{member.display_name} / {member.rating_snapshot}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {(groups || []).length === 0 ? <p className="text-sm text-muted">暂无分组。</p> : null}
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">{isLeaguePlayoff ? "联赛对阵" : "对阵"}</h2>
          <div className="mt-4 grid gap-3">
            {(isLeaguePlayoff ? groupMatches : matches || []).map((match) => (
              <div key={match.id} className="rounded-lg border border-wire p-4 text-sm">
                <div className="font-semibold text-muted">
                  {match.stage} / R{match.round_number} M{match.match_number} / {match.status}
                </div>
                <div className="mt-1 text-xs font-semibold text-board">
                  {getMatchRulesSummary({
                    dartMode: match.dart_mode,
                    gameVariant: match.game_variant,
                    legRules: match.leg_rules
                  })}
                </div>
                <div className="mt-1 font-bold">
                  {participantById.get(match.participant_a_id)?.display_name || "TBD"} vs {participantById.get(match.participant_b_id)?.display_name || "TBD"}
                </div>
              </div>
            ))}
            {(isLeaguePlayoff ? groupMatches : matches || []).length === 0 ? <p className="text-sm text-muted">暂无赛程。</p> : null}
          </div>
        </Card>
      </section>
      {knockoutMatches.length > 0 || tournament?.format === "single_elimination" || isLeaguePlayoff ? (
        <Card>
          <TournamentBracket
            title={isLeaguePlayoff ? "季后赛树状对阵" : "淘汰赛树状对阵"}
            matches={knockoutMatches}
            participants={(participants || []).map((participant) => ({
              id: participant.id,
              display_name: participant.display_name
            }))}
            manualEdit={{
              tournamentId: id,
              participants: (participants || []).map((participant) => ({
                id: participant.id,
                display_name: participant.display_name
              }))
            }}
          />
        </Card>
      ) : null}
    </div>
  );
}
