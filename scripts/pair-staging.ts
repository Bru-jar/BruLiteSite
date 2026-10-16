/** Opt-in HTTP acceptance probe. Approve only its displayed code in the staging browser. */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { parse } from "dotenv";
import { neon } from "@neondatabase/serverless";
import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import { z } from "zod";
import { validateStagingConfig } from "../src/lib/staging-config";
import { credentialHash, publicKeySchema } from "../src/lib/client-proof";

const credentialsSchema = z.object({
  token: z.string().min(1),
  refreshToken: z.string().min(1),
  deviceId: z.uuid(),
  protocol: z.literal(2),
});
function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function pass(message: string) {
  console.log("PASS: " + message);
}
async function main() {
  const staging = validateStagingConfig(
    parse(readFileSync(".env.staging.local")),
    parse(readFileSync(".env.local")),
  );
  ensure(
    staging.NEXT_PUBLIC_APP_URL === "http://localhost:3001",
    "Probe requires local staging on port 3001",
  );
  if (process.argv.includes("--check")) {
    console.log(
      "Local staging probe configuration verified; no requests made.",
    );
    return;
  }
  const sql = neon(staging.DATABASE_URL);
  const keys = await generateKeyPair("ES256");
  const publicKey = publicKeySchema.parse(await exportJWK(keys.publicKey));
  const thumbprint = await calculateJwkThumbprint(publicKey, "sha256");
  const deviceName = "Staging HTTP probe " + randomUUID().slice(0, 8);
  const base = staging.NEXT_PUBLIC_APP_URL;
  async function proof(path: string, credential: string, method: string) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      htm: method,
      htu: base + path,
      ath: credentialHash(credential),
    })
      .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: publicKey })
      .setJti(randomUUID())
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .sign(keys.privateKey);
  }
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    credential?: string,
    scheme = "DPoP",
    existingProof?: string,
  ) {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (credential) {
      headers.Authorization = scheme + " " + credential;
      headers.DPoP = existingProof ?? (await proof(path, credential, method));
    }
    const response = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
    const data: unknown = await response.json();
    return { response, data };
  }
  function expectStatus(
    result: Awaited<ReturnType<typeof request>>,
    status = 200,
    code?: string,
  ) {
    ensure(
      result.response.status === status,
      "Unexpected HTTP status in staging probe",
    );
    ensure(
      result.response.headers.get("cache-control")?.includes("no-store"),
      "Credentials must not be cached",
    );
    if (code)
      ensure(
        z.object({ error: z.literal(code) }).safeParse(result.data).success,
        "Unexpected authentication rejection",
      );
  }
  let code: string | undefined;
  try {
    const created = await request("/api/client/pair", "POST", {
      publicKey,
      deviceName,
    });
    expectStatus(created);
    const pair = z
      .object({
        code: z.string().regex(/^[A-Za-z0-9_-]{8}$/),
        retrievalSecret: z.string().min(1),
        verifyUrl: z.string(),
        protocol: z.literal(2),
      })
      .parse(created.data);
    code = pair.code;
    ensure(
      pair.verifyUrl === base + "/auth/client?code=" + code,
      "Unexpected pairing destination",
    );
    console.log("Test device: " + deviceName);
    console.log("Compare this code in the browser: " + code);
    console.log("Open in your signed-in browser: " + pair.verifyUrl);
    console.log(
      "Waiting up to ten minutes for your staging approval. Private keys and credentials remain in memory.",
    );
    const path = "/api/client/pair/" + code;
    const deadline = Date.now() + 600_000;
    let credentials: z.infer<typeof credentialsSchema> | undefined;
    while (Date.now() < deadline) {
      const collected = await request(
        path,
        "GET",
        undefined,
        pair.retrievalSecret,
        "Pair",
      );
      if (collected.response.status === 202) {
        await delay(2500);
        continue;
      }
      expectStatus(collected);
      credentials = credentialsSchema.parse(collected.data);
      break;
    }
    ensure(credentials, "Pairing approval timed out; start a new probe");
    pass("browser-approved HTTP pairing and credential collection");
    expectStatus(
      await request("/api/client/me", "GET", undefined, credentials.token),
    );
    const membership = await request(
      "/api/client/entitlement",
      "GET",
      undefined,
      credentials.token,
    );
    expectStatus(membership);
    ensure(
      z
        .object({ entitled: z.literal(true), plan: z.literal("manual") })
        .safeParse(membership.data).success,
      "Active manual membership required for this probe",
    );
    pass("device identity and live manual licence check");
    const copied = await fetch(base + "/api/client/me", {
      headers: { Authorization: "DPoP " + credentials.token },
      signal: AbortSignal.timeout(20_000),
    });
    ensure(
      copied.status === 401,
      "Credential without private-key proof was accepted",
    );
    pass("copied access credential rejected without key proof");
    const replay = await proof("/api/client/me", credentials.token, "GET");
    expectStatus(
      await request(
        "/api/client/me",
        "GET",
        undefined,
        credentials.token,
        "DPoP",
        replay,
      ),
    );
    expectStatus(
      await request(
        "/api/client/me",
        "GET",
        undefined,
        credentials.token,
        "DPoP",
        replay,
      ),
      401,
      "proof_replayed",
    );
    pass("replayed signed HTTP request rejected");
    const version = staging.MIN_CLIENT_VERSION || "0.3.6";
    const started = await request(
      "/api/client/sessions",
      "POST",
      { instanceId: randomUUID(), clientVersion: version },
      credentials.token,
    );
    expectStatus(started);
    const session = z
      .object({ sessionId: z.uuid(), heartbeatAfter: z.literal(60) })
      .parse(started.data);
    expectStatus(
      await request(
        "/api/client/sessions/" + session.sessionId,
        "POST",
        { clientVersion: version },
        credentials.token,
      ),
    );
    const rotated = await request(
      "/api/client/refresh",
      "POST",
      { refreshToken: credentials.refreshToken },
      credentials.refreshToken,
    );
    expectStatus(rotated);
    const fresh = credentialsSchema.parse(rotated.data);
    expectStatus(
      await request("/api/client/me", "GET", undefined, credentials.token),
      401,
      "unauthorized",
    );
    expectStatus(
      await request(
        "/api/client/sessions/" + session.sessionId,
        "POST",
        { clientVersion: version },
        fresh.token,
      ),
    );
    pass(
      "session lease, heartbeat and credential rotation through HTTP routes",
    );
    expectStatus(
      await request(
        "/api/client/sessions/" + session.sessionId,
        "DELETE",
        undefined,
        fresh.token,
      ),
    );
    expectStatus(
      await request("/api/client/revoke", "POST", undefined, fresh.token),
    );
    expectStatus(
      await request("/api/client/me", "GET", undefined, fresh.token),
      401,
      "unauthorized",
    );
    pass("session end, client sign-out and revoked credential rejection");
  } finally {
    // Scope every cleanup mutation to this run's random installation key; preserve the user's account and licence.
    await sql.transaction([
      sql`update license_tokens set revoked_at=coalesce(revoked_at,now()) where device_id in (select id from client_devices where key_thumbprint=${thumbprint} and name=${deviceName})`,
      sql`update client_refresh_tokens set revoked_at=coalesce(revoked_at,now()) where device_id in (select id from client_devices where key_thumbprint=${thumbprint} and name=${deviceName})`,
      sql`update client_sessions set revoked_at=coalesce(revoked_at,now()) where device_id in (select id from client_devices where key_thumbprint=${thumbprint} and name=${deviceName})`,
      sql`update client_devices set revoked_at=coalesce(revoked_at,now()) where key_thumbprint=${thumbprint} and name=${deviceName}`,
      sql`update client_pairings set status='expired',secret_hash=null where code=${code ?? ""} and public_key->>'x'=${publicKey.x} and public_key->>'y'=${publicKey.y}`,
    ]);
    console.log(
      "Probe installation/credentials revoked and pairing closed; account and membership preserved.",
    );
  }
}
main().catch(() => {
  console.error(
    "Staging HTTP probe did not complete. Check local server, matching-code approval and membership; no credentials displayed.",
  );
  process.exitCode = 1;
});
