import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile, SkillLevel, UserRole } from "@/types/domain";

export async function getCurrentUserAndProfile() {
  if (!hasSupabaseEnv()) {
    return { user: null, profile: null as Profile | null };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null as Profile | null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, role, rating, skill_level, tournament_rating, casual_rating, soft_rating, tournament_skill_level, casual_skill_level, soft_skill_level")
    .eq("id", user.id)
    .maybeSingle();

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

    return {
      user,
      profile: {
        id: user.id,
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
        soft_skill_level: "Beginner" as SkillLevel
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
