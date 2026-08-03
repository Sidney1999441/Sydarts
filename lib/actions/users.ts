"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { getInitialRatingTier, ratingToSkillLevel } from "@/lib/algorithms/player-level";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fromFormString } from "@/lib/utils";

const skillLevels = new Set(["Beginner", "Intermediate", "Advanced", "Pro"]);
const userRoles = new Set(["user", "admin"]);
const userStatuses = new Set(["active", "banned"]);

function parseRating(value: FormDataEntryValue | null, fallback = 1000) {
  const rating = Number(value || fallback);
  if (!Number.isFinite(rating)) return fallback;
  return Math.max(0, Math.round(rating));
}

function parseOption(value: string, allowed: Set<string>, fallback: string) {
  return allowed.has(value) ? value : fallback;
}

function parseSkillLevel(value: FormDataEntryValue | null, rating: number) {
  return parseOption(fromFormString(value), skillLevels, ratingToSkillLevel(rating));
}

function normalizeRealName(value: FormDataEntryValue | null) {
  return fromFormString(value).replace(/\s+/g, " ").trim();
}

function normalizeIdCardNumber(value: FormDataEntryValue | null) {
  return fromFormString(value).replace(/[\s-]/g, "").toUpperCase();
}

function isValidBirthDate(value: string) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    year >= 1900 &&
    date.getTime() <= Date.now()
  );
}

function isValidIdCardNumber(value: string) {
  if (!/^[0-9]{17}[0-9X]$/.test(value)) return false;
  if (!isValidBirthDate(value.slice(6, 14))) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkCodes = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];
  const sum = weights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
  return checkCodes[sum % 11] === value[17];
}

export async function updateUserAdminFieldsAction(formData: FormData) {
  await requireAdmin();
  const userId = fromFormString(formData.get("user_id"));
  const displayName = fromFormString(formData.get("display_name"));
  const phone = fromFormString(formData.get("phone")) || null;
  const bio = fromFormString(formData.get("bio")) || null;
  const role = parseOption(fromFormString(formData.get("role")), userRoles, "user");
  const status = parseOption(fromFormString(formData.get("status")), userStatuses, "active");
  const initialRatingTier = getInitialRatingTier(fromFormString(formData.get("initial_rating_tier")));
  const initialRating = initialRatingTier?.rating ?? null;
  const tournamentRating = initialRating ?? parseRating(formData.get("tournament_rating"));
  const casualRating = initialRating ?? parseRating(formData.get("casual_rating"), tournamentRating);
  const softRating = initialRating ?? parseRating(formData.get("soft_rating"), tournamentRating);
  const tournamentSkillLevel = parseSkillLevel(formData.get("tournament_skill_level"), tournamentRating);
  const casualSkillLevel = parseSkillLevel(formData.get("casual_skill_level"), casualRating);
  const softSkillLevel = parseSkillLevel(formData.get("soft_skill_level"), softRating);
  const supabase = createSupabaseAdminClient();

  if (!userId) throw new Error("缺少用户 ID。");
  if (!displayName) throw new Error("请输入用户显示名。");

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      phone,
      bio,
      role,
      status,
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
    .upsert({ user_id: userId, current_rating: tournamentRating }, { onConflict: "user_id" });
  await supabase
    .from("general_user_stats")
    .upsert({ user_id: userId, current_rating: casualRating }, { onConflict: "user_id" });
  await supabase
    .from("soft_user_stats")
    .upsert({ user_id: userId, current_rating: softRating }, { onConflict: "user_id" });

  revalidatePath("/admin/users");
  revalidatePath("/profile");
}

export async function updateRealNameProfileAction(formData: FormData) {
  const { user } = await requireUser();
  const realName = normalizeRealName(formData.get("real_name"));
  const idCardNumber = normalizeIdCardNumber(formData.get("id_card_number"));

  if (realName.length < 2 || realName.length > 40) {
    throw new Error("真实姓名需为 2-40 个字符。");
  }
  if (!/^[\u4e00-\u9fa5A-Za-z·.\s-]+$/.test(realName)) {
    throw new Error("真实姓名只能包含中英文、空格、点号或连字符。");
  }
  if (!isValidIdCardNumber(idCardNumber)) {
    throw new Error("请输入有效的 18 位身份证号码。");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      real_name: realName,
      id_card_number: idCardNumber,
      real_name_submitted_at: new Date().toISOString()
    })
    .eq("id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/profile");
  revalidatePath("/profile/real-name");
  redirect("/profile");
}

export async function searchPlayerProfilesAction(query: string) {
  const { user } = await requireUser();
  const keyword = query.trim();
  if (keyword.length < 2) return [];

  const admin = createSupabaseAdminClient();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keyword);
  const isUid = /^[0-9]{1,6}$/.test(keyword);
  const request = admin
    .from("profiles")
    .select("id, uid, display_name")
    .neq("id", user.id)
    .eq("status", "active")
    .limit(8);

  const { data, error } = isUuid
    ? await request.eq("id", keyword)
    : isUid
      ? await request.ilike("uid", `${keyword}%`)
      : await request.ilike("display_name", `%${keyword}%`);

  if (error) throw new Error(error.message);
  return (data || []).map((profile) => ({
    id: profile.id,
    uid: profile.uid,
    displayName: profile.display_name || "Unnamed player"
  }));
}
