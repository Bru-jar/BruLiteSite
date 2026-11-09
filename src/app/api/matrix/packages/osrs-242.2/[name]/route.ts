import { neon } from "@neondatabase/serverless";
import { get, head } from "@vercel/blob";
import { matrixAuthHandler, matrixAuthPath, readMatrixAuthConfig, unavailable } from "@/lib/matrix-auth/handler";
import { deliverMatrixPackage } from "@/lib/matrix-packages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function blobStoreId(token?: string) {
  return /^vercel_blob_rw_([A-Za-z0-9]+)_/.exec(token?.trim() ?? "")?.[1].toLowerCase();
}

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return deliverMatrixPackage(request, name, async authorization => {
    const config = readMatrixAuthConfig(process.env);
    const database = process.env.DATABASE_URL?.trim();
    if (typeof config === "string" || !database) return unavailable();
    const sql = neon(database);
    const verify = matrixAuthHandler(config, (statement, values) => sql.query(statement, values));
    return verify(new Request(new URL(matrixAuthPath + "/session", request.url), {
      headers: { Authorization: authorization },
    }));
  }, async (pathname, abortSignal) => {
    // Use a dedicated private store. The BruLite image proxy uses a different store's token.
    const token = process.env.MATRIX_PACKAGE_READ_WRITE_TOKEN?.trim();
    const store = blobStoreId(token);
    if (!token || !store || store === blobStoreId(process.env.BLOB_READ_WRITE_TOKEN)) return null;
    const options = { token, abortSignal };
    const metadata = await head(pathname, options);
    const object = await get(pathname, { ...options, access: "private", useCache: false });
    if (object?.statusCode !== 200) return null;
    return { stream: object.stream, size: metadata.size };
  });
}
