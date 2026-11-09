import { describe, expect, it, vi } from "vitest";
import { deliverMatrixPackage } from "./matrix-packages";

const name = "base.apk";
const size = 7299007;
const digest = "3e64464b6d1ba204283d97d5863faa7d8ec07cc44247ac541cc4af0894cb6214";
const url = "https://matrix.example/api/matrix/packages/osrs-242.2/" + name;
const authorization = "Bearer " + "a".repeat(43);
const request = () => new Request(url, { headers: { Authorization: authorization } });
const validSession = async () => new Response("VERIFIED\n123456789012345678");

describe("Matrix package delivery", () => {
  it("does not access storage with a missing or rejected session", async () => {
    const verify = vi.fn(async () => new Response(null, { status: 401 }));
    const read = vi.fn();
    expect((await deliverMatrixPackage(new Request(url), name, verify, read)).status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
    expect((await deliverMatrixPackage(request(), name, verify, read)).status).toBe(401);
    expect(verify).toHaveBeenCalledWith(authorization);
    expect(read).not.toHaveBeenCalled();
  });

  it("uses only the pinned private path and streams a non-cacheable response", async () => {
    const response = new Response(new Uint8Array([1, 2, 3]));
    const read = vi.fn(async () => ({ size, stream: response.body! }));
    const signedIn = request();
    const download = await deliverMatrixPackage(signedIn, name, validSession, read);
    expect(read).toHaveBeenCalledWith(`matrix/osrs-242.2/x86_64/${digest}/base.apk`, signedIn.signal);
    expect(download.status).toBe(200);
    expect(download.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("rejects unknown names and fails closed for a missing or wrong-sized object", async () => {
    const stream = new ReadableStream<Uint8Array>();
    const read = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ size: size - 1, stream });
    expect((await deliverMatrixPackage(request(), "../base.apk", validSession, read)).status).toBe(404);
    expect(read).not.toHaveBeenCalled();
    expect((await deliverMatrixPackage(request(), name, validSession, read)).status).toBe(503);
    expect((await deliverMatrixPackage(request(), name, validSession, read)).status).toBe(503);
  });
});
