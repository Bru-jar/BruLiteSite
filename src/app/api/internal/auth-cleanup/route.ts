import { timingSafeEqual } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { NextResponse } from "next/server";
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = req.headers.get("authorization") ?? "";
  const expected = "Bearer " + (secret ?? "");
  if (
    !secret ||
    secret.length < 32 ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  )
    return new Response("Unauthorized", { status: 401 });
  await db.execute(sql`WITH a AS (DELETE FROM client_proofs WHERE expires_at<now()),
    b AS (DELETE FROM oauth_attempts WHERE expires_at<now()),
    c AS (DELETE FROM web_sessions WHERE expires_at<now()),
    d AS (DELETE FROM auth_rate_limits WHERE resets_at<now()-interval '1 day'),
    e AS (DELETE FROM client_pairings WHERE expires_at<now()) SELECT 1`);
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
