import { NextResponse } from "next/server";
import { getBackendReadiness } from "@/lib/backend/provider";

export const runtime = "nodejs";

export async function GET() {
  const readiness = getBackendReadiness();

  return NextResponse.json({
    provider: readiness.provider,
    enabled: readiness.enabled,
    capabilities: readiness.capabilities,
    missingEnv: readiness.missingEnv
  });
}
