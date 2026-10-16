import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { hashToken } from "@/lib/tokens";

/** Shared atomic fixed-window buckets. Database errors propagate: no process-local fail-open fallback. */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  run: (statement: SQL) => Promise<Record<string, unknown>[]> = async (
    statement,
  ) => (await db.execute(statement)).rows,
): Promise<{ ok: boolean; retryAfterMs: number }> {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    !Number.isInteger(windowMs) ||
    windowMs < 1
  )
    throw new Error("Invalid rate limit");
  const rows =
    await run(sql`INSERT INTO auth_rate_limits (key, count, resets_at)
    VALUES (${hashToken(key)},1,clock_timestamp()+${windowMs}*interval '1 millisecond')
    ON CONFLICT (key) DO UPDATE SET
      count=CASE WHEN auth_rate_limits.resets_at<=clock_timestamp() THEN 1 ELSE LEAST(auth_rate_limits.count+1,${limit + 1}) END,
      resets_at=CASE WHEN auth_rate_limits.resets_at<=clock_timestamp() THEN clock_timestamp()+${windowMs}*interval '1 millisecond' ELSE auth_rate_limits.resets_at END
    RETURNING count, GREATEST(0,EXTRACT(EPOCH FROM (resets_at-clock_timestamp()))*1000) AS retry`);
  const row = rows[0];
  if (!row) throw new Error("Rate limit unavailable");
  return {
    ok: Number(row.count) <= limit,
    retryAfterMs: Math.ceil(Number(row.retry)),
  };
}
export function clientIp(req: Request): string {
  // Trust this header only behind the configured Vercel ingress; direct-origin access must be blocked.
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ||
    "unknown"
  );
}
