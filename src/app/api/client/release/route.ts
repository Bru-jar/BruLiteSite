import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { releases } from "@/lib/db/schema";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * GET /api/client/release — latest bare-jar release metadata for the desktop
 * client's in-app auto-update. Unauthenticated on purpose: the jar alone
 * grants no BruLite features (entitlement is enforced server-side), and
 * unlicensed users must be able to update past the hard version gate.
 */
export async function GET(req: Request) {
  const rl = await rateLimit(`release-meta:${clientIp(req)}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const [release] = await db
    .select({ version: releases.version })
    .from(releases)
    .where(and(eq(releases.artifactType, "jar")))
    .orderBy(desc(releases.createdAt))
    .limit(1);

  if (!release) {
    return NextResponse.json({ error: "no_release" }, { status: 404 });
  }

  return NextResponse.json({
    version: release.version,
    jarUrl: "/api/download/jar",
  });
}
