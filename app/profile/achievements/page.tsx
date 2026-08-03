import Link from "next/link";
import { ArrowLeft, Award, Lock, Sparkles, Trophy } from "lucide-react";
import { buildAchievements, summarizeAchievements, type AchievementTone } from "@/lib/achievements";
import { requireUser } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { SetupNotice } from "@/components/SetupNotice";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

const toneMap: Record<AchievementTone, string> = {
  board: "border-board/30 bg-sky-50 text-sky-950",
  green: "border-emerald-200 bg-emerald-50 text-emerald-950",
  gold: "border-amber-200 bg-amber-50 text-amber-950",
  violet: "border-violet-200 bg-violet-50 text-violet-950",
  rose: "border-rose-200 bg-rose-50 text-rose-950",
  slate: "border-slate-200 bg-slate-50 text-slate-950"
};

export default async function ProfileAchievementsPage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;

  const { user, profile } = await requireUser();
  const supabase = await createSupabaseServerClient();
  const [{ data: generalStats }, { data: tournamentStats }, { data: softStats }] = await Promise.all([
    supabase.from("general_user_stats").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("user_stats").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("soft_user_stats").select("*").eq("user_id", user.id).maybeSingle()
  ]);
  const achievements = buildAchievements({ generalStats, tournamentStats, softStats });
  const summary = summarizeAchievements(achievements);
  const categories = [...new Set(achievements.map((achievement) => achievement.category))];

  return (
    <div className="grid gap-5">
      <CodlPageHeader
        kicker={`UID ${profile?.uid || "------"}`}
        title="个人成就"
        description={`${profile?.display_name || user.email} 已解锁 ${summary.unlockedCount}/${summary.totalCount} 个 CODL 成就。`}
        icon={<Award className="h-6 w-6" aria-hidden />}
        art="white"
        actions={
          <Link
            className="inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg border border-wire bg-surface px-4 text-sm font-black text-board shadow-soft"
            href="/profile"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            返回个人页
          </Link>
        }
      />

      <section className="grid gap-3 md:grid-cols-[1fr_0.8fr]">
        <Card className="bg-primary text-white">
          <div className="flex items-center gap-2 text-board">
            <Trophy className="h-5 w-5" aria-hidden />
            <h2 className="text-lg font-black text-white">成就进度</h2>
          </div>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-6xl font-black text-board">{summary.completion}%</div>
              <div className="mt-2 text-sm font-bold text-white/55">
                {summary.unlockedCount} 个已解锁，{summary.totalCount - summary.unlockedCount} 个待冲击。
              </div>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-white/15 md:max-w-sm">
              <div className="h-full bg-board" style={{ width: `${summary.completion}%` }} />
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-board" aria-hidden />
            <h2 className="text-lg font-black">下一个目标</h2>
          </div>
          <div className="mt-4 grid gap-2">
            {summary.next.map((achievement) => (
              <div key={achievement.id} className="rounded-lg border border-wire bg-field p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-black">{achievement.title}</div>
                  <div className="text-sm font-black text-board">{achievement.progress}%</div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full bg-board" style={{ width: `${achievement.progress}%` }} />
                </div>
              </div>
            ))}
            {summary.next.length === 0 ? <p className="text-sm text-muted">已经全部解锁。</p> : null}
          </div>
        </Card>
      </section>

      <div className="grid gap-5">
        {categories.map((category) => (
          <section key={category} className="grid gap-3">
            <h2 className="text-xl font-black text-primary">{category}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {achievements
                .filter((achievement) => achievement.category === category)
                .map((achievement) => (
                  <AchievementCard key={achievement.id} achievement={achievement} />
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function AchievementCard({
  achievement
}: {
  achievement: ReturnType<typeof buildAchievements>[number];
}) {
  return (
    <div
      className={cn(
        "grid min-h-40 gap-4 rounded-lg border p-4 shadow-soft",
        achievement.unlocked ? toneMap[achievement.tone] : "border-wire bg-surface text-muted"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "grid h-14 w-14 shrink-0 place-items-center rounded-lg text-sm font-black",
            achievement.unlocked ? "bg-primary text-white" : "bg-field text-muted"
          )}
        >
          {achievement.unlocked ? achievement.badge : <Lock className="h-5 w-5" aria-hidden />}
        </span>
        <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-black">{achievement.category}</span>
      </div>
      <div>
        <h3 className="text-lg font-black">{achievement.title}</h3>
        <p className="mt-1 text-sm font-semibold opacity-75">{achievement.description}</p>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs font-black">
          <span>{Math.min(Math.round(achievement.current), achievement.target)} / {achievement.target}</span>
          <span>{achievement.progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/80">
          <div className={cn("h-full", achievement.unlocked ? "bg-board" : "bg-muted/30")} style={{ width: `${achievement.progress}%` }} />
        </div>
      </div>
    </div>
  );
}
