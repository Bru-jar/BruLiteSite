import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { ClientError } from "@/lib/client-service";
export async function clientResponse(
  work: () => Promise<unknown>,
  status = 200,
) {
  try {
    const body = await work();
    const pending =
      typeof body === "object" &&
      body !== null &&
      "status" in body &&
      body.status === "pending";
    return NextResponse.json(body, {
      status: pending ? 202 : status,
      headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
    });
  } catch (e) {
    const error =
      e instanceof ClientError
        ? e
        : new ClientError("service_unavailable", 503);
    if (!(e instanceof ClientError))
      console.error("Client authentication unavailable", {
        incident: randomUUID(),
      });
    return NextResponse.json(
      { error: error.code },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
/** Authentication bodies are small. Bound streamed bodies as well as advertised Content-Length. */
export async function clientBody(req: Request): Promise<unknown> {
  if (Number(req.headers.get("content-length") ?? 0) > 8192)
    throw new ClientError("body_too_large", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new ClientError("invalid_body", 400);
  const decoder = new TextDecoder();
  let text = "",
    size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new ClientError("body_too_large", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (e) {
    if (e instanceof ClientError) throw e;
    throw new ClientError("invalid_body", 400);
  } finally {
    reader.releaseLock();
  }
}
