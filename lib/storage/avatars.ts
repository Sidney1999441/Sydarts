import { getSupabaseUrl } from "@/lib/env";

export const avatarBucketName = "avatars";

const allowedAvatarFolders = new Set(["profiles", "saved-teams", "tournament-teams"]);

function encodePath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function isSafeAvatarStoragePath(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts.length >= 3 && allowedAvatarFolders.has(parts[0]) && !parts.some((part) => part === "." || part === "..");
}

export function buildAvatarPublicUrl(storagePath: string) {
  return `/api/storage/avatars/${encodePath(storagePath)}`;
}

export function normalizeAvatarUrl(value: string | null | undefined) {
  if (!value) return "";
  if (value.startsWith("/api/storage/avatars/")) return value;

  const supabaseBaseUrl = getSupabaseUrl().replace(/\/+$/, "");
  const publicPrefix = `${supabaseBaseUrl}/storage/v1/object/public/${avatarBucketName}/`;

  if (value.startsWith(publicPrefix)) {
    const storagePath = value.slice(publicPrefix.length);
    return isSafeAvatarStoragePath(storagePath) ? buildAvatarPublicUrl(storagePath) : value;
  }

  return value;
}
