import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { routePreview } from "./preview";

const account = "123456789012345678";
const desktop = "d".repeat(43);
const worker = "w".repeat(43);
const upstream = "https://worker.example/preview/v1/route";
const query = vi.fn(async () => [{ discord_id: account }]);
const packet = Buffer.alloc(46);
packet.writeUInt32BE(0x4d525431);

function request(token = desktop, bytes: Uint8Array = packet) {
  return new Request("https://www.matrixclient.net/api/matrix/routes/preview", {
    method: "POST", headers: {
      Authorization: "Bearer " + token, "Content-Type": "application/octet-stream",
    }, body: new Uint8Array(bytes),
  });
}

function response(size = 45) {
  const body = Buffer.alloc(size);
  packet.copy(body, 0, 0, 36);
  body.writeUInt32BE(1, 36);
  return new Response(new Uint8Array(body), { headers: { "Content-Type": "application/octet-stream" } });
}

describe("Matrix route preview", () => {
  it("authenticates the desktop and forwards only the worker credential and route bytes", async () => {
    const send = vi.fn<typeof fetch>(async () => response());
    const result = await routePreview(request(), account, query, upstream, worker, send);
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("expires_at > now()"),
      [createHash("sha256").update(desktop).digest("base64url")]);
    const [url, init] = send.mock.calls[0];
    expect(url.toString()).toBe(upstream);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer " + worker);
    expect(init?.redirect).toBe("error");
    expect(Buffer.from(init!.body as Uint8Array)).toEqual(packet);
  });

  it("rejects expired sessions and refuses insecure upstream configuration", async () => {
    const send = vi.fn<typeof fetch>();
    const expired = await routePreview(request(), account, async () => [], upstream, worker, send);
    expect(expired.status).toBe(401);
    const insecure = await routePreview(request(), account, query, upstream.replace("https:", "http:"), worker, send);
    expect(insecure.status).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an invalid request or a mismatched, oversized or failed worker response", async () => {
    const send = vi.fn<typeof fetch>(async () => response(41001));
    const malformed = await routePreview(request(desktop, Buffer.alloc(47)), account, query, upstream, worker, send);
    expect(malformed.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
    expect((await routePreview(request(), account, query, upstream, worker, send)).status).toBe(502);
    send.mockImplementationOnce(async () => new Response(null, { status: 422 }));
    expect((await routePreview(request(), account, query, upstream, worker, send)).status).toBe(422);
    const wrongVersion = Buffer.from(await response().arrayBuffer());
    wrongVersion[4] = 1;
    send.mockImplementationOnce(async () => new Response(new Uint8Array(wrongVersion),
      { headers: { "Content-Type": "application/octet-stream" } }));
    expect((await routePreview(request(), account, query, upstream, worker, send)).status).toBe(502);
  });
});
