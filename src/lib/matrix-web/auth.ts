import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { Query } from "@/lib/matrix-auth/store";
import { discordRequest, guildMembership, isDiscordId } from "./discord";

export const landingPath = "/matrix";
export const betaPath = "/matrix/beta";
export const callbackPath = "/matrix/oauth/callback";
export const sessionCookie = "__Host-matrix-web";
export const oauthCookie = "__Host-matrix-web-oauth";
export const sessionSeconds = 3600;
export const oauthSeconds = 600;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
export const randomToken = () => randomBytes(32).toString("base64url");
export const hash = (value: string) => createHash("sha256").update(value).digest("base64url");

type Env = Readonly<Record<string, string | undefined>>;

export function readInviteUrl(env: Env = process.env) {
  const invite = env.MATRIX_WEB_DISCORD_INVITE_URL?.trim();
  return invite && /^https:\/\/(?:discord\.gg\/|discord\.com\/invite\/)[A-Za-z0-9_-]+\/?$/.test(invite)
    ? invite
    : null;
}

export function readWebConfig(env: Env = process.env) {
  const origin = env.MATRIX_WEB_ORIGIN?.trim().replace(/\/$/, "");
  const clientId = env.MATRIX_WEB_DISCORD_CLIENT_ID?.trim();
  const clientSecret = env.MATRIX_WEB_DISCORD_CLIENT_SECRET?.trim();
  const database = env.MATRIX_WEB_DATABASE_URL?.trim();
  const guildId = env.MATRIX_WEB_DISCORD_GUILD_ID?.trim();
  const botToken = env.MATRIX_WEB_DISCORD_BOT_TOKEN?.trim();
  if (!origin || !isDiscordId(clientId) || !clientSecret || !database ||
      !isDiscordId(guildId) || !botToken || !readInviteUrl(env)) return null;
  try {
    const url = new URL(origin);
    if (origin !== url.origin || (url.protocol !== "https:" &&
        !(url.protocol === "http:" && url.hostname === "localhost"))) return null;
  } catch {
    return null;
  }
  return { origin, clientId, clientSecret, database, guildId, botToken };
}

export type WebConfig = NonNullable<ReturnType<typeof readWebConfig>>;

export function stateFor(config: WebConfig, attempt: string) {
  return createHmac("sha256", config.clientSecret)
    .update(`matrix-web-oauth:\n${config.origin}\n${attempt}`)
    .digest("base64url");
}

export function verifyAttempt(config: WebConfig, attempt: string, state: string) {
  const match = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(attempt);
  if (!match || !tokenPattern.test(state)) return null;
  const age = Math.floor(Date.now() / 1000) - Number(match[1]);
  if (age < 0 || age >= oauthSeconds) return null;
  return timingSafeEqual(Buffer.from(state), Buffer.from(stateFor(config, attempt)))
    ? match[2]
    : null;
}

export function webSessions(config: WebConfig, query?: Query) {
  const run: Query = query ?? ((statement, parameters) => neon(config.database).query(statement, parameters));
  return {
    async create(discordId: string, displayName: string) {
      const token = randomToken();
      await run(
        `WITH expired AS (DELETE FROM matrix_web.sessions WHERE expires_at <= now())
         INSERT INTO matrix_web.sessions (token_hash, origin, discord_id, display_name, expires_at)
         VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5))`,
        [hash(token), config.origin, discordId, displayName, sessionSeconds],
      );
      return token;
    },
    async read(token: string | undefined) {
      if (!token || !tokenPattern.test(token)) return null;
      const [row] = await run(
        `SELECT discord_id, display_name FROM matrix_web.sessions
         WHERE token_hash = $1 AND origin = $2 AND expires_at > now()`,
        [hash(token), config.origin],
      );
      if (!isDiscordId(row?.discord_id) || typeof row.display_name !== "string") return null;
      return { discordId: row.discord_id, displayName: row.display_name };
    },
    async revoke(token: string | undefined) {
      if (!token || !tokenPattern.test(token)) return;
      await run("DELETE FROM matrix_web.sessions WHERE token_hash = $1 AND origin = $2",
        [hash(token), config.origin]);
    },
  };
}

export async function readBetaAccess(
  config: WebConfig,
  token: string,
  sessions = webSessions(config),
  request = discordRequest,
) {
  try {
    const session = await sessions.read(token);
    if (!session) return { status: "signed_out" } as const;
    const status = await guildMembership(config, session.discordId, request);
    if (status !== "member") return { status } as const;
    return { status, session } as const;
  } catch {
    return { status: "unavailable" } as const;
  }
}
