import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { licenseTokens } from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
/** Unbound copy/paste credentials are retired: keys are enrolled by browser pairing. */
export async function POST() {
  return NextResponse.json(
    { error: "pairing_required" },
    { status: 426, headers: { "Cache-Control": "no-store" } },
  );
}
export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const tokens = await db
    .select({
      id: licenseTokens.id,
      label: licenseTokens.label,
      createdAt: licenseTokens.createdAt,
      expiresAt: licenseTokens.expiresAt,
      revokedAt: licenseTokens.revokedAt,
      deviceId: licenseTokens.deviceId,
    })
    .from(licenseTokens)
    .where(eq(licenseTokens.userId, session.userId))
    .orderBy(desc(licenseTokens.createdAt));
  return NextResponse.json(
    { tokens },
    { headers: { "Cache-Control": "no-store" } },
  );
}
