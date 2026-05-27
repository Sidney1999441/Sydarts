import { updateUserAdminFieldsAction } from "@/lib/actions/users";
import { requireAdmin } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: users } = await supabase
    .from("profiles")
    .select("id, display_name, role, rating, skill_level, tournament_rating, casual_rating, soft_rating, tournament_skill_level, casual_skill_level, soft_skill_level, status")
    .order("created_at", { ascending: false });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold">用户管理</h1>
        <p className="mt-2 text-sm text-slate-600">
          调整角色、赛事等级、普通等级和基础 rating。
        </p>
      </div>
      <Card>
        <div className="grid gap-3">
          {(users || []).map((user) => (
            <form
              key={user.id}
              action={updateUserAdminFieldsAction}
              className="grid gap-3 rounded-lg border border-wire p-4 xl:grid-cols-[1fr_120px_130px_130px_130px_170px_170px_auto] xl:items-end"
            >
              <input type="hidden" name="user_id" value={user.id} />
              <div>
                <div className="font-bold">{user.display_name || "Unnamed"}</div>
                <div className="text-xs text-slate-500">{user.id}</div>
              </div>
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
                  defaultValue={user.tournament_rating ?? user.rating}
                />
              </label>
              <label className="label">
                普通 Rating
                <input
                  className="form-input"
                  type="number"
                  name="casual_rating"
                  defaultValue={user.casual_rating ?? user.rating}
                />
              </label>
              <label className="label">
                软镖 Rating
                <input
                  className="form-input"
                  type="number"
                  name="soft_rating"
                  defaultValue={user.soft_rating ?? user.rating}
                />
              </label>
              <label className="label">
                赛事等级
                <select
                  className="form-input"
                  name="tournament_skill_level"
                  defaultValue={user.tournament_skill_level ?? user.skill_level}
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                  <option value="Pro">Pro</option>
                </select>
              </label>
              <label className="label">
                普通等级
                <select
                  className="form-input"
                  name="casual_skill_level"
                  defaultValue={user.casual_skill_level ?? user.skill_level}
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                  <option value="Pro">Pro</option>
                </select>
              </label>
              <Button type="submit" variant="secondary">
                保存
              </Button>
            </form>
          ))}
          {(users || []).length === 0 ? (
            <p className="text-sm text-slate-600">暂无用户。</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
