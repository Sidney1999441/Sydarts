import { NextRequest, NextResponse } from "next/server";
import { avatarBucketName, isSafeAvatarStoragePath } from "@/lib/storage/avatars";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const storagePath = path.map(decodeURIComponent).join("/");

  if (!isSafeAvatarStoragePath(storagePath)) {
    return errorResponse("Invalid avatar path.", 400);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage.from(avatarBucketName).download(storagePath);

  if (error || !data) {
    return errorResponse("Avatar not found.", 404);
  }

  const bytes = await data.arrayBuffer();
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": data.type || "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
}
