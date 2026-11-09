import { neon } from "@neondatabase/serverless";
import { matrixAuthHandler, readMatrixAuthConfig, unavailable } from "@/lib/matrix-auth/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const config = readMatrixAuthConfig(process.env);
  const database = process.env.MATRIX_DATABASE_URL;
  if (!config || !database) return unavailable();
  try {
    const sql = neon(database);
    return await matrixAuthHandler(config, (statement, parameters) => sql.query(statement, parameters))(request);
  } catch {
    return unavailable();
  }
}

export const GET = handle;
export const POST = handle;
