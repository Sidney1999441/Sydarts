import { CalendarDays } from "lucide-react";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { TournamentCard } from "@/components/TournamentCard";
import { Card } from "@/components/ui/Card";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tournament } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function TournamentsPage() {
  if (!hasSupabaseEnv()) {
    return <SetupNotice />;
  }

  const supabase = await createSupabaseServerClient();
  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*")
    .neq("status", "draft")
    .order("tournament_start_at", { ascending: true });

  return (
    <div className="grid gap-6">
      <CodlPageHeader
        kicker="CODL Tournaments"
        title="赛事列表"
        description="支持硬镖、软镖和软硬交替赛事；软镖使用手机手动录入，个人数据随正式比赛自动沉淀。"
        icon={<CalendarDays className="h-6 w-6" aria-hidden />}
        art="white"
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(tournaments || []).map((tournament) => (
          <TournamentCard key={tournament.id} tournament={tournament as Tournament} />
        ))}
      </div>
      {(tournaments || []).length === 0 ? (
        <Card>
          <p className="text-sm text-muted">暂无已发布赛事。</p>
        </Card>
      ) : null}
    </div>
  );
}
