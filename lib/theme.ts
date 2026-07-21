import type { CSSProperties } from "react";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SiteThemeSettings = {
  platformName: string;
  logoUrl: string | null;
  primaryColor: string;
  boardColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
};

export const defaultSiteTheme: SiteThemeSettings = {
  platformName: "SYDARTS",
  logoUrl: null,
  primaryColor: "#0b1220",
  boardColor: "#2563eb",
  accentColor: "#f97316",
  backgroundColor: "#f7f9fc",
  surfaceColor: "#ffffff",
  textColor: "#0b1220",
  mutedTextColor: "#64748b",
  borderColor: "#d8e0ec"
};

type ThemeRow = {
  platform_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  board_color?: string | null;
  accent_color?: string | null;
  background_color?: string | null;
  surface_color?: string | null;
  text_color?: string | null;
  muted_text_color?: string | null;
  border_color?: string | null;
};

export async function getSiteThemeSettings(): Promise<SiteThemeSettings> {
  if (!hasSupabaseEnv()) return defaultSiteTheme;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("site_theme_settings")
      .select(
        "platform_name, logo_url, primary_color, board_color, accent_color, background_color, surface_color, text_color, muted_text_color, border_color"
      )
      .eq("id", "default")
      .maybeSingle();

    if (error || !data) return defaultSiteTheme;
    return normalizeThemeRow(data as ThemeRow);
  } catch {
    return defaultSiteTheme;
  }
}

export function normalizeThemeRow(row: ThemeRow): SiteThemeSettings {
  return {
    platformName: row.platform_name || defaultSiteTheme.platformName,
    logoUrl: row.logo_url || null,
    primaryColor: normalizeHexColor(row.primary_color, defaultSiteTheme.primaryColor),
    boardColor: normalizeHexColor(row.board_color, defaultSiteTheme.boardColor),
    accentColor: normalizeHexColor(row.accent_color, defaultSiteTheme.accentColor),
    backgroundColor: normalizeHexColor(row.background_color, defaultSiteTheme.backgroundColor),
    surfaceColor: normalizeHexColor(row.surface_color, defaultSiteTheme.surfaceColor),
    textColor: normalizeHexColor(row.text_color, defaultSiteTheme.textColor),
    mutedTextColor: normalizeHexColor(row.muted_text_color, defaultSiteTheme.mutedTextColor),
    borderColor: normalizeHexColor(row.border_color, defaultSiteTheme.borderColor)
  };
}

export function themeCssVariables(theme: SiteThemeSettings): CSSProperties {
  return {
    "--color-ink": hexToRgb(theme.textColor),
    "--color-field": hexToRgb(theme.backgroundColor),
    "--color-board": hexToRgb(theme.boardColor),
    "--color-wire": hexToRgb(theme.borderColor),
    "--color-accent": hexToRgb(theme.accentColor),
    "--color-surface": hexToRgb(theme.surfaceColor),
    "--color-muted": hexToRgb(theme.mutedTextColor),
    "--color-primary": hexToRgb(theme.primaryColor)
  } as CSSProperties;
}

export function normalizeHexColor(value: string | null | undefined, fallback: string) {
  const trimmed = (value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toLowerCase() : fallback;
}

function hexToRgb(hex: string) {
  const value = normalizeHexColor(hex, "#000000").slice(1);
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}
