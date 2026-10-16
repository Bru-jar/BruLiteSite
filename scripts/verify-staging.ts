/** Explicit, isolated Neon verification. Only synthetic records created by this run are mutated. */
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { validateStagingConfig } from "../src/lib/staging-config";
import { credentialHash, type PublicKey } from "../src/lib/client-proof";
import { hashToken } from "../src/lib/tokens";
import {
  createPairing,
  approvePairing,
  collectPairing,
  clientIdentity,
  beginSession,
  renewSession,
  refreshAccess,
  ClientError,
} from "../src/lib/client-service";

type Keys = Awaited<ReturnType<typeof generateKeyPair>>;
function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function pass(message: string) {
  console.log("PASS: " + message);
}
function oneWinner<T>(
  results: PromiseSettledResult<T>[],
  expectedError: string,
) {
  const successes = results.filter(
    (r): r is PromiseFulfilledResult<T> => r.status === "fulfilled",
  );
  const failures = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  ensure(
    successes.length === 1 && failures.length === 1,
    "Expected exactly one accepted request",
  );
  ensure(
    failures[0].reason instanceof ClientError &&
      failures[0].reason.code === expectedError,
    "Unexpected rejection in concurrent check",
  );
  return results.findIndex((r) => r.status === "fulfilled");
}
async function rejected(work: () => Promise<unknown>, code: string) {
  try {
    await work();
  } catch (error) {
    ensure(
      error instanceof ClientError && error.code === code,
      "Unexpected authentication rejection",
    );
    return;
  }
  throw new Error("Expected authentication rejection");
}
async function main() {
  const staging = validateStagingConfig(
    parse(readFileSync(".env.staging.local")),
    parse(readFileSync(".env.local")),
  );
  Object.assign(process.env, staging);
  process.env.MIN_CLIENT_VERSION = "";
  const sql = neon(staging.DATABASE_URL);
  const [database] =
    await sql`SELECT current_database()='brulite_auth_staging' AS isolated`;
  ensure(database?.isolated, "Unexpected staging database");
  const [history] =
    await sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`;
  ensure(history.count === 5, "Expected all five reviewed migrations");
  pass("isolated database and migration history");
  const userId = randomUUID();
  const codes: string[] = [];
  let inserted = false;
  const origin = staging.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  async function request(
    path: string,
    credential: string,
    keys: Keys,
    method = "GET",
    scheme = "DPoP",
  ) {
    const publicKey = (await exportJWK(keys.publicKey)) as PublicKey;
    const now = Math.floor(Date.now() / 1000);
    const proof = await new SignJWT({
      htm: method,
      htu: origin + path,
      ath: credentialHash(credential),
    })
      .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: publicKey })
      .setJti(randomUUID())
      .setIssuedAt(now)
      .setExpirationTime(now + 60)
      .sign(keys.privateKey);
    return new Request(origin + path, {
      method,
      headers: { authorization: scheme + " " + credential, dpop: proof },
    });
  }
  async function startPair(keys: Keys) {
    const pair = await createPairing({
      publicKey: await exportJWK(keys.publicKey),
      deviceName: "Synthetic staging verification",
    });
    codes.push(pair.code);
    await approvePairing(pair.code, userId);
    return pair;
  }
  async function collect(
    pair: Awaited<ReturnType<typeof createPairing>>,
    keys: Keys,
  ) {
    const result = await collectPairing(
      await request(
        "/api/client/pair/" + pair.code,
        pair.retrievalSecret,
        keys,
        "GET",
        "Pair",
      ),
      pair.code,
    );
    ensure(result.status === "complete", "Expected completed pairing");
    return result;
  }
  try {
    await sql`INSERT INTO users (id,discord_id,username,device_limit_override,concurrent_limit_override)
      VALUES (${userId},${"staging-verification-" + userId},'Synthetic staging verification',1,1)`;
    inserted = true;
    await sql`INSERT INTO entitlements (user_id,source,status) VALUES (${userId},'manual','active')`;
    const keys = await Promise.all([
      generateKeyPair("ES256"),
      generateKeyPair("ES256"),
    ]);
    const pairs = await Promise.all(keys.map(startPair));
    const collected = await Promise.allSettled(
      pairs.map((pair, i) => collect(pair, keys[i])),
    );
    const winner = oneWinner(collected, "device_limit");
    const won = collected[winner];
    ensure(won.status === "fulfilled", "Pairing result missing");
    let credentials = won.value;
    const key = keys[winner];
    const [deviceCount] =
      await sql`SELECT count(*)::int AS count FROM client_devices WHERE user_id=${userId} AND revoked_at IS NULL`;
    ensure(deviceCount.count === 1, "Device limit exceeded");
    pass("device allocation serialized across independent connections");
    const duplicate = await request("/api/client/me", credentials.token, key);
    oneWinner(
      await Promise.allSettled([
        clientIdentity(duplicate),
        clientIdentity(duplicate),
      ]),
      "proof_replayed",
    );
    pass("request proof accepted once across independent connections");
    const starts = await Promise.allSettled(
      [0, 1].map(async () =>
        beginSession(
          await request("/api/client/sessions", credentials.token, key, "POST"),
          { instanceId: randomUUID(), clientVersion: "0.3.6" },
        ),
      ),
    );
    oneWinner(starts, "concurrent_limit");
    const [sessionCount] =
      await sql`SELECT count(*)::int AS count FROM client_sessions WHERE user_id=${userId} AND revoked_at IS NULL AND expires_at>now()`;
    ensure(sessionCount.count === 1, "Concurrent client limit exceeded");
    pass("session allocation serialized across independent connections");
    const refreshed = await Promise.allSettled(
      [0, 1].map(async () =>
        refreshAccess(
          await request(
            "/api/client/refresh",
            credentials.refreshToken,
            key,
            "POST",
          ),
          { refreshToken: credentials.refreshToken },
        ),
      ),
    );
    const refreshWinner = oneWinner(refreshed, "refresh_reused");
    const replacement = refreshed[refreshWinner];
    ensure(replacement.status === "fulfilled", "Refresh result missing");
    await rejected(
      async () =>
        clientIdentity(
          await request("/api/client/me", replacement.value.token, key),
        ),
      "unauthorized",
    );
    const [liveFamilies] =
      await sql`SELECT count(*)::int AS count FROM client_refresh_tokens WHERE user_id=${userId} AND revoked_at IS NULL`;
    ensure(
      liveFamilies.count === 0,
      "Refresh reuse did not revoke replacement credentials",
    );
    pass("concurrent refresh reuse revokes the replacement family");
    credentials = await collect(await startPair(key), key);
    const lease = await beginSession(
      await request("/api/client/sessions", credentials.token, key, "POST"),
      { instanceId: randomUUID(), clientVersion: "0.3.6" },
    );
    await sql`UPDATE client_sessions SET expires_at=now()-interval '1 second' WHERE id=${lease.sessionId} AND user_id=${userId}`;
    await rejected(
      async () =>
        renewSession(
          await request(
            "/api/client/sessions/" + lease.sessionId,
            credentials.token,
            key,
            "POST",
          ),
          lease.sessionId,
          { clientVersion: "0.3.6" },
        ),
      "session_expired",
    );
    await sql`UPDATE entitlements SET status='revoked' WHERE user_id=${userId}`;
    await rejected(
      async () =>
        beginSession(
          await request("/api/client/sessions", credentials.token, key, "POST"),
          { instanceId: randomUUID(), clientVersion: "0.3.6" },
        ),
      "not_entitled",
    );
    pass("expired leases and revoked membership denied");
  } finally {
    for (const code of codes)
      await sql`DELETE FROM client_pairings WHERE code=${code}`;
    if (inserted) {
      await sql.transaction([
        sql`DELETE FROM client_proofs USING client_devices WHERE client_proofs.device_id=client_devices.id AND client_devices.user_id=${userId}`,
        sql`DELETE FROM client_sessions WHERE user_id=${userId}`,
        sql`DELETE FROM client_refresh_tokens WHERE user_id=${userId}`,
        sql`DELETE FROM license_tokens WHERE user_id=${userId}`,
        sql`DELETE FROM client_devices WHERE user_id=${userId}`,
        sql`DELETE FROM audit_log WHERE actor_user_id=${userId}`,
        sql`DELETE FROM users WHERE id=${userId}`,
        sql`DELETE FROM auth_rate_limits WHERE key IN (${hashToken("client:" + userId)},${hashToken("refresh-user:" + userId)})`,
      ]);
      const [remaining] =
        await sql`SELECT count(*)::int AS count FROM users WHERE id=${userId}`;
      ensure(
        remaining.count === 0,
        "Temporary staging fixture was not removed",
      );
      pass("temporary staging fixtures removed");
    }
  }
  console.log(
    "Staging verification completed. No Discord, Stripe or production operations were performed.",
  );
}
main().catch((error) => {
  console.error(
    error instanceof ClientError
      ? "Staging verification rejected: " + error.code
      : "Staging verification failed; inspect the isolated environment before continuing.",
  );
  process.exitCode = 1;
});
