import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import {
  betaPath, callbackPath, hash, oauthCookie, readBetaAccess, readInviteUrl,
  readWebConfig, sessionCookie, webSessions,
} from "./auth";
import { discord } from "./discord";
import { finishOAuth, signOut, startOAuth } from "./routes";

const member = "222222222222222222";
const nonMember = "333333333333333333";
const env = {
  MATRIX_WEB_ORIGIN: "https://matrix.example",
  MATRIX_WEB_DISCORD_CLIENT_ID: "111111111111111111",
  MATRIX_WEB_DISCORD_CLIENT_SECRET: "synthetic-discord-secret",
  MATRIX_WEB_DATABASE_URL: "postgresql://synthetic@matrix.example/preview",
  MATRIX_WEB_DISCORD_GUILD_ID: "444444444444444444",
  MATRIX_WEB_DISCORD_BOT_TOKEN: "synthetic-discord-bot-token",
  MATRIX_WEB_DISCORD_INVITE_URL: "https://discord.gg/matrix-preview-example",
};
const config = readWebConfig(env)!;
const pg = new PGlite();
const sessions = (settings = config) => webSessions(settings, async (sql, parameters) =>
  (await pg.query<Record<string, unknown>>(sql, parameters)).rows,
);

beforeAll(async () => {
  await pg.exec(readFileSync("scripts/matrix-web.sql", "utf8"));
  await pg.exec(readFileSync("scripts/matrix-auth.sql", "utf8"));
});
afterAll(() => pg.close());

function start() {
  const response = startOAuth(new NextRequest(config.origin + "/matrix/oauth/start"), config);
  expect(response.status).toBe(303);
  const authorize = new URL(response.headers.get("location")!);
  expect(authorize.origin).toBe(discord);
  expect(authorize.searchParams.get("scope")).toBe("identify");
  expect(authorize.searchParams.get("redirect_uri")).toBe(config.origin + callbackPath);
  expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
  expect(response.cookies.get(oauthCookie)).toMatchObject({
    secure: true, httpOnly: true, path: "/", sameSite: "lax", maxAge: 600,
  });
  return {
    state: authorize.searchParams.get("state")!,
    challenge: authorize.searchParams.get("code_challenge")!,
    cookie: response.cookies.get(oauthCookie)!.value,
  };
}

function callback(state: string, cookie?: string, issuer = discord) {
  return new NextRequest(config.origin + callbackPath + "?" + new URLSearchParams({
    state, code: "synthetic-code", iss: issuer,
  }), { headers: cookie ? { Cookie: oauthCookie + "=" + cookie } : {} });
}

function membershipLookup(id: string, response: Response) {
  return vi.fn(async (path: string, options: RequestInit) => {
    expect(path).toBe(`/guilds/${config.guildId}/members/${id}`);
    expect(options.headers).toEqual({ Authorization: "Bot " + config.botToken });
    return response;
  });
}

function provider(id: string, challenge: string, membership = new Response(null, { status: 200 })) {
  const lookup = membershipLookup(id, membership);
  return vi.fn(async (path: string, options: RequestInit) => {
    if (path === "/oauth2/token") {
      const body = options.body as URLSearchParams;
      expect(body.get("redirect_uri")).toBe(config.origin + callbackPath);
      expect(hash(body.get("code_verifier")!)).toBe(challenge);
      return Response.json({ access_token: "synthetic-token", token_type: "Bearer", scope: "identify" });
    }
    if (path === "/users/@me") {
      expect(options.headers).toEqual({ Authorization: "Bearer synthetic-token" });
      return Response.json({ id, global_name: "Discord Member" });
    }
    return lookup(path, options);
  });
}

test("requires a Matrix web guild, bot, and valid Discord invite", () => {
  expect(readWebConfig({ MATRIX_DISCORD_ALLOWED_USER_ID: member })).toBeNull();
  expect(readWebConfig({ ...env, MATRIX_WEB_DISCORD_GUILD_ID: "bad" })).toBeNull();
  expect(readWebConfig({ ...env, MATRIX_WEB_DISCORD_BOT_TOKEN: "" })).toBeNull();
  expect(readWebConfig({ ...env, MATRIX_WEB_DISCORD_INVITE_URL: "" })).toBeNull();
  expect(readInviteUrl({ ...env, MATRIX_WEB_DISCORD_INVITE_URL: "https://discord.gg.evil.example/invite" })).toBeNull();
  expect(readInviteUrl({ ...env, MATRIX_WEB_DISCORD_INVITE_URL: "https://discord.com/invite/matrix" }))
    .toBe("https://discord.com/invite/matrix");
  expect(readWebConfig({ ...env, MATRIX_WEB_ORIGIN: "http://example.com" })).toBeNull();
  expect(startOAuth(new NextRequest(config.origin + "/matrix/oauth/start"), null)
    .headers.get("location")).toBe("/matrix?status=unavailable");
});

test("rejects mismatched, missing, expired, and wrong-issuer callbacks before contacting Discord", async () => {
  const attempt = start();
  const getDiscord = provider(member, attempt.challenge);
  const requests = [
    callback(start().state, attempt.cookie),
    callback(attempt.state),
    callback(attempt.state, attempt.cookie, "https://wrong.example"),
  ];
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 600_000);
  try {
    requests.push(callback(attempt.state, attempt.cookie));
    for (const request of requests) {
      const response = await finishOAuth(request, config, sessions(), getDiscord);
      expect(response.headers.get("location")).toBe("/matrix?status=expired");
    }
  } finally {
    vi.restoreAllMocks();
  }
  expect(getDiscord).not.toHaveBeenCalled();
});

test("a non-member is prompted to join and can sign in once they join", async () => {
  const { state, cookie, challenge } = start();
  const getDiscord = provider(nonMember, challenge, Response.json({ code: 10007 }, { status: 404 }));
  const response = await finishOAuth(callback(state, cookie), config, sessions(), getDiscord);
  expect(getDiscord).toHaveBeenCalledTimes(3);
  expect(response.headers.get("location")).toBe("/matrix?status=not_member");
  expect(response.cookies.has(sessionCookie)).toBe(false);

  const retry = start();
  const joined = await finishOAuth(callback(retry.state, retry.cookie), config, sessions(),
    provider(nonMember, retry.challenge));
  expect(joined.headers.get("location")).toBe(betaPath);
});

test.each([[404, 10004], [403, 50001], [429, 0], [503, 0]])(
  "Discord lookup failure (%s, %s) denies access with an unavailable status",
  async (status, code) => {
    const { state, cookie, challenge } = start();
    const getDiscord = provider(member, challenge, Response.json({ code }, { status }));
    const response = await finishOAuth(callback(state, cookie), config, sessions(), getDiscord);
    expect(response.headers.get("location")).toBe("/matrix?status=unavailable");
    expect(response.cookies.has(sessionCookie)).toBe(false);
  },
);

test("regular members gain access, membership is rechecked, and sign-out revokes the session", async () => {
  const { state, cookie, challenge } = start();
  const response = await finishOAuth(callback(state, cookie), config, sessions(), provider(member, challenge));
  expect(response.headers.get("location")).toBe(betaPath);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.cookies.get(oauthCookie)?.maxAge).toBe(0);
  expect(response.cookies.get(sessionCookie)).toMatchObject({
    secure: true, httpOnly: true, path: "/", sameSite: "lax", maxAge: 3600,
  });
  const token = response.cookies.get(sessionCookie)!.value;
  expect(await readBetaAccess(config, token, sessions(), membershipLookup(member, new Response(null))))
    .toEqual({ status: "member", session: { discordId: member, displayName: "Discord Member" } });
  expect(await readBetaAccess(config, token, sessions(),
    membershipLookup(member, Response.json({ code: 10007 }, { status: 404 }))))
    .toEqual({ status: "not_member" });
  expect(await sessions({ ...config, origin: "https://other.example" }).read(token)).toBeNull();
  expect((await pg.query("SELECT 1 FROM matrix_auth.sessions WHERE token_hash = $1", [hash(token)])).rows)
    .toHaveLength(0);

  const logout = (origin: string) => new NextRequest(config.origin + "/matrix/signout", {
    method: "POST", headers: { Origin: origin, Cookie: sessionCookie + "=" + token },
  });
  expect((await signOut(logout("https://wrong.example"), config, sessions())).status).toBe(403);
  expect(await sessions().read(token)).not.toBeNull();
  const signedOut = await signOut(logout(config.origin), config, sessions());
  expect(signedOut.headers.get("location")).toBe("/matrix?status=signed_out");
  expect(signedOut.cookies.get(sessionCookie)?.maxAge).toBe(0);
  expect(await sessions().read(token)).toBeNull();
});
