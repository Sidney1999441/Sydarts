"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fromFormString } from "@/lib/utils";

export async function updateUserAdminFieldsAction(formData: FormData) {
  await requireAdmin();
  const userId = fromFormString(formData.get("user_id"));
  const role = fromFormString(formData.get("role"));
  const tournamentRating = Number(formData.get("tournament_rating") || 1000);
  const casualRating = Number(formData.get("casual_rating") || tournamentRating);
  const softRating = Number(formData.get("soft_rating") || tournamentRating);
  const tournamentSkillLevel = fromFormString(formData.get("tournament_skill_level")) || "Beginner";
  const casualSkillLevel = fromFormString(formData.get("casual_skill_level")) || tournamentSkillLevel;
  const softSkillLevel = fromFormString(formData.get("soft_skill_level")) || casualSkillLevel;
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      role,
      rating: tournamentRating,
      skill_level: tournamentSkillLevel,
      tournament_rating: tournamentRating,
      casual_rating: casualRating,
      soft_rating: softRating,
      tournament_skill_level: tournamentSkillLevel,
      casual_skill_level: casualSkillLevel,
      soft_skill_level: softSkillLevel
    })
    .eq("id", userId);

  if (error) throw new Error(error.message);
  await supabase
    .from("user_stats")
    .update({ current_rating: tournamentRating })
    .eq("user_id", userId);
  await supabase
    .from("general_user_stats")
    .update({ current_rating: casualRating })
    .eq("user_id", userId);
  await supabase
    .from("soft_user_stats")
    .update({ current_rating: softRating })
    .eq("user_id", userId);

  revalidatePath("/admin/users");
}

export async function searchPlayerProfilesAction(query: string) {
  const { user } = await requireUser();
  const keyword = query.trim();
  if (keyword.length < 2) return [];

  const admin = createSupabaseAdminClient();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keyword);
  const request = admin
    .from("profiles")
    .select("id, display_name")
    .neq("id", user.id)
    .eq("status", "active")
    .limit(8);

  const { data, error } = isUuid
    ? await request.eq("id", keyword)
    : await request.ilike("display_name", `%${keyword}%`);

  if (error) throw new Error(error.message);
  return (data || []).map((profile) => ({
    id: profile.id,
    displayName: profile.display_name || "Unnamed player"
  }));
}
