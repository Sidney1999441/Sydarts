import { requireUser } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { CasualScoreboard } from "@/components/scorer/CasualScoreboard";

export const dynamic = "force-dynamic";

export default async function CasualScorerPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;

  const { user, profile } = await requireUser();
  const playerName = profile?.display_name || user.email?.split("@")[0] || "我";
  const supabase = await createSupabaseServerClient();
  const { data: recentMatches } = await supabase
    .from("casual_matches")
    .select("player_a_user_id, player_b_user_id, player_a_name, player_b_name, created_at")
    .or(`player_a_user_id.eq.${user.id},player_b_user_id.eq.${user.id}`)
    .not("player_b_user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(30);

  const recentIds = [
    ...new Set(
      (recentMatches || [])
        .map((match) => (match.player_a_user_id === user.id ? match.player_b_user_id : match.player_a_user_id))
        .filter(Boolean)
    )
  ] as string[];
  const { data: recentProfiles } =
    recentIds.length > 0
      ? await supabase.from("profiles").select("id, uid, display_name").in("id", recentIds)
      : { data: [] };
  const profileById = new Map((recentProfiles || []).map((item) => [item.id, item]));
  const recentOpponents = recentIds.slice(0, 8).map((id) => {
    const profile = profileById.get(id);
    const fallback = (recentMatches || []).find((match) => match.player_a_user_id === id || match.player_b_user_id === id);
    return {
      id,
      uid: profile?.uid || undefined,
      displayName:
        profile?.display_name ||
        (fallback?.player_a_user_id === id ? fallback.player_a_name : fallback?.player_b_name) ||
        "对手"
    };
  });

  return <CasualScoreboard playerId={user.id} playerName={playerName} recentOpponents={recentOpponents} />;
}
