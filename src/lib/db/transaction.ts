import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { NeonTransaction } from "drizzle-orm/neon-serverless";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import * as schema from "./schema";
import { env } from "@/lib/env";

export type AuthTransaction = NeonTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** Interactive transactions need a request-scoped WebSocket connection; HTTP db stays unchanged. */
export async function authTransaction<T>(
  work: (tx: AuthTransaction) => Promise<T>,
): Promise<T> {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
  });
  try {
    return await drizzle(pool, { schema }).transaction(work);
  } finally {
    await pool.end();
  }
}
