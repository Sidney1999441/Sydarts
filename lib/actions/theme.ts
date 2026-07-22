"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { defaultSiteTheme, normalizeHexColor } from "@/lib/theme";
import { fromFormString } from "@/lib/utils";

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "颜色必须是 #RRGGBB 格式");

const logoUrlSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || null)
  .refine(
    (value) => !value || value.startsWith("/") || /^https?:\/\//i.test(value),
    "LOGO 地址需要是 https/http 链接或站内路径"
  );

const themeFormSchema = z.object({
  platform_name: z.string().trim().min(1, "平台名称不能为空").max(32, "平台名称最多 32 个字符"),
  logo_url: logoUrlSchema,
  primary_color: hexColorSchema,
  board_color: hexColorSchema,
  accent_color: hexColorSchema,
  background_color: hexColorSchema,
  surface_color: hexColorSchema,
  text_color: hexColorSchema,
  muted_text_color: hexColorSchema,
  border_color: hexColorSchema
});

export async function updateThemeSettingsAction(formData: FormData) {
  await requireAdmin();

  const parsed = themeFormSchema.parse({
    platform_name: fromFormString(formData.get("platform_name")) || defaultSiteTheme.platformName,
    logo_url: fromFormString(formData.get("logo_url")),
    primary_color: normalizeHexColor(
      fromFormString(formData.get("primary_color")),
      defaultSiteTheme.primaryColor
    ),
    board_color: normalizeHexColor(
      fromFormString(formData.get("board_color")),
      defaultSiteTheme.boardColor
    ),
    accent_color: normalizeHexColor(
      fromFormString(formData.get("accent_color")),
      defaultSiteTheme.accentColor
    ),
    background_color: normalizeHexColor(
      fromFormString(formData.get("background_color")),
      defaultSiteTheme.backgroundColor
    ),
    surface_color: normalizeHexColor(
      fromFormString(formData.get("surface_color")),
      defaultSiteTheme.surfaceColor
    ),
    text_color: normalizeHexColor(
      fromFormString(formData.get("text_color")),
      defaultSiteTheme.textColor
    ),
    muted_text_color: normalizeHexColor(
      fromFormString(formData.get("muted_text_color")),
      defaultSiteTheme.mutedTextColor
    ),
    border_color: normalizeHexColor(
      fromFormString(formData.get("border_color")),
      defaultSiteTheme.borderColor
    )
  });

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("site_theme_settings").upsert({
    id: "default",
    ...parsed,
    updated_at: new Date().toISOString()
  });

  if (error) throw new Error(error.message);

  revalidatePath("/", "layout");
  revalidatePath("/admin/theme");
  redirect("/admin/theme?saved=1");
}
