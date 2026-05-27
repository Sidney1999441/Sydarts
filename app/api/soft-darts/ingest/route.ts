import { NextResponse } from "next/server";
import { softGameOptions } from "@/lib/darts/variants";

export async function GET() {
  return NextResponse.json({
    status: "reserved",
    mode: "manual_only",
    supportedGames: softGameOptions.map((option) => option.value),
    message: "Soft dart machine ingestion is reserved for future providers. Use manual result entry for now."
  });
}

export async function POST() {
  return NextResponse.json(
    {
      status: "reserved",
      mode: "manual_only",
      message: "Soft dart machine ingestion is not enabled yet. Manual result entry remains the active workflow."
    },
    { status: 501 }
  );
}
