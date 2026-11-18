import { neon } from "@neondatabase/serverless";
import { readMatrixAuthConfig } from "@/lib/matrix-auth/handler";
import { routePreview, routePreviewUnavailable } from "@/lib/matrix-route/preview";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function POST(request: Request) {
  const config = readMatrixAuthConfig(process.env);
  const database = process.env.DATABASE_URL?.trim();
  if (typeof config === "string" || !database) return routePreviewUnavailable();

  const sql = neon(database, { fetchOptions: { signal: AbortSignal.timeout(2500) } });
  return routePreview(request, config.allowedUserId, (statement, parameters) => sql.query(statement, parameters),
    process.env.MATRIX_ROUTE_PREVIEW_WORKER_URL, process.env.MATRIX_ROUTE_PREVIEW_WORKER_TOKEN);
}
