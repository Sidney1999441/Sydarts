import { requireUser } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { SetupNotice } from "@/components/SetupNotice";
import { CasualScoreboard } from "@/components/scorer/CasualScoreboard";

export const dynamic = "force-dynamic";

export default async function CasualScorerPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;

  const { user, profile } = await requireUser();
  const playerName = profile?.display_name || user.email?.split("@")[0] || "我";

  return <CasualScoreboard playerId={user.id} playerName={playerName} />;
}
