import { normalizeAvatarUrl } from "@/lib/storage/avatars";
import { cn } from "@/lib/utils";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const avatarSizeClass: Record<AvatarSize, string> = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-9 w-9 text-xs",
  md: "h-12 w-12 text-sm",
  lg: "h-16 w-16 text-lg",
  xl: "h-24 w-24 text-2xl"
};

const dotSizeClass: Record<AvatarSize, string> = {
  xs: "h-2 w-2",
  sm: "h-2.5 w-2.5",
  md: "h-3 w-3",
  lg: "h-4 w-4",
  xl: "h-5 w-5"
};

export function getAvatarTone(level?: number | null) {
  if (!level) return "border-slate-300 bg-slate-50 text-slate-700 ring-slate-200";
  if (level >= 95) return "border-sky-300 bg-slate-950 text-sky-100 ring-sky-300";
  if (level >= 83) return "border-indigo-300 bg-indigo-50 text-indigo-800 ring-indigo-200";
  if (level >= 70) return "border-rose-300 bg-rose-50 text-rose-800 ring-rose-200";
  if (level >= 55) return "border-amber-300 bg-amber-50 text-amber-800 ring-amber-200";
  if (level >= 40) return "border-cyan-300 bg-cyan-50 text-cyan-800 ring-cyan-200";
  if (level >= 20) return "border-emerald-300 bg-emerald-50 text-emerald-800 ring-emerald-200";
  return "border-slate-300 bg-slate-50 text-slate-700 ring-slate-200";
}

function avatarInitial(name: string) {
  const clean = name.trim();
  if (!clean) return "C";
  const first = Array.from(clean)[0] || "C";
  return /[a-z]/i.test(first) ? first.toUpperCase() : first;
}

export function PlayerAvatar({
  name,
  avatarUrl,
  level,
  size = "md",
  className
}: {
  name: string;
  avatarUrl?: string | null;
  level?: number | null;
  size?: AvatarSize;
  className?: string;
}) {
  const normalizedUrl = normalizeAvatarUrl(avatarUrl);

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full border-2 font-black shadow-sm ring-2 ring-offset-1 ring-offset-surface",
        avatarSizeClass[size],
        getAvatarTone(level),
        className
      )}
      aria-hidden
    >
      {normalizedUrl ? (
        <img src={normalizedUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <>
          <span className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(14,127,190,0.18),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.9),rgba(241,245,249,0.86))]" />
          <span className="relative">{avatarInitial(name)}</span>
          <span className={cn("absolute bottom-1 right-1 rounded-full bg-board", dotSizeClass[size])} />
        </>
      )}
    </span>
  );
}

export function PlayerIdentity({
  name,
  avatarUrl,
  level,
  subtitle,
  badge,
  size = "md",
  compact = false,
  className
}: {
  name: string;
  avatarUrl?: string | null;
  level?: number | null;
  subtitle?: string | null;
  badge?: string | null;
  size?: AvatarSize;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <PlayerAvatar name={name} avatarUrl={avatarUrl} level={level} size={size} />
      <span className="min-w-0">
        <span className={cn("block truncate font-black text-ink", compact ? "text-sm" : "text-base")}>{name}</span>
        {subtitle || badge ? (
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
            {badge ? (
              <span className="shrink-0 rounded-full bg-board/10 px-1.5 py-0.5 text-[10px] font-black text-board">
                {badge}
              </span>
            ) : null}
            {subtitle ? <span className="truncate text-xs font-semibold text-muted">{subtitle}</span> : null}
          </span>
        ) : null}
      </span>
    </span>
  );
}
