import Link from "next/link";
import { Crosshair, Gauge, Swords } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { getMatchRulesSummary } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function ScorerPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;

  const { user } = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: teamMemberships } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", user.id);

  const teamIds = (teamMemberships || []).map((item) => item.team_id);
  const participantFilters = [`user_id.eq.${user.id}`];
  if (teamIds.length > 0) participantFilters.push(`team_id.in.(${teamIds.join(",")})`);

  const { data: myParticipants } = await supabase
    .from("tournament_participants")
    .select("id, display_name")
    .or(participantFilters.join(","));
  const participantIds = (myParticipants || []).map((participant) => participant.id);

  const { data: matches } =
    participantIds.length > 0
      ? await supabase
          .from("matches")
          .select("*")
          .or(`participant_a_id.in.(${participantIds.join(",")}),participant_b_id.in.(${participantIds.join(",")})`)
          .neq("status", "completed")
          .neq("status", "bye")
          .order("round_number")
          .order("match_number")
      : { data: [] };

  const allMatchParticipantIds = [
    ...new Set(
      (matches || [])
        .flatMap((match) => [match.participant_a_id, match.participant_b_id])
        .filter(Boolean)
    )
  ] as string[];
  const { data: matchParticipants } =
    allMatchParticipantIds.length > 0
      ? await supabase
          .from("tournament_participants")
          .select("id, display_name")
          .in("id", allMatchParticipantIds)
      : { data: [] };
  const participantById = new Map((matchParticipants || []).map((participant) => [participant.id, participant]));

  return (
    <div className="grid gap-5">
      <CodlPageHeader
        dark
        kicker="Match Scorer"
        title="计分"
        description="选择当前比赛后录入出场顺序，系统按本局赛制只显示需要填写的数据项。"
        icon={<Gauge className="h-6 w-6" aria-hidden />}
        poster="white"
      />

      <Link
        className="flex min-h-24 touch-manipulation items-center justify-between rounded-lg border border-wire bg-surface/95 p-4 shadow-[0_16px_38px_rgb(17_24_39/0.06)] transition-colors duration-75 hover:border-board/40 active:bg-field"
        href="/scorer/casual"
      >
        <span className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-lg bg-board/10 text-board">
            <Crosshair className="h-6 w-6" aria-hidden />
          </span>
          <span>
            <span className="block text-lg font-black">平时切磋</span>
            <span className="block text-sm font-semibold text-muted">训练局 / 临时对战</span>
          </span>
        </span>
        <Swords className="h-5 w-5 text-muted" aria-hidden />
      </Link>

      <Card>
        <h2 className="flex items-center gap-2 text-lg font-black">
          <span className="h-3 w-3 rounded-full bg-board" aria-hidden />
          正式比赛
        </h2>
        <div className="mt-4 grid gap-3">
          {(matches || []).map((match) => {
            const participantAName = participantById.get(match.participant_a_id || "")?.display_name || "TBD";
            const participantBName = participantById.get(match.participant_b_id || "")?.display_name || "TBD";

            return (
              <Link
                key={match.id}
                href={`/scorer/${match.id}`}
                className="block min-h-20 touch-manipulation rounded-lg border border-wire bg-surface/90 p-4 transition-colors duration-75 hover:border-board/40 hover:bg-field active:bg-field"
              >
                <div className="text-xs font-black uppercase text-muted">
                  第 {match.round_number} 轮 / 第 {match.match_number} 场 / {match.status}
                </div>
                <div className="mt-1 font-black">
                  第 {match.round_number} 轮，{participantAName} 对 {participantBName}
                </div>
                <div className="mt-1 text-xs font-bold text-board">
                  {getMatchRulesSummary({
                    dartMode: match.dart_mode,
                    gameVariant: match.game_variant,
                    legRules: match.leg_rules
                  })}
                </div>
              </Link>
            );
          })}
          {(matches || []).length === 0 ? (
            <p className="text-sm text-muted">暂无待计分比赛。</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
