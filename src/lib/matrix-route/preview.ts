import { verifiedMatrixDesktopSession } from "../matrix-auth/handler";
import { matrixAuthStore, type Query } from "../matrix-auth/store";

const workerPath = "/preview/v1/route";
const requestSize = 46;
const responseHeaderSize = 40;
const maxResponseSize = responseHeaderSize + 8192 * 5;
const routeMagic = 0x4d525431;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const baseHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export function routePreviewUnavailable() {
  return new Response(null, { status: 503, headers: baseHeaders });
}

function status(statusCode: number) {
  return new Response(null, { status: statusCode, headers: baseHeaders });
}

function workerEndpoint(value: string | undefined): URL | null {
  try {
    const endpoint = new URL(value?.trim() ?? "");
    if (endpoint.protocol === "https:" && endpoint.pathname === workerPath && !endpoint.username &&
        !endpoint.password && !endpoint.search && !endpoint.hash) return endpoint;
  } catch { /* An absent or malformed endpoint leaves the preview closed. */ }
  return null;
}

async function readCapped(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Buffer> {
  if (!body) throw new Error("Missing route body");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return Buffer.concat(chunks, size);
      size += chunk.value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw new Error("Route body exceeds limit");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function routePreview(request: Request, userId: string, query: Query,
                                   workerUrl: string | undefined, workerToken: string | undefined,
                                   send: typeof fetch = fetch) {
  try {
    if (!(await verifiedMatrixDesktopSession(request, userId, matrixAuthStore(query)))) return status(401);
  } catch {
    return routePreviewUnavailable();
  }
  const endpoint = workerEndpoint(workerUrl);
  const token = workerToken?.trim();
  if (!endpoint || !token || !tokenPattern.test(token)) return routePreviewUnavailable();
  if (request.headers.get("content-type") !== "application/octet-stream") return status(415);

  let input: Buffer;
  try {
    input = await readCapped(request.body, requestSize);
    if (input.length !== requestSize || input.readUInt32BE() !== routeMagic ||
        input[40] > 3 || input[40] !== input[45]) return status(400);
  } catch {
    return status(400);
  }

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8500)]);
  try {
    const response = await send(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", Authorization: "Bearer " + token },
      body: new Uint8Array(input),
      cache: "no-store",
      redirect: "error",
      signal,
    });
    if (!response.ok || response.headers.get("content-type") !== "application/octet-stream") {
      void response.body?.cancel().catch(() => {});
      return status(response.status === 422 ? 422 : 502);
    }
    const path = await readCapped(response.body, maxResponseSize);
    if (path.length < responseHeaderSize || !path.subarray(0, 36).equals(input.subarray(0, 36))) {
      return status(502);
    }
    const count = path.readUInt32BE(36);
    if (count === 0 || path.length !== responseHeaderSize + count * 5) return status(502);
    return new Response(new Uint8Array(path), {
      headers: { ...baseHeaders, "Content-Type": "application/octet-stream" },
    });
  } catch {
    return status(signal.aborted ? 504 : 502);
  }
}
