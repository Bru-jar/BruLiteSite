import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { releases } from "@/lib/db/schema";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * GET /api/download/jar — streams the latest bare BruLite.jar for the
 * client's in-app auto-update. Unauthenticated: the jar alone grants no
 * BruLite features (entitlement is enforced server-side at launch), and
 * unlicensed users must be able to update past the hard version gate.
 */
export async function GET(req: Request) {
  const rl = await rateLimit(`jar-dl:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const [release] = await db
    .select()
    .from(releases)
    .where(and(eq(releases.artifactType, "jar")))
    .orderBy(desc(releases.createdAt))
    .limit(1);

  if (!release) {
    return NextResponse.json({ error: "no_release" }, { status: 404 });
  }

  const res = await fetch(release.blobUrl, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }

  return new Response(res.body, {
    headers: {
      "Content-Type": "application/java-archive",
      "Content-Disposition": `attachment; filename="${release.fileName}"`,
      "Cache-Control": "public, max-age=60",
    },
  });
}
