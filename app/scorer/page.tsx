import Link from "next/link";
import { Crosshair, Gauge, Swords } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { getMatchRulesSummary } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
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
      <section className="rounded-lg bg-primary p-5 text-white sm:p-6">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-accent">
            <Gauge className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <div className="text-sm font-bold text-white/60">Scorer</div>
            <h1 className="text-3xl font-black">计分</h1>
          </div>
        </div>
      </section>

      <Link
        className="flex min-h-24 touch-manipulation items-center justify-between rounded-lg border border-wire bg-surface p-4 transition-colors duration-75 active:bg-field"
        href="/scorer/casual"
      >
        <span className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-lg bg-field text-board">
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
        <h2 className="text-lg font-black">正式比赛</h2>
        <div className="mt-4 grid gap-3">
          {(matches || []).map((match) => {
            const participantAName = participantById.get(match.participant_a_id || "")?.display_name || "TBD";
            const participantBName = participantById.get(match.participant_b_id || "")?.display_name || "TBD";

            return (
              <Link
                key={match.id}
                href={`/scorer/${match.id}`}
                className="block min-h-20 touch-manipulation rounded-lg border border-wire p-4 transition-colors duration-75 hover:bg-field active:bg-field"
              >
                <div className="text-xs font-bold text-muted">
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
