import { Plus } from "lucide-react";
import { createTournamentAction } from "@/lib/actions/tournaments";
import { requireAdmin } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { TournamentForm } from "@/components/TournamentForm";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function NewTournamentPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();

  return (
    <div className="grid gap-6">
      <CodlPageHeader
        kicker="CODL Admin"
        title="创建赛事"
        description="默认创建双人赛，后续可以调整为多人队制、软硬交替和自定义局制。"
        icon={<Plus className="h-6 w-6" aria-hidden />}
        poster="white"
      />
      <Card>
        <TournamentForm action={createTournamentAction} />
      </Card>
    </div>
  );
}
