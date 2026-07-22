import { createTournamentAction } from "@/lib/actions/tournaments";
import { requireAdmin } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/SetupNotice";
import { TournamentForm } from "@/components/TournamentForm";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function NewTournamentPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold">创建赛事</h1>
        <p className="mt-2 text-sm text-muted">默认创建双人赛，后续可以调整为多人队制。</p>
      </div>
      <Card>
        <TournamentForm action={createTournamentAction} />
      </Card>
    </div>
  );
}
