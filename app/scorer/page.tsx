import Link from "next/link";
import { Crosshair, Swords } from "lucide-react";
import { requireUser } from "@/lib/auth/guards";
import { getDartModeLabel, getGameVariantLabel } from "@/lib/darts/variants";
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
          .order("round_number")
          .order("match_number")
      : { data: [] };

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold">计分器</h1>
        <p className="mt-2 text-sm text-slate-600">
          可以为正式赛事计分，也可以直接记录平时切磋。正式赛事写入赛事等级，切磋只写入普通等级。
        </p>
      </div>

      <Card>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-field p-2 text-board">
              <Crosshair className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-bold">平时切磋</h2>
              <p className="mt-1 text-sm text-slate-600">
                不需要选择赛事或比赛，适合临时对战、训练局和双人练习。
              </p>
            </div>
          </div>
          <Link
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-board px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
            href="/scorer/casual"
          >
            <Swords className="h-4 w-4" aria-hidden />
            打开切磋计分器
          </Link>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-bold">我的正式比赛</h2>
        <div className="mt-4 grid gap-3">
          {(matches || []).map((match) => {
            const isSoft = (match.dart_mode || "steel") === "soft";
            const content = (
              <>
              <div className="text-sm font-semibold text-slate-500">
                {match.stage} · Round {match.round_number} · Match {match.match_number}
              </div>
              <div className="mt-1 text-xs font-semibold text-board">
                {getDartModeLabel(match.dart_mode)} · {getGameVariantLabel({ dartMode: match.dart_mode, gameVariant: match.game_variant })}
              </div>
              <div className="mt-1 font-bold">Match #{match.id.slice(0, 8)}</div>
              {isSoft ? <div className="mt-2 text-xs text-slate-500">软镖请到赛事页手动录入。</div> : null}
              </>
            );

            return isSoft ? (
              <div key={match.id} className="rounded-lg border border-wire p-4">
                {content}
              </div>
            ) : (
              <Link
                key={match.id}
                href={`/scorer/${match.id}`}
                className="rounded-lg border border-wire p-4 hover:bg-field"
              >
                {content}
              </Link>
            );
          })}
          {(matches || []).length === 0 ? (
            <p className="text-sm text-slate-600">当前没有需要你计分的正式比赛。</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
