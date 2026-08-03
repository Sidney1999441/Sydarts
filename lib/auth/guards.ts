import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { hasSupabaseEnv } from "@/lib/env";
import { hasSupabaseAuthCookie } from "@/lib/supabase/cookies";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile, SkillLevel, UserRole } from "@/types/domain";

const profileSelectBase =
  "id, uid, display_name, avatar_url, role, rating, skill_level, tournament_rating, casual_rating, soft_rating, tournament_skill_level, casual_skill_level, soft_skill_level";
const profileSelectWithRealName = `${profileSelectBase}, real_name, id_card_number, real_name_submitted_at`;

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function normalizeProfile(profile: Record<string, unknown> | null): Profile | null {
  if (!profile) return null;
  return {
    ...(profile as Profile),
    real_name: (profile as Profile).real_name ?? null,
    id_card_number: (profile as Profile).id_card_number ?? null,
    real_name_submitted_at: (profile as Profile).real_name_submitted_at ?? null
  };
}

async function fetchProfile(supabase: SupabaseServerClient, userId: string) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select(profileSelectWithRealName)
    .eq("id", userId)
    .maybeSingle();

  if (!error) return normalizeProfile(profile);

  const { data: baseProfile } = await supabase
    .from("profiles")
    .select(profileSelectBase)
    .eq("id", userId)
    .maybeSingle();

  return normalizeProfile(baseProfile);
}

export async function getCurrentUserAndProfile() {
  if (!hasSupabaseEnv()) {
    return { user: null, profile: null as Profile | null };
  }

  const cookieStore = await cookies();
  if (!hasSupabaseAuthCookie(cookieStore.getAll())) {
    return { user: null, profile: null as Profile | null };
  }

  const supabase = await createSupabaseServerClient({ timeoutMs: 8000 });
  let user = null;

  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    return { user: null, profile: null as Profile | null };
  }

  if (!user) {
    return { user: null, profile: null as Profile | null };
  }

  const profile = await fetchProfile(supabase, user.id);

  if (!profile) {
    const fallbackName =
      typeof user.user_metadata?.display_name === "string"
        ? user.user_metadata.display_name
        : user.email?.split("@")[0] || "Player";
    await supabase.from("profiles").insert({
      id: user.id,
      display_name: fallbackName,
      role: "user",
      rating: 1000,
      skill_level: "Beginner",
      tournament_rating: 1000,
      casual_rating: 1000,
      soft_rating: 1000,
      tournament_skill_level: "Beginner",
      casual_skill_level: "Beginner",
      soft_skill_level: "Beginner"
    });
    await supabase.from("user_stats").insert({
      user_id: user.id,
      current_rating: 1000
    });
    await supabase.from("general_user_stats").insert({
      user_id: user.id,
      current_rating: 1000
    });
    await supabase.from("soft_user_stats").insert({
      user_id: user.id,
      current_rating: 1000
    });

    const createdProfile = await fetchProfile(supabase, user.id);

    if (createdProfile) {
      return { user, profile: createdProfile };
    }

    return {
      user,
      profile: {
        id: user.id,
        uid: "000000",
        display_name: fallbackName,
        avatar_url: null,
        role: "user" as UserRole,
        rating: 1000,
        skill_level: "Beginner" as SkillLevel,
        tournament_rating: 1000,
        casual_rating: 1000,
        soft_rating: 1000,
        tournament_skill_level: "Beginner" as SkillLevel,
        casual_skill_level: "Beginner" as SkillLevel,
        soft_skill_level: "Beginner" as SkillLevel,
        real_name: null,
        id_card_number: null,
        real_name_submitted_at: null
      }
    };
  }

  return { user, profile: profile as Profile | null };
}

export async function requireUser() {
  const session = await getCurrentUserAndProfile();
  if (!session.user) redirect("/auth/login");
  return session;
}

export async function requireAdmin() {
  const session = await requireUser();
  if (session.profile?.role !== "admin") redirect("/");
  return session;
}
