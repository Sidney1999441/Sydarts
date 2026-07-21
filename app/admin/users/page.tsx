import { Search } from "lucide-react";
import { updateUserAdminFieldsAction } from "@/lib/actions/users";
import { requireAdmin } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { SetupNotice } from "@/components/SetupNotice";
import { AvatarUploader } from "@/components/ui/AvatarUploader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

const skillLevels = ["Beginner", "Intermediate", "Advanced", "Pro"];

export default async function AdminUsersPage({
  searchParams
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const { q = "" } = (await searchParams) || {};
  const keyword = q.trim();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("profiles")
    .select(
      "id, uid, display_name, avatar_url, bio, phone, role, rating, skill_level, tournament_rating, casual_rating, soft_rating, tournament_skill_level, casual_skill_level, soft_skill_level, status, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(60);

  if (keyword) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keyword)) {
      query = query.eq("id", keyword);
    } else if (/^[0-9]+$/.test(keyword)) {
      query = query.ilike("uid", `${keyword}%`);
    } else {
      query = query.ilike("display_name", `%${keyword}%`);
    }
  }

  const { data: users } = await query;

  return (
    <div className="grid gap-5">
      <section className="rounded-lg bg-primary p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-white/60">Admin</div>
            <h1 className="mt-2 text-3xl font-black">用户管理</h1>
          </div>
          <form className="flex w-full gap-2 sm:w-auto" action="/admin/users">
            <input
              className="form-input min-w-0 bg-white text-ink sm:w-72"
              name="q"
              defaultValue={keyword}
              placeholder="UID / 姓名 / 用户 ID"
            />
            <Button className="shrink-0 bg-board text-white" type="submit">
              <Search className="h-4 w-4" aria-hidden />
              筛选
            </Button>
          </form>
        </div>
      </section>

      <Card>
        <div className="grid gap-3">
          {(users || []).map((user) => (
            <form
              key={user.id}
              action={updateUserAdminFieldsAction}
              className="grid gap-4 rounded-lg border border-wire bg-surface p-4"
            >
              <input type="hidden" name="user_id" value={user.id} />
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <AvatarUploader
                    entityType="profile"
                    entityId={user.id}
                    initialUrl={user.avatar_url}
                    fallback={user.display_name || "U"}
                    label="上传头像"
                    size="sm"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-lg font-black">{user.display_name || "未命名用户"}</div>
                    <div className="text-xs font-bold text-board">UID {user.uid || "------"}</div>
                    <div className="truncate text-xs text-muted">{user.id}</div>
                  </div>
                </div>
                <div className="text-right text-xs font-semibold text-muted">
                  <div>{user.status}</div>
                  <div>{user.created_at ? formatDateTime(user.created_at) : "-"}</div>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-4">
                <label className="label">
                  显示名
                  <input className="form-input" name="display_name" defaultValue={user.display_name || ""} required />
                </label>
                <label className="label">
                  手机
                  <input className="form-input" name="phone" defaultValue={user.phone || ""} />
                </label>
                <label className="label">
                  状态
                  <select className="form-input" name="status" defaultValue={user.status || "active"}>
                    <option value="active">active</option>
                    <option value="banned">banned</option>
                  </select>
                </label>
                <label className="label">
                  角色
                  <select className="form-input" name="role" defaultValue={user.role}>
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </label>
                <label className="label">
                  赛事 Rating
                  <input
                    className="form-input"
                    type="number"
                    name="tournament_rating"
                    defaultValue={user.tournament_rating ?? user.rating ?? 1000}
                  />
                </label>
                <label className="label">
                  普通 Rating
                  <input
                    className="form-input"
                    type="number"
                    name="casual_rating"
                    defaultValue={user.casual_rating ?? user.rating ?? 1000}
                  />
                </label>
                <label className="label">
                  软式 Rating
                  <input
                    className="form-input"
                    type="number"
                    name="soft_rating"
                    defaultValue={user.soft_rating ?? user.rating ?? 1000}
                  />
                </label>
                <label className="label">
                  赛事等级
                  <SkillSelect name="tournament_skill_level" value={user.tournament_skill_level ?? user.skill_level} />
                </label>
                <label className="label">
                  普通等级
                  <SkillSelect name="casual_skill_level" value={user.casual_skill_level ?? user.skill_level} />
                </label>
                <label className="label">
                  软式等级
                  <SkillSelect name="soft_skill_level" value={user.soft_skill_level ?? user.skill_level} />
                </label>
                <label className="label lg:col-span-4">
                  备注
                  <textarea className="form-input min-h-24" name="bio" defaultValue={user.bio || ""} />
                </label>
              </div>

              <div className="flex justify-end">
                <Button type="submit" variant="secondary">
                  保存用户
                </Button>
              </div>
            </form>
          ))}
          {(users || []).length === 0 ? (
            <p className="text-sm text-muted">没有找到用户。</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function SkillSelect({ name, value }: { name: string; value: string }) {
  return (
    <select className="form-input" name={name} defaultValue={value}>
      {skillLevels.map((level) => (
        <option key={level} value={level}>
          {level}
        </option>
      ))}
    </select>
  );
}
