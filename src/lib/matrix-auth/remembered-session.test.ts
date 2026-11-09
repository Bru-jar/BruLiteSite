import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, test } from "vitest";
import { matrixAuthHandler, matrixAuthPath, readMatrixAuthConfig } from "./handler";
import type { Query } from "./store";

const db = new PGlite();
const query: Query = async (statement, parameters) =>
  (await db.query<Record<string, unknown>>(statement, parameters)).rows;
const config = readMatrixAuthConfig({
  MATRIX_AUTH_ORIGIN: "https://matrix.example",
  MATRIX_DISCORD_CLIENT_ID: "111111111111111111",
  MATRIX_DISCORD_CLIENT_SECRET: "synthetic-matrix-client-secret",
  MATRIX_DISCORD_ALLOWED_USER_ID: "222222222222222222",
});
if (typeof config === "string") throw new Error(config);
const handler = matrixAuthHandler(config, query);
const hash = (value: string) => createHash("sha256").update(value).digest("base64url");

beforeAll(async () => { await db.exec(readFileSync("scripts/matrix-auth.sql", "utf8")); });
afterAll(async () => { await db.close(); });

test.each([true, false])("desktop claim applies the requested session lifetime (remembered: %s)", async (remember) => {
  const handle = (remember ? "R" : "T").repeat(43);
  await query(
    "INSERT INTO matrix_auth.login_attempts (id, approval_code_hash, phase, discord_id) VALUES ($1, 'fixture', 'VERIFIED', $2)",
    [hash(handle), "222222222222222222"],
  );
  const request = (path: string, method: string, headers: Record<string, string>) =>
    new Request(config.origin + matrixAuthPath + path, { method, headers });
  const response = await handler(request("/desktop/poll", "POST", {
    Authorization: "Pair " + handle,
    ...(remember ? { "X-Matrix-Remember-Me": "1" } : {}),
  }));
  expect(response.status).toBe(200);
  const [status, token] = (await response.text()).split("\n");
  expect(status).toBe("VERIFIED");
  const [row] = await query(
    "SELECT EXTRACT(EPOCH FROM expires_at - now()) AS seconds FROM matrix_auth.sessions WHERE token_hash = $1", [hash(token)],
  );
  const lifetime = remember ? 30 * 24 * 3600 : 3600;
  expect(Number(row.seconds)).toBeGreaterThan(lifetime - 5);
  expect(Number(row.seconds)).toBeLessThanOrEqual(lifetime);

  const bearer = { Authorization: "Bearer " + token };
  expect((await handler(request("/session", "GET", bearer))).status).toBe(200);
  if (remember) {
    expect(await (await handler(request("/session/revoke", "POST", bearer))).text()).toBe("REVOKED");
  } else {
    await query("UPDATE matrix_auth.sessions SET expires_at = now() WHERE token_hash = $1", [hash(token)]);
  }
  expect((await handler(request("/session", "GET", bearer))).status).toBe(401);
});
