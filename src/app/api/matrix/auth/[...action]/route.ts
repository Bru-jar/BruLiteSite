import { neon } from "@neondatabase/serverless";
import { matrixAuthHandler, matrixAuthPath, readMatrixAuthConfig, unavailable } from "@/lib/matrix-auth/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const config = readMatrixAuthConfig(process.env);
  const database = process.env.MATRIX_DATABASE_URL?.trim();
  const health = request.method === "GET" && new URL(request.url).pathname === matrixAuthPath + "/health";
  if (typeof config === "string") return unavailable(health ? config : undefined);
  if (!database) return unavailable(health ? "MATRIX_DATABASE_URL" : undefined);
  try {
    const sql = neon(database);
    return await matrixAuthHandler(config, (statement, parameters) => sql.query(statement, parameters))(request);
  } catch {
    return unavailable(health ? "MATRIX_DATABASE_URL" : undefined);
  }
}

export const GET = handle;
export const POST = handle;
