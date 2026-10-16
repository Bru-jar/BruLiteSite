import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { eq, sql } from "drizzle-orm";
import * as schema from "./db/schema";
import type { PublicKey } from "./client-proof";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { clientBody } from "./client-response";
import { credentialHash } from "./client-proof";

const fixture = vi.hoisted(() => ({
  db: null as unknown as PgliteDatabase<typeof schema>,
  cookie: undefined as string | undefined,
  adminRole: false,
}));
vi.mock("@/lib/db/client", () => ({
  db: new Proxy(
    {},
    {
      get: (_t, p) => {
        const value = Reflect.get(fixture.db, p);
        return typeof value === "function" ? value.bind(fixture.db) : value;
      },
    },
  ),
}));
vi.mock("@/lib/db/transaction", () => ({
  authTransaction: (work: Parameters<typeof fixture.db.transaction>[0]) =>
    fixture.db.transaction(work),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "brulite_session" && fixture.cookie
        ? { value: fixture.cookie }
        : undefined,
  }),
}));
vi.mock("@/lib/discord", () => ({
  getGuildMember: vi.fn(async () => ({
    roles: fixture.adminRole ? ["admin"] : [],
  })),
  memberIsAdmin: vi.fn((member: { roles: string[] }) =>
    member.roles.includes("admin"),
  ),
}));
import {
  createPairing,
  approvePairing,
  collectPairing,
  clientIdentity,
  clientEntitlement,
  refreshAccess,
  beginSession,
  renewSession,
  endSession,
  revokeDevice,
  versionAllowed,
  ClientError,
  withLicensedSession,
} from "./client-service";
import {
  createSessionToken,
  verifySessionToken,
  createOAuthState,
  verifyOAuthState,
  revokeWebSession,
  requireAdmin,
} from "./auth";
import { rateLimit } from "./rate-limit";

let pg: PGlite;
let userId: string;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let publicKey: PublicKey;
const origin = "https://brulite.test";
async function request(
  path: string,
  credential: string,
  method = "GET",
  scheme = "DPoP",
  proofId = randomUUID(),
) {
  const now = Math.floor(Date.now() / 1000);
  const proof = await new SignJWT({
    htm: method,
    htu: origin + path,
    ath: credentialHash(credential),
  })
    .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: publicKey })
    .setJti(proofId)
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(keys.privateKey);
  return new Request(origin + path, {
    method,
    headers: { authorization: scheme + " " + credential, dpop: proof },
  });
}
async function pair(name = "Desktop") {
  const p = await createPairing({ publicKey, deviceName: name });
  await approvePairing(p.code, userId);
  const result = await collectPairing(
    await request(
      "/api/client/pair/" + p.code,
      p.retrievalSecret,
      "GET",
      "Pair",
    ),
    p.code,
  );
  if (result.status !== "complete") throw new Error("pair did not finish");
  return result;
}
beforeAll(async () => {
  process.env.AUTH_SECRET = "test-only-secret-32-bytes-not-a-live-secret";
  process.env.NEXT_PUBLIC_APP_URL = origin;
  process.env.MIN_CLIENT_VERSION = "";
  pg = new PGlite();
  fixture.db = drizzle(pg, { schema });
  for (const file of readdirSync("drizzle")
    .filter((x) => /^\d+.*\.sql$/.test(x))
    .sort()) {
    await pg.exec(
      readFileSync("drizzle/" + file, "utf8").replaceAll(
        "--> statement-breakpoint",
        "",
      ),
    );
  }
});
afterAll(async () => {
  await pg?.close();
});
beforeEach(async () => {
  fixture.cookie = undefined;
  fixture.adminRole = false;
  await pg.exec("TRUNCATE users, oauth_attempts, auth_rate_limits CASCADE");
  await fixture.db
    .update(schema.licensePolicies)
    .set({ deviceLimit: 2, concurrentLimit: 2 });
  userId = randomUUID();
  await fixture.db
    .insert(schema.users)
    .values({ id: userId, discordId: "123456789", username: "Member" });
  await fixture.db
    .insert(schema.entitlements)
    .values({ userId, source: "manual", status: "active" });
  keys = await generateKeyPair("ES256");
  publicKey = (await exportJWK(keys.publicKey)) as PublicKey;
});

describe("browser authentication boundaries", () => {
  it("rejects OAuth state as a web session and web sessions as state", async () => {
    const nonce = "browser nonce";
    const state = await createOAuthState({}, nonce);
    expect(await verifySessionToken(state)).toBeNull();
    const token = await createSessionToken({
      userId,
      discordId: "123456789",
      username: "Member",
      avatar: null,
      isAdmin: false,
    });
    expect(await verifySessionToken(token)).toMatchObject({ userId });
    expect(await verifyOAuthState(token, nonce)).toBeNull();
    await revokeWebSession(token);
    expect(await verifySessionToken(token)).toBeNull();
  });
  it("rechecks current admin roles instead of trusting the session claim", async () => {
    fixture.cookie = await createSessionToken({
      userId,
      discordId: "123456789",
      username: "Admin",
      avatar: null,
      isAdmin: true,
    });
    fixture.adminRole = true;
    expect(await requireAdmin()).toMatchObject({ isAdmin: true });
    fixture.adminRole = false;
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  });
  it("binds state to the browser and consumes it only once", async () => {
    const state = await createOAuthState(
      { next: "//evil.test", pair: "ABCDEFGH" },
      "first",
    );
    expect(await verifyOAuthState(state, "other")).toBeNull();
    expect(await verifyOAuthState(state, "first")).toEqual({
      next: undefined,
      pair: "ABCDEFGH",
    });
    expect(await verifyOAuthState(state, "first")).toBeNull();
  });
  it("rejects expired state, tampering and missing browser state", async () => {
    const state = await createOAuthState({}, "nonce");
    expect(await verifyOAuthState(state, "")).toBeNull();
    expect(await verifyOAuthState(state + "bad", "nonce")).toBeNull();
    await pg.exec(
      "UPDATE oauth_attempts SET expires_at=now()-interval '1 second'",
    );
    expect(await verifyOAuthState(state, "nonce")).toBeNull();
  });
});
describe("pairing and installation identity", () => {
  it("requires the separate retrieval secret and matching private key", async () => {
    const p = await createPairing({ publicKey, deviceName: "Desktop" });
    await approvePairing(p.code, userId);
    await expect(
      collectPairing(
        new Request(origin + "/api/client/pair/" + p.code),
        p.code,
      ),
    ).rejects.toMatchObject({ code: "pair_secret_required" });
    const wrong = await request(
      "/api/client/pair/" + p.code,
      "A".repeat(43),
      "GET",
      "Pair",
    );
    await expect(collectPairing(wrong, p.code)).rejects.toMatchObject({
      code: "invalid_code",
    });
    const requestWithoutProof = new Request(
      origin + "/api/client/pair/" + p.code,
      { headers: { authorization: "Pair " + p.retrievalSecret } },
    );
    await expect(
      collectPairing(requestWithoutProof, p.code),
    ).rejects.toMatchObject({ code: "invalid_proof" });
  });
  it("delivers credentials once under concurrent collection and never stores raw tokens", async () => {
    const p = await createPairing({ publicKey, deviceName: "Desktop" });
    await approvePairing(p.code, userId);
    const requests = await Promise.all([
      request("/api/client/pair/" + p.code, p.retrievalSecret, "GET", "Pair"),
      request("/api/client/pair/" + p.code, p.retrievalSecret, "GET", "Pair"),
    ]);
    const results = await Promise.allSettled(
      requests.map((req) => collectPairing(req, p.code)),
    );
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const [row] = await fixture.db.select().from(schema.clientPairings);
    expect(row.pendingToken).toBeNull();
    expect(row.secretHash).toBeNull();
    expect(row.status).toBe("collected");
  });
  it("approves a pairing once even when the browser retries concurrently", async () => {
    const p = await createPairing({ publicKey, deviceName: "Desktop" });
    const results = await Promise.allSettled([
      approvePairing(p.code, userId),
      approvePairing(p.code, userId),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });
  it("expires approved but uncollected pairings", async () => {
    const p = await createPairing({ publicKey, deviceName: "Desktop" });
    await approvePairing(p.code, userId);
    await pg.exec(
      "UPDATE client_pairings SET expires_at=now()-interval '1 second'",
    );
    await expect(
      collectPairing(
        await request(
          "/api/client/pair/" + p.code,
          p.retrievalSecret,
          "GET",
          "Pair",
        ),
        p.code,
      ),
    ).rejects.toMatchObject({ code: "pair_expired" });
  });
  it("re-pairing the same key reuses its seat; different devices honor the plan cap", async () => {
    await pair();
    await pair();
    expect(await fixture.db.select().from(schema.clientDevices)).toHaveLength(
      1,
    );
    await fixture.db.update(schema.licensePolicies).set({ deviceLimit: 1 });
    keys = await generateKeyPair("ES256");
    publicKey = (await exportJWK(keys.publicKey)) as PublicKey;
    await expect(pair("Other desktop")).rejects.toMatchObject({
      code: "device_limit",
    });
  });
});
describe("request proofs and rotating credentials", () => {
  it("rejects replay, wrong HTTP targets and bearer-only requests", async () => {
    const p = await pair();
    const req = await request("/api/client/me", p.token);
    expect(await clientIdentity(req)).toMatchObject({ username: "Member" });
    await expect(clientIdentity(req)).rejects.toMatchObject({
      code: "proof_replayed",
    });
    await expect(
      clientIdentity(
        new Request(origin + "/api/client/me", {
          headers: { authorization: "DPoP " + p.token },
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_proof" });
    const wrong = await request("/api/client/other", p.token);
    await expect(
      clientIdentity(
        new Request(origin + "/api/client/me", { headers: wrong.headers }),
      ),
    ).rejects.toMatchObject({ code: "invalid_proof" });
  });
  it("rejects expired proofs, modified signatures and legacy bearer credentials", async () => {
    const p = await pair();
    const path = "/api/client/me";
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({
      htm: "GET",
      htu: origin + path,
      ath: credentialHash(p.token),
    })
      .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: publicKey })
      .setJti(randomUUID())
      .setIssuedAt(now - 120)
      .setExpirationTime(now - 60)
      .sign(keys.privateKey);
    await expect(
      clientIdentity(
        new Request(origin + path, {
          headers: { authorization: "DPoP " + p.token, dpop: expired },
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid_proof" });
    const req = await request(path, p.token);
    const headers = new Headers(req.headers);
    headers.set("dpop", "broken." + headers.get("dpop"));
    await expect(
      clientIdentity(new Request(req.url, { headers })),
    ).rejects.toMatchObject({ code: "invalid_proof" });
    const legacy = new Headers(req.headers);
    legacy.set("authorization", "Bearer " + p.token);
    await expect(
      clientIdentity(new Request(req.url, { headers: legacy })),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
  it("a stolen token with a different installation key is insufficient", async () => {
    const p = await pair();
    keys = await generateKeyPair("ES256");
    publicKey = (await exportJWK(keys.publicKey)) as PublicKey;
    await expect(
      clientIdentity(await request("/api/client/me", p.token)),
    ).rejects.toMatchObject({ code: "invalid_proof" });
  });
  it("rotates refresh tokens; reuse revokes the winning replacement family", async () => {
    const p = await pair();
    const path = "/api/client/refresh";
    const next = await refreshAccess(
      await request(path, p.refreshToken, "POST"),
      { refreshToken: p.refreshToken },
    );
    expect(next.token).not.toBe(p.token);
    await expect(
      clientIdentity(await request("/api/client/me", p.token)),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await expect(
      refreshAccess(await request(path, p.refreshToken, "POST"), {
        refreshToken: p.refreshToken,
      }),
    ).rejects.toMatchObject({ code: "refresh_reused" });
    await expect(
      clientIdentity(await request("/api/client/me", next.token)),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
  it("expires access and refresh credentials independently", async () => {
    const p = await pair();
    await pg.exec(
      "UPDATE license_tokens SET expires_at=now()-interval '1 second'",
    );
    await expect(
      clientIdentity(await request("/api/client/me", p.token)),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await pg.exec(
      "UPDATE client_refresh_tokens SET expires_at=now()-interval '1 second'",
    );
    await expect(
      refreshAccess(
        await request("/api/client/refresh", p.refreshToken, "POST"),
        { refreshToken: p.refreshToken },
      ),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
});
describe("server session leases", () => {
  it("enforces concurrent limits under simultaneous starts and releases capacity", async () => {
    const p = await pair();
    await fixture.db.update(schema.licensePolicies).set({ concurrentLimit: 1 });
    const start = async () =>
      beginSession(await request("/api/client/sessions", p.token, "POST"), {
        instanceId: randomUUID(),
        clientVersion: "0.3.6",
      });
    const results = await Promise.allSettled([start(), start()]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const success = results.find((x) => x.status === "fulfilled");
    if (success?.status !== "fulfilled") throw new Error("no session");
    await endSession(
      await request(
        "/api/client/sessions/" + success.value.sessionId,
        p.token,
        "DELETE",
      ),
      success.value.sessionId,
    );
    expect(await start()).toHaveProperty("sessionId");
  });
  it("does not resurrect expired leases and rejects revoked membership", async () => {
    const p = await pair();
    const session = await beginSession(
      await request("/api/client/sessions", p.token, "POST"),
      { instanceId: randomUUID(), clientVersion: "0.3.6" },
    );
    await pg.exec(
      "UPDATE client_sessions SET expires_at=now()-interval '1 second'",
    );
    await expect(
      renewSession(
        await request(
          "/api/client/sessions/" + session.sessionId,
          p.token,
          "POST",
        ),
        session.sessionId,
        { clientVersion: "0.3.6" },
      ),
    ).rejects.toMatchObject({ code: "session_expired" });
    await fixture.db
      .update(schema.entitlements)
      .set({ status: "revoked" })
      .where(eq(schema.entitlements.userId, userId));
    expect(
      await clientEntitlement(
        await request("/api/client/entitlement", p.token),
      ),
    ).toMatchObject({ entitled: false });
    await expect(
      beginSession(await request("/api/client/sessions", p.token, "POST"), {
        instanceId: randomUUID(),
        clientVersion: "0.3.6",
      }),
    ).rejects.toMatchObject({ code: "not_entitled" });
  });
  it("honors independent account overrides and device revocation", async () => {
    const p = await pair();
    await fixture.db.update(schema.users).set({ concurrentLimitOverride: 1 });
    const body = { instanceId: randomUUID(), clientVersion: "0.3.6" };
    const session = await beginSession(
      await request("/api/client/sessions", p.token, "POST"),
      body,
    );
    expect(
      await beginSession(
        await request("/api/client/sessions", p.token, "POST"),
        body,
      ),
    ).toMatchObject({ sessionId: session.sessionId });
    await revokeDevice(userId, p.deviceId);
    await expect(
      clientIdentity(await request("/api/client/me", p.token)),
    ).rejects.toBeInstanceOf(ClientError);
    expect(
      (await fixture.db.select().from(schema.clientSessions))[0].revokedAt,
    ).not.toBeNull();
  });
  it("consumes request proofs even when a paid operation is rejected", async () => {
    const p = await pair();
    await fixture.db.update(schema.licensePolicies).set({ concurrentLimit: 1 });
    const start = async () =>
      beginSession(await request("/api/client/sessions", p.token, "POST"), {
        instanceId: randomUUID(),
        clientVersion: "0.3.6",
      });
    await start();
    const req = await request("/api/client/sessions", p.token, "POST");
    const body = { instanceId: randomUUID(), clientVersion: "0.3.6" };
    await expect(beginSession(req, body)).rejects.toMatchObject({
      code: "concurrent_limit",
    });
    await pg.exec("UPDATE client_sessions SET revoked_at=now()");
    await expect(beginSession(req, body)).rejects.toMatchObject({
      code: "proof_replayed",
    });
  });
  it("requires a current lease on every protected server operation", async () => {
    const p = await pair();
    const session = await beginSession(
      await request("/api/client/sessions", p.token, "POST"),
      { instanceId: randomUUID(), clientVersion: "0.3.6" },
    );
    async function paid() {
      const signed = await request("/api/premium/example", p.token, "POST");
      const headers = new Headers(signed.headers);
      headers.set("x-brulite-session", session.sessionId);
      headers.set("x-brulite-version", "0.3.6");
      return new Request(signed.url, { method: "POST", headers });
    }
    expect(
      await withLicensedSession(await paid(), async () => "protected result"),
    ).toBe("protected result");
    await fixture.db.update(schema.entitlements).set({ status: "revoked" });
    await expect(
      withLicensedSession(await paid(), async () => "must not run"),
    ).rejects.toMatchObject({ code: "not_entitled" });
  });
  it("does not let another account renew a stolen session id", async () => {
    const p = await pair();
    const session = await beginSession(
      await request("/api/client/sessions", p.token, "POST"),
      { instanceId: randomUUID(), clientVersion: "0.3.6" },
    );
    userId = randomUUID();
    await fixture.db
      .insert(schema.users)
      .values({ id: userId, discordId: "987654321", username: "Other" });
    await fixture.db
      .insert(schema.entitlements)
      .values({ userId, source: "manual", status: "active" });
    const other = await pair();
    await expect(
      renewSession(
        await request(
          "/api/client/sessions/" + session.sessionId,
          other.token,
          "POST",
        ),
        session.sessionId,
        { clientVersion: "0.3.6" },
      ),
    ).rejects.toMatchObject({ code: "session_expired" });
  });
  it("resolves independent plan limits and account overrides", async () => {
    const p = await pair();
    await fixture.db
      .update(schema.entitlements)
      .set({ planInterval: "year", source: "stripe" });
    await fixture.db
      .update(schema.licensePolicies)
      .set({ deviceLimit: 4, concurrentLimit: 6 })
      .where(eq(schema.licensePolicies.plan, "yearly"));
    expect(
      await clientEntitlement(
        await request("/api/client/entitlement", p.token),
      ),
    ).toMatchObject({ deviceLimit: 4, concurrentLimit: 6 });
    await fixture.db
      .update(schema.users)
      .set({ deviceLimitOverride: 3, concurrentLimitOverride: 5 });
    expect(
      await clientEntitlement(
        await request("/api/client/entitlement", p.token),
      ),
    ).toMatchObject({ deviceLimit: 3, concurrentLimit: 5 });
  });
  it("checks the version floor at start and renewal", async () => {
    const p = await pair();
    process.env.MIN_CLIENT_VERSION = "0.3.7";
    try {
      await expect(
        beginSession(await request("/api/client/sessions", p.token, "POST"), {
          instanceId: randomUUID(),
          clientVersion: "0.3.6",
        }),
      ).rejects.toMatchObject({ code: "upgrade_required" });
    } finally {
      process.env.MIN_CLIENT_VERSION = "";
    }
    expect(versionAllowed("0.10.0", "0.9.0")).toBe(true);
    expect(versionAllowed("0.3.6", "invalid")).toBe(false);
  });
});
describe("request boundary protections", () => {
  it("blocks cross-origin cookie-authenticated mutations before calling the backend", async () => {
    const req = new NextRequest(origin + "/api/client/devices", {
      method: "DELETE",
      headers: {
        origin: "https://untrusted.test",
        cookie: "brulite_session=anything",
      },
    });
    expect((await proxy(req)).status).toBe(403);
    const noOrigin = new NextRequest(origin + "/api/client/devices", {
      method: "DELETE",
      headers: { cookie: "brulite_session=anything" },
    });
    expect((await proxy(noOrigin)).status).toBe(403);
    const sameOrigin = new NextRequest(origin + "/api/client/devices", {
      method: "DELETE",
      headers: { origin, cookie: "brulite_session=anything" },
    });
    expect((await proxy(sameOrigin)).headers.get("x-middleware-next")).toBe(
      "1",
    );
  });
  it("bounds authentication request bodies even without Content-Length", async () => {
    const req = new Request(origin + "/api/client/pair", {
      method: "POST",
      body: "x".repeat(9000),
    });
    await expect(clientBody(req)).rejects.toMatchObject({
      code: "body_too_large",
    });
    await expect(
      clientBody(new Request(origin, { method: "POST", body: "invalid json" })),
    ).rejects.toMatchObject({ code: "invalid_body" });
  });
});
describe("shared rate limits", () => {
  it("uses an atomic bucket under concurrent requests", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => rateLimit("one-account", 3, 60_000)),
    );
    expect(results.filter((x) => x.ok)).toHaveLength(3);
    expect((await rateLimit("another-account", 3, 60_000)).ok).toBe(true);
    await fixture.db.execute(
      sql`UPDATE auth_rate_limits SET resets_at=clock_timestamp()-interval '1 second'`,
    );
    expect((await rateLimit("one-account", 3, 60_000)).ok).toBe(true);
  });
});
