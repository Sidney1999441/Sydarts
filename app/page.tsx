import Link from "next/link";
import { CalendarCheck, Swords, Trophy } from "lucide-react";
import { SetupNotice } from "@/components/SetupNotice";
import { TournamentCard } from "@/components/TournamentCard";
import { Button } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { getCurrentUserAndProfile } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import type { Tournament } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { user, profile } = await getCurrentUserAndProfile();

  if (!hasSupabaseEnv()) {
    return (
      <div className="grid gap-6">
        <SetupNotice />
        <Hero />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*")
    .in("status", ["registration_open", "in_progress"])
    .order("tournament_start_at", { ascending: true })
    .limit(6);

  let nextMatches: {
    data:
      | Array<{
          id: string;
          tournament_id: string;
          round_number: number;
          match_number: number;
          status: string;
          scheduled_at: string | null;
          participant_a_id: string | null;
          participant_b_id: string | null;
        }>
      | null;
  } = { data: [] };

  if (user) {
    const { data: teamMemberships } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id);
    const teamIds = (teamMemberships || []).map((item) => item.team_id);
    const participantFilters = [`user_id.eq.${user.id}`];
    if (teamIds.length > 0) participantFilters.push(`team_id.in.(${teamIds.join(",")})`);
    const { data: myParticipants } = await supabase
      .from("tournament_participants")
      .select("id")
      .or(participantFilters.join(","));
    const participantIds = (myParticipants || []).map((participant) => participant.id);

    nextMatches =
      participantIds.length > 0
        ? await supabase
            .from("matches")
            .select("id, tournament_id, round_number, match_number, status, scheduled_at, participant_a_id, participant_b_id")
            .or(`participant_a_id.in.(${participantIds.join(",")}),participant_b_id.in.(${participantIds.join(",")})`)
            .in("status", ["not_started", "in_progress"])
            .order("scheduled_at", { ascending: true, nullsFirst: false })
            .limit(5)
        : { data: [] };
  }

  const profileHint = profile
    ? "可报名、计分、查看个人段位和比赛记录"
    : "登录后可报名、计分和记录切磋";

  return (
    <div className="grid gap-6">
      <Hero />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="当前用户" value={profile?.display_name || "游客"} hint={profileHint} />
        <StatCard
          label="开放赛事"
          value={(tournaments || []).filter((item) => item.status === "registration_open").length}
        />
        <StatCard
          label="进行中赛事"
          value={(tournaments || []).filter((item) => item.status === "in_progress").length}
        />
      </div>
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">正在报名 / 进行中</h2>
          <Link className="text-sm font-semibold text-board underline" href="/tournaments">
            查看全部
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(tournaments || []).map((tournament) => (
            <TournamentCard key={tournament.id} tournament={tournament as Tournament} />
          ))}
          {(tournaments || []).length === 0 ? (
            <Card className="md:col-span-2 xl:col-span-3">
              <p className="text-sm text-slate-600">暂时没有开放或进行中的赛事。</p>
            </Card>
          ) : null}
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-board" aria-hidden />
            <h2 className="text-lg font-bold">我的下一场比赛</h2>
          </div>
          <div className="mt-4 grid gap-3">
            {(nextMatches.data || []).length > 0 ? (
              nextMatches.data?.map((match) => (
                <Link
                  key={match.id}
                  href={`/scorer/${match.id}`}
                  className="rounded-lg border border-wire p-3 text-sm hover:bg-field"
                >
                  Round {match.round_number} · Match {match.match_number} ·{" "}
                  {match.scheduled_at ? formatDateTime(match.scheduled_at) : "待排期"}
                </Link>
              ))
            ) : (
              <p className="text-sm text-slate-600">暂无待打比赛。</p>
            )}
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-board" aria-hidden />
            <h2 className="text-lg font-bold">最近战绩</h2>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            完成正式比赛后会写入赛事数据和普通数据；平时切磋只会更新普通数据。
          </p>
        </Card>
      </section>
    </div>
  );
}

function Hero() {
  return (
    <section className="overflow-hidden rounded-lg border border-wire bg-white shadow-soft">
      <div className="grid gap-6 p-6 md:grid-cols-[1.4fr_0.8fr] md:p-8">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-field px-3 py-1 text-sm font-semibold text-board">
            <Swords className="h-4 w-4" aria-hidden />
            Team-first darts events
          </div>
          <h1 className="mt-4 text-3xl font-bold leading-tight text-ink md:text-5xl">
            小规模飞镖队制赛事管理系统
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            支持双人赛、队制赛、实力均衡组队、分组赛程、内置 501 计分器、结果确认和长期数据统计。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/tournaments">
              <Button type="button">浏览赛事</Button>
            </Link>
            <Link href="/scorer">
              <Button type="button" variant="secondary">
                打开计分器
              </Button>
            </Link>
          </div>
        </div>
        <div className="grid content-center gap-3 rounded-lg bg-field p-5">
          <div className="grid grid-cols-3 gap-2">
            {["20", "T20", "Bull", "18", "T19", "D16", "Team", "BO5", "501"].map((label) => (
              <div key={label} className="rounded-lg border border-wire bg-white py-4 text-center text-sm font-bold text-ink">
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
