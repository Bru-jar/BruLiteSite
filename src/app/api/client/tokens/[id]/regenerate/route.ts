import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json(
    { error: "pairing_required" },
    { status: 426, headers: { "Cache-Control": "no-store" } },
  );
}
