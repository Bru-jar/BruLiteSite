import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, test } from "vitest";
import { matrixAuthHandler, matrixAuthPath, readMatrixAuthConfig } from "./handler";
import type { Query } from "./store";

const config = {
  origin: "https://matrix.example",
  clientId: "111111111111111111",
  clientSecret: "synthetic-matrix-client-secret",
  allowedUserId: "222222222222222222",
};
const pg = new PGlite();
const query: Query = async (text, parameters) => (await pg.query<Record<string, unknown>>(text, parameters)).rows;
let discordId = config.allowedUserId;
let expectedChallenge: string | null;
let exchangeCalls = 0;
const getHandler = () => matrixAuthHandler(config, query, async (url, options) => {
  if (url.endsWith("/oauth2/token")) {
    exchangeCalls++;
    const body = options.body as URLSearchParams;
    expect(body.get("client_secret")).toBe(config.clientSecret);
    expect(body.get("redirect_uri")).toBe(config.origin + matrixAuthPath + "/callback");
    expect(createHash("sha256").update(body.get("code_verifier")!).digest("base64url")).toBe(expectedChallenge);
    return { access_token: "synthetic-token", scope: "identify", token_type: "Bearer" };
  }
  expect(url).toBe("https://discord.com/api/v10/users/@me");
  expect((options.headers as Record<string, string>).Authorization).toBe("Bearer synthetic-token");
  return { id: discordId };
});
const request = (path: string, method = "GET", headers?: Record<string, string>, body?: string) =>
  new Request(config.origin + matrixAuthPath + path, { method, headers, body });
const post = (path: string, authorization?: string) =>
  request(path, "POST", authorization ? { Authorization: authorization } : undefined);
const poll = (handle: string) => getHandler()(post("/desktop/poll", "Pair " + handle));

beforeAll(async () => { await pg.exec(readFileSync("scripts/matrix-auth.sql", "utf8")); });
afterAll(async () => { await pg.close(); });

async function start() {
  const response = await getHandler()(post("/desktop/start"));
  expect(response.status).toBe(200);
  const [handle, code, rawUrl] = (await response.text()).split("\n");
  const url = new URL(rawUrl);
  expect(url.origin + url.pathname).toBe("https://discord.com/oauth2/authorize");
  expect(url.searchParams.get("scope")).toBe("identify");
  expect(url.searchParams.get("redirect_uri")).toBe(config.origin + matrixAuthPath + "/callback");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(rawUrl).not.toContain(handle);
  expectedChallenge = url.searchParams.get("code_challenge");
  return { handle, code, state: url.searchParams.get("state")! };
}

const callback = (state: string, issuer = "https://discord.com") => getHandler()(request(
  "/callback?" + new URLSearchParams({ state, code: "synthetic-code", iss: issuer }),
));
const approve = (cookie: string, code: string, origin = config.origin) => getHandler()(request("/approve", "POST", {
  Cookie: cookie, Origin: origin, "Content-Type": "application/x-www-form-urlencoded",
}, "code=" + code));

test("configuration is HTTPS only and required variables fail closed", async () => {
  expect(readMatrixAuthConfig({})).toBe("MATRIX_DISCORD_CLIENT_ID");
  expect(readMatrixAuthConfig({
    MATRIX_AUTH_ORIGIN: "http://matrix.example",
    MATRIX_DISCORD_CLIENT_ID: config.clientId,
    MATRIX_DISCORD_CLIENT_SECRET: config.clientSecret,
    MATRIX_DISCORD_ALLOWED_USER_ID: config.allowedUserId,
  })).toBe("MATRIX_AUTH_ORIGIN");
  expect(readMatrixAuthConfig({
    MATRIX_AUTH_ORIGIN: config.origin + "/",
    MATRIX_DISCORD_CLIENT_ID: config.clientId,
    MATRIX_DISCORD_CLIENT_SECRET: config.clientSecret,
    MATRIX_DISCORD_ALLOWED_USER_ID: config.allowedUserId,
  })).toEqual(config);
  expect(await (await getHandler()(request("/health"))).text()).toBe("READY");
  expect((await getHandler()(request("/desktop/start", "POST", { Origin: "https://evil.example" }))).status).toBe(400);
  expect((await getHandler()(post("/desktop/poll"))).status).toBe(401);
});

test("health classifies a missing schema without disclosing database error text", async () => {
  const handler = matrixAuthHandler(config, async () => {
    throw Object.assign(new Error("private database detail"), { code: "42P01" });
  });
  const response = await handler(request("/health"));
  expect(response.status).toBe(503);
  expect(response.headers.get("x-matrix-auth-check")).toBe("database-schema");
  expect(await response.text()).toBe("Matrix authentication is unavailable.");
});

test("callback, browser confirmation and token claim are separate and single use across handlers", async () => {
  const pending = await start();
  expect(await (await poll(pending.handle)).text()).toBe("WAITING");
  expect((await callback("bogus")).status).toBe(400);

  const result = await callback(pending.state);
  expect(result.status).toBe(303);
  expect(result.headers.get("location")).toBe(matrixAuthPath + "/approve");
  expect((await callback(pending.state)).status).toBe(400);
  expect(await (await poll(pending.handle)).text()).toBe("APPROVAL");
  const setCookie = result.headers.get("set-cookie")!;
  expect(setCookie).toContain("HttpOnly; Secure; SameSite=Lax");
  const cookie = setCookie.split(";")[0];
  const page = await getHandler()(request("/approve", "GET", { Cookie: cookie }));
  expect(page.status).toBe(200);
  expect(await page.text()).toContain("Enter the six-digit code");

  expect((await approve(cookie, pending.code, "https://evil.example")).status).toBe(403);
  expect((await approve("", pending.code)).status).toBe(401);
  expect((await approve(cookie, "000000")).status).toBe(400);
  expect(await (await poll(pending.handle)).text()).toBe("APPROVAL");
  expect((await approve(cookie, pending.code)).status).toBe(303);
  expect((await approve(cookie, pending.code)).headers.get("location")).toBe(matrixAuthPath + "/complete");

  const claimed = await Promise.all([poll(pending.handle), poll(pending.handle)]);
  const bodies = await Promise.all(claimed.map(response => response.text()));
  expect(bodies.filter(value => value.startsWith("VERIFIED\n"))).toHaveLength(1);
  expect(bodies).toContain("EXPIRED");
  const session = bodies.find(value => value.startsWith("VERIFIED\n"))!.split("\n")[1];
  const bearer = { Authorization: "Bearer " + session };
  expect(await (await getHandler()(request("/session", "GET", bearer))).text()).toBe("VERIFIED\n" + config.allowedUserId);
  expect(await (await getHandler()(request("/session/revoke", "POST", bearer))).text()).toBe("REVOKED");
  expect((await getHandler()(request("/session", "GET", bearer))).status).toBe(401);
});

test("wrong account, unexpected issuer, cancelled and expired attempts stay closed", async () => {
  let pending = await start();
  let before = exchangeCalls;
  await callback(pending.state, "https://wrong.example");
  expect(exchangeCalls).toBe(before);
  expect(await (await poll(pending.handle)).text()).toBe("FAILED");

  pending = await start();
  discordId = "333333333333333333";
  before = exchangeCalls;
  const denied = await callback(pending.state);
  expect(denied.headers.get("location")).toBe(matrixAuthPath + "/complete");
  expect(denied.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(exchangeCalls).toBe(before + 1);
  expect(await (await poll(pending.handle)).text()).toBe("DENIED");
  discordId = config.allowedUserId;

  pending = await start();
  await getHandler()(post("/desktop/cancel", "Pair " + pending.handle));
  expect((await callback(pending.state)).status).toBe(400);
  expect(await (await poll(pending.handle)).text()).toBe("EXPIRED");

  pending = await start();
  await pg.exec("UPDATE matrix_auth.login_attempts SET expires_at = now() - interval '1 second'");
  expect((await callback(pending.state)).status).toBe(400);
  expect(await (await poll(pending.handle)).text()).toBe("EXPIRED");
});

test("five wrong browser codes close the pairing", async () => {
  const pending = await start();
  const cookie = (await callback(pending.state)).headers.get("set-cookie")!.split(";")[0];
  for (let n = 0; n < 4; n++) expect((await approve(cookie, "000000")).status).toBe(400);
  expect((await approve(cookie, "000000")).status).toBe(303);
  expect(await (await poll(pending.handle)).text()).toBe("FAILED");
});
