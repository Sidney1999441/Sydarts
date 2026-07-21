create table if not exists public.site_theme_settings (
  id text primary key default 'default',
  platform_name text not null default 'SYDARTS',
  logo_url text,
  primary_color text not null default '#0b1220',
  board_color text not null default '#2563eb',
  accent_color text not null default '#f97316',
  background_color text not null default '#f7f9fc',
  surface_color text not null default '#ffffff',
  text_color text not null default '#0b1220',
  muted_text_color text not null default '#64748b',
  border_color text not null default '#d8e0ec',
  updated_at timestamptz not null default now(),
  constraint site_theme_settings_singleton check (id = 'default'),
  constraint site_theme_settings_primary_color_check check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint site_theme_settings_board_color_check check (board_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint site_theme_settings_accent_color_check check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint site_theme_settings_background_color_check check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint site_theme_settings_surface_color_check check (surface_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint site_theme_settings_text_color_check check (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint site_theme_settings_muted_text_color_check check (muted_text_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint site_theme_settings_border_color_check check (border_color ~ '^#[0-9A-Fa-f]{6}$')
);

insert into public.site_theme_settings (
  id,
  platform_name,
  primary_color,
  board_color,
  accent_color,
  background_color,
  surface_color,
  text_color,
  muted_text_color,
  border_color
) values (
  'default',
  'SYDARTS',
  '#0b1220',
  '#2563eb',
  '#f97316',
  '#f7f9fc',
  '#ffffff',
  '#0b1220',
  '#64748b',
  '#d8e0ec'
) on conflict (id) do nothing;

drop trigger if exists site_theme_settings_set_updated_at on public.site_theme_settings;
create trigger site_theme_settings_set_updated_at
before update on public.site_theme_settings
for each row execute function public.set_updated_at();

alter table public.site_theme_settings enable row level security;

drop policy if exists "Theme settings are public readable" on public.site_theme_settings;
create policy "Theme settings are public readable"
on public.site_theme_settings
for select using (true);

drop policy if exists "Admins can manage theme settings" on public.site_theme_settings;
create policy "Admins can manage theme settings"
on public.site_theme_settings
for all using (public.is_admin()) with check (public.is_admin());
