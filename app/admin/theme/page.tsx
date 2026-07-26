import { Palette, RotateCcw } from "lucide-react";
import { updateThemeSettingsAction } from "@/lib/actions/theme";
import { requireAdmin } from "@/lib/auth/guards";
import { hasSupabaseEnv } from "@/lib/env";
import { defaultSiteTheme } from "@/lib/theme";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

const colorFields = [
  ["primary_color", "顶部黑色", "primaryColor"],
  ["board_color", "主蓝色", "boardColor"],
  ["accent_color", "强调蓝色", "accentColor"],
  ["background_color", "页面背景", "backgroundColor"],
  ["surface_color", "卡片背景", "surfaceColor"],
  ["text_color", "正文颜色", "textColor"],
  ["muted_text_color", "辅助文字", "mutedTextColor"],
  ["border_color", "边框颜色", "borderColor"]
] as const;

export default async function AdminThemePage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const params = await searchParams;
  const theme = defaultSiteTheme;

  return (
    <div className="grid gap-6">
      <CodlPageHeader
        kicker="CODL Brand"
        title="品牌配置"
        description="CODL 专属视觉以黑、白、蓝为准；这里保留为维护主题配置和恢复默认值的入口。"
        icon={<Palette className="h-6 w-6" aria-hidden />}
        poster="white"
      />

      {params.saved ? (
        <div className="rounded-lg border border-board/30 bg-board/10 px-4 py-3 text-sm font-semibold text-board">
          主题已保存。
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <form action={updateThemeSettingsAction} className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="label">
                平台名称（配置值）
                <input className="form-input" name="platform_name" defaultValue={theme.platformName} maxLength={32} required />
              </label>
              <label className="label">
                LOGO 地址（配置值）
                <input
                  className="form-input"
                  name="logo_url"
                  defaultValue={theme.logoUrl || ""}
                  placeholder="https://... 或 /logo.png"
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {colorFields.map(([name, label, key]) => (
                <label key={name} className="label">
                  {label}
                  <span className="grid grid-cols-[56px_1fr] gap-2">
                    <input
                      aria-label={label}
                      className="h-11 w-14 cursor-pointer rounded-lg border border-wire bg-surface p-1"
                      type="color"
                      name={name}
                      defaultValue={theme[key]}
                    />
                    <span className="form-input grid items-center">{theme[key]}</span>
                  </span>
                </label>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-wire pt-5">
              <div className="text-sm text-muted">CODL 专属模式会优先使用默认品牌视觉；保存用于维护配置记录。</div>
              <div className="flex flex-wrap gap-2">
                <a
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-wire bg-surface px-4 py-2 text-sm font-semibold hover:bg-field"
                  href="/admin/theme"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  重置表单
                </a>
                <Button type="submit">保存主题</Button>
              </div>
            </div>
          </form>
        </Card>

        <Card>
          <div className="text-sm font-semibold text-muted">预览</div>
          <div className="mt-4 overflow-hidden rounded-lg border border-wire bg-field">
            <div className="flex items-center justify-between border-b border-wire bg-primary px-4 py-3 text-white">
              <div className="flex items-center gap-2 text-sm font-black tracking-[0.12em]">
                <img src="/codl/codl-mark-dark.png" alt="CODL logo" className="h-9 w-auto object-contain" />
              </div>
              <span className="rounded-full bg-surface/15 px-2 py-1 text-xs">Admin</span>
            </div>
            <div className="grid gap-3 p-4">
              <div className="rounded-lg border border-wire bg-surface p-4">
                <div className="text-lg font-bold text-ink">赛事管理</div>
                <p className="mt-1 text-sm text-muted">黑、白、蓝主题示例。</p>
                <div className="mt-4 flex gap-2">
                  <span className="rounded-lg bg-board px-3 py-2 text-sm font-semibold text-white">主按钮</span>
                  <span className="rounded-lg border border-wire px-3 py-2 text-sm font-semibold text-ink">次按钮</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Swatch value={theme.primaryColor} label="黑" />
                <Swatch value={theme.boardColor} label="蓝" />
                <Swatch value={theme.accentColor} label="强调" />
              </div>
            </div>
          </div>
          <form action={updateThemeSettingsAction} className="mt-4">
            <input type="hidden" name="platform_name" value={defaultSiteTheme.platformName} />
            <input type="hidden" name="logo_url" value={defaultSiteTheme.logoUrl || ""} />
            <input type="hidden" name="primary_color" value={defaultSiteTheme.primaryColor} />
            <input type="hidden" name="board_color" value={defaultSiteTheme.boardColor} />
            <input type="hidden" name="accent_color" value={defaultSiteTheme.accentColor} />
            <input type="hidden" name="background_color" value={defaultSiteTheme.backgroundColor} />
            <input type="hidden" name="surface_color" value={defaultSiteTheme.surfaceColor} />
            <input type="hidden" name="text_color" value={defaultSiteTheme.textColor} />
            <input type="hidden" name="muted_text_color" value={defaultSiteTheme.mutedTextColor} />
            <input type="hidden" name="border_color" value={defaultSiteTheme.borderColor} />
            <Button className="w-full" type="submit" variant="secondary">
              恢复默认主题
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function Swatch({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-wire bg-surface p-2">
      <div className="h-8 rounded-md" style={{ backgroundColor: value }} />
      <div className="mt-2 text-xs font-semibold text-muted">{label}</div>
    </div>
  );
}
