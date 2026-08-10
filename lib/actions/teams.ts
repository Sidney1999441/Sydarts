"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fromFormString } from "@/lib/utils";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isProfileUid(value: string) {
  return /^[0-9]{6}$/.test(value);
}

async function resolveProfileByIdentifier(identifier: string) {
  const keyword = identifier.trim();
  if (!keyword) throw new Error("请输入队长 UID、姓名或用户 ID。");

  const admin = createSupabaseAdminClient();
  const query = admin
    .from("profiles")
    .select("id, uid, display_name, status")
    .limit(2);
  const { data, error } = isUuid(keyword)
    ? await query.eq("id", keyword)
    : isProfileUid(keyword)
      ? await query.eq("uid", keyword)
      : await query.ilike("display_name", keyword);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error(`找不到用户：${keyword}`);
  if (data.length > 1) throw new Error(`“${keyword}”匹配到多个用户，请改用 6 位 UID。`);
  if (data[0].status !== "active") throw new Error("队长账号必须是 active 状态。");
  return data[0];
}

export async function updateSavedTeamProfileAction(formData: FormData) {
  const { user, profile } = await requireUser();
  const savedTeamId = fromFormString(formData.get("saved_team_id"));
  const name = fromFormString(formData.get("name"));

  if (!name) throw new Error("请输入队伍名称。");

  const admin = createSupabaseAdminClient();
  const { data: savedTeam, error } = await admin
    .from("saved_teams")
    .select("id, captain_user_id")
    .eq("id", savedTeamId)
    .single();

  if (error) throw new Error(error.message);
  if (profile?.role !== "admin" && savedTeam.captain_user_id !== user.id) {
    throw new Error("只有队长可以编辑这个长期队伍。");
  }

  const { error: updateError } = await admin
    .from("saved_teams")
    .update({
      name
    })
    .eq("id", savedTeamId);

  if (updateError) throw new Error(updateError.message);

  revalidatePath("/profile");
  revalidatePath("/teams");
  revalidatePath(`/teams/${savedTeamId}`);
}

export async function createSavedTeamForCurrentUserAction(formData: FormData) {
  const { user } = await requireUser();
  const name = fromFormString(formData.get("name"));
  const avatarUrl = fromFormString(formData.get("avatar_url")) || null;

  if (!name) throw new Error("请输入队伍名称。");

  const admin = createSupabaseAdminClient();
  const { data: savedTeam, error } = await admin
    .from("saved_teams")
    .insert({
      name,
      avatar_url: avatarUrl,
      captain_user_id: user.id,
      created_by: user.id,
      status: "active"
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/profile");
  revalidatePath("/teams");
  if (savedTeam?.id) revalidatePath(`/teams/${savedTeam.id}`);
}

export async function createSavedTeamAdminAction(formData: FormData) {
  const { user } = await requireAdmin();
  const name = fromFormString(formData.get("name"));
  const avatarUrl = fromFormString(formData.get("avatar_url")) || null;
  const captainIdentifier = fromFormString(formData.get("captain_identifier"));
  const captain = await resolveProfileByIdentifier(captainIdentifier);

  if (!name) throw new Error("请输入队伍名称。");

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("saved_teams").insert({
    name,
    avatar_url: avatarUrl,
    captain_user_id: captain.id,
    created_by: user.id,
    status: "active"
  });

  if (error) throw new Error(error.message);

  revalidatePath("/admin/teams");
  revalidatePath("/profile");
}

export async function updateSavedTeamAdminAction(formData: FormData) {
  await requireAdmin();
  const savedTeamId = fromFormString(formData.get("saved_team_id"));
  const name = fromFormString(formData.get("name"));
  const captainIdentifier = fromFormString(formData.get("captain_identifier"));
  const status = fromFormString(formData.get("status")) === "archived" ? "archived" : "active";

  if (!savedTeamId) throw new Error("缺少长期队伍 ID。");
  if (!name) throw new Error("请输入队伍名称。");

  const captain = await resolveProfileByIdentifier(captainIdentifier);
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("saved_teams")
    .update({
      name,
      captain_user_id: captain.id,
      status
    })
    .eq("id", savedTeamId);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/teams");
  revalidatePath(`/teams/${savedTeamId}`);
  revalidatePath("/profile");
}
