import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { avatarBucketName, buildAvatarPublicUrl } from "@/lib/storage/avatars";

const maxCompressedSize = 2 * 1024 * 1024;
const entityTypes = new Set(["profile", "saved_team", "tournament_team"]);

export const runtime = "nodejs";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function avatarPath(entityType: string, entityId: string) {
  const folder =
    entityType === "profile"
      ? "profiles"
      : entityType === "saved_team"
        ? "saved-teams"
        : "tournament-teams";
  return `${folder}/${entityId}/${Date.now()}-${crypto.randomUUID()}.webp`;
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return jsonError("请先登录后再上传头像。", 401);

  const formData = await request.formData();
  const entityType = String(formData.get("entity_type") || "");
  const entityId = String(formData.get("entity_id") || "");
  const file = formData.get("file");

  if (!entityTypes.has(entityType)) return jsonError("头像类型无效。");
  if (!isUuid(entityId)) return jsonError("头像目标 ID 无效。");
  if (!(file instanceof File)) return jsonError("请选择要上传的头像文件。");
  if (file.type !== "image/webp") return jsonError("头像需要先裁剪并压缩为 WebP。");
  if (file.size <= 0) return jsonError("头像文件为空。");
  if (file.size > maxCompressedSize) return jsonError("头像压缩后仍过大，请重新裁剪或选择更小的图片。");

  const admin = createSupabaseAdminClient();
  const { data: currentProfile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, status")
    .eq("id", user.id)
    .single();

  if (profileError || !currentProfile || currentProfile.status !== "active") {
    return jsonError("当前账号无权上传头像。", 403);
  }

  const isAdmin = currentProfile.role === "admin";
  let updateTarget: { table: "profiles" | "saved_teams" | "teams"; tournamentId?: string } | null = null;

  if (entityType === "profile") {
    if (!isAdmin && entityId !== user.id) return jsonError("只能修改自己的头像。", 403);
    updateTarget = { table: "profiles" };
  }

  if (entityType === "saved_team") {
    const { data: savedTeam, error } = await admin
      .from("saved_teams")
      .select("id, captain_user_id")
      .eq("id", entityId)
      .single();
    if (error || !savedTeam) return jsonError("找不到长期队伍。", 404);
    if (!isAdmin && savedTeam.captain_user_id !== user.id) {
      return jsonError("只有队长或管理员可以修改这个队伍头像。", 403);
    }
    updateTarget = { table: "saved_teams" };
  }

  if (entityType === "tournament_team") {
    if (!isAdmin) return jsonError("只有管理员可以修改赛事内队伍头像。", 403);
    const { data: team, error } = await admin
      .from("teams")
      .select("id, tournament_id")
      .eq("id", entityId)
      .single();
    if (error || !team) return jsonError("找不到赛事队伍。", 404);
    updateTarget = { table: "teams", tournamentId: team.tournament_id };
  }

  if (!updateTarget) return jsonError("头像目标无效。");

  const path = avatarPath(entityType, entityId);
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(avatarBucketName).upload(path, bytes, {
    cacheControl: "31536000",
    contentType: "image/webp",
    upsert: true
  });

  if (uploadError) {
    return jsonError(`头像上传失败：${uploadError.message}`, 500);
  }

  const avatarUrl = buildAvatarPublicUrl(path);
  const { error: updateError } = await admin
    .from(updateTarget.table)
    .update({ avatar_url: avatarUrl })
    .eq("id", entityId);

  if (updateError) return jsonError(`头像保存失败：${updateError.message}`, 500);

  revalidatePath("/profile");
  revalidatePath("/admin/users");
  revalidatePath("/admin/teams");
  if (entityType === "saved_team") revalidatePath(`/teams/${entityId}`);
  if (updateTarget.tournamentId) {
    revalidatePath(`/admin/tournaments/${updateTarget.tournamentId}/participants`);
    revalidatePath(`/tournaments/${updateTarget.tournamentId}`);
  }

  return NextResponse.json({ avatarUrl });
}
