import { cache } from "react";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { createHmac, randomUUID } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/lib/env";
import { db } from "@/lib/db/client";
import { webSessions, oauthAttempts } from "@/lib/db/schema";
import { hashToken } from "@/lib/tokens";
import { getGuildMember, memberIsAdmin } from "@/lib/discord";

export const SESSION_COOKIE = "brulite_session";
export const OAUTH_COOKIE = "brulite_oauth_nonce";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const userSchema = z.object({
  userId: z.uuid(),
  discordId: z.string().regex(/^\d{1,30}$/),
  username: z.string().min(1).max(100),
  avatar: z.string().nullable(),
  isAdmin: z.boolean(),
});
export type SessionUser = z.infer<typeof userSchema>;

function key(purpose: string) {
  if (env.AUTH_SECRET.length < 32)
    throw new Error("AUTH_SECRET must contain at least 32 characters");
  return createHmac("sha256", env.AUTH_SECRET)
    .update("brulite:" + purpose)
    .digest();
}
const issuer = () => env.APP_URL;

export async function createSessionToken(user: SessionUser): Promise<string> {
  userSchema.parse(user);
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await db.insert(webSessions).values({ id, userId: user.userId, expiresAt });
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256", typ: "brulite-session+jwt" })
    .setIssuer(issuer())
    .setAudience("brulite-web")
    .setJti(id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key("session"));
}

async function sessionClaims(token: string) {
  try {
    const { payload, protectedHeader } = await jwtVerify(
      token,
      key("session"),
      {
        algorithms: ["HS256"],
        issuer: issuer(),
        audience: "brulite-web",
        requiredClaims: ["exp", "iat", "jti"],
      },
    );
    if (
      protectedHeader.typ !== "brulite-session+jwt" ||
      !z.uuid().safeParse(payload.jti).success
    )
      return null;
    const parsed = userSchema.safeParse(payload);
    return parsed.success ? { user: parsed.data, id: payload.jti! } : null;
  } catch {
    return null;
  }
}
export async function verifySessionToken(
  token: string,
): Promise<SessionUser | null> {
  const claims = await sessionClaims(token);
  if (!claims) return null;
  const [session] = await db
    .select({ id: webSessions.id })
    .from(webSessions)
    .where(
      and(
        eq(webSessions.id, claims.id),
        eq(webSessions.userId, claims.user.userId),
        gt(webSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return session ? claims.user : null;
}
export async function revokeWebSession(token: string) {
  const claims = await sessionClaims(token);
  if (claims) await db.delete(webSessions).where(eq(webSessions.id, claims.id));
}
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : null;
}
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Response("Unauthorized", { status: 401 });
  return session;
}
/** Never authorize an administrator from a seven-day cached role claim. Discord failure denies access. */
export const requireAdmin = cache(async (): Promise<SessionUser> => {
  const session = await requireUser();
  const member = await getGuildMember(session.discordId);
  if (!memberIsAdmin(member)) throw new Response("Forbidden", { status: 403 });
  return { ...session, isAdmin: true };
});

export function safeNext(value?: string): string | undefined {
  if (!value) return undefined;
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return undefined;
  const parsed = new URL(value, env.APP_URL);
  return parsed.origin === new URL(env.APP_URL).origin
    ? parsed.pathname + parsed.search
    : undefined;
}
export async function createOAuthState(
  payload: { next?: string; pair?: string },
  nonce: string,
): Promise<string> {
  const id = randomUUID();
  const nonceHash = hashToken(nonce);
  await db
    .insert(oauthAttempts)
    .values({ id, nonceHash, expiresAt: new Date(Date.now() + 600_000) });
  return new SignJWT({
    next: safeNext(payload.next),
    pair: payload.pair,
    nonceHash,
  })
    .setProtectedHeader({ alg: "HS256", typ: "brulite-oauth-state+jwt" })
    .setIssuer(issuer())
    .setAudience("brulite-discord-oauth")
    .setJti(id)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key("oauth"));
}
/** Browser-bound, atomically consumed state. Missing/invalid/reused state never becomes a login. */
export async function verifyOAuthState(
  state: string,
  nonce: string,
): Promise<{ next?: string; pair?: string } | null> {
  if (!nonce) return null;
  try {
    const { payload, protectedHeader } = await jwtVerify(state, key("oauth"), {
      algorithms: ["HS256"],
      issuer: issuer(),
      audience: "brulite-discord-oauth",
      requiredClaims: ["exp", "iat", "jti"],
    });
    if (
      protectedHeader.typ !== "brulite-oauth-state+jwt" ||
      !z.uuid().safeParse(payload.jti).success ||
      payload.nonceHash !== hashToken(nonce)
    )
      return null;
    if (
      payload.pair !== undefined &&
      (typeof payload.pair !== "string" ||
        !/^[A-Za-z0-9_-]{8}$/.test(payload.pair))
    )
      return null;
    const [consumed] = await db
      .delete(oauthAttempts)
      .where(
        and(
          eq(oauthAttempts.id, payload.jti!),
          eq(oauthAttempts.nonceHash, hashToken(nonce)),
          gt(oauthAttempts.expiresAt, new Date()),
        ),
      )
      .returning({ id: oauthAttempts.id });
    return consumed
      ? {
          next: safeNext(
            typeof payload.next === "string" ? payload.next : undefined,
          ),
          pair: payload.pair as string | undefined,
        }
      : null;
  } catch {
    return null;
  }
}
export function avatarUrl(discordId: string, avatar: string | null): string {
  if (!avatar)
    return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordId) >> BigInt(22)) % 6}.png`;
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png?size=128`;
}
