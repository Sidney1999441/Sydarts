import Link from "next/link";
import { ArrowLeft, IdCard, ShieldCheck } from "lucide-react";
import { updateRealNameProfileAction } from "@/lib/actions/users";
import { requireUser } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { formatDateTime } from "@/lib/utils";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { SetupNotice } from "@/components/SetupNotice";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

function maskIdCard(value?: string | null) {
  if (!value || value.length < 8) return "未填写";
  return `${value.slice(0, 4)}**********${value.slice(-4)}`;
}

export default async function RealNamePage() {
  if (!hasSupabaseEnv()) return <SetupNotice />;

  const { profile } = await requireUser();
  const isSubmitted = Boolean(profile?.real_name && profile?.id_card_number);

  return (
    <div className="grid gap-5">
      <CodlPageHeader
        kicker="Real Name"
        title="实名认证"
        description="实名资料用于赛事报名、现场身份核对和成绩归档。身份证号不会展示给其他选手。"
        icon={<IdCard className="h-6 w-6" aria-hidden />}
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

      {isSubmitted ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-emerald-600 text-white">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-emerald-950">实名资料已提交</h2>
              <p className="mt-1 text-sm font-semibold text-emerald-800">
                {profile?.real_name} · {maskIdCard(profile?.id_card_number)}
              </p>
              {profile?.real_name_submitted_at ? (
                <p className="mt-1 text-xs font-semibold text-emerald-700">
                  最近提交：{formatDateTime(profile.real_name_submitted_at)}
                </p>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      <Card>
        <form action={updateRealNameProfileAction} className="grid gap-4">
          <label className="label">
            真实姓名
            <input
              className="form-input"
              name="real_name"
              defaultValue={profile?.real_name || ""}
              autoComplete="name"
              maxLength={40}
              required
              placeholder="请输入身份证上的姓名"
            />
          </label>
          <label className="label">
            身份证号码
            <input
              className="form-input"
              name="id_card_number"
              defaultValue={profile?.id_card_number || ""}
              autoComplete="off"
              inputMode="text"
              maxLength={18}
              required
              placeholder="18 位身份证号码，末位 X 请大写或小写均可"
            />
          </label>
          <p className="rounded-lg bg-field p-3 text-xs font-semibold leading-5 text-muted">
            请填写本人真实信息。提交后可再次进入本页更新；管理员可用于现场核验，普通用户不可见。
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Link
              className="inline-flex min-h-12 touch-manipulation items-center justify-center rounded-lg border border-wire bg-surface px-5 text-sm font-black text-ink shadow-sm active:bg-field"
              href="/profile"
            >
              稍后再说
            </Link>
            <Button type="submit" pendingText="提交中">
              提交实名资料
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
