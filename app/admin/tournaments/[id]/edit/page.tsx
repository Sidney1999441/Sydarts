import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateTournamentAction } from "@/lib/actions/tournaments";
import { requireAdmin } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";
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
      <CodlPageHeader
        kicker="CODL Admin"
        title="编辑赛事"
        description={tournament.name}
        icon={<Pencil className="h-6 w-6" aria-hidden />}
        art="white"
      />
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
