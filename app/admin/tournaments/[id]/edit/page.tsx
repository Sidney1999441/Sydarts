import { notFound } from "next/navigation";
import { updateTournamentAction } from "@/lib/actions/tournaments";
import { requireAdmin } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { TournamentForm } from "@/components/TournamentForm";
import { Card } from "@/components/ui/Card";
import type { Tournament } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function EditTournamentPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; created?: string }>;
}) {
  const { id } = await params;
  const flags = await searchParams;
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .single();

  if (!tournament) notFound();
  const action = updateTournamentAction.bind(null, id);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold">编辑赛事</h1>
        <p className="mt-2 text-sm text-muted">{tournament.name}</p>
      </div>
      {flags.saved || flags.created ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {flags.created ? "赛事已创建，可以继续完善设置。" : "赛事已保存。"}
        </div>
      ) : null}
      <Card>
        <TournamentForm action={action} tournament={tournament as Tournament} />
      </Card>
    </div>
  );
}
