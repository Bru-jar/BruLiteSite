import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import {
  SESSION_COOKIE,
  OAUTH_COOKIE,
  createSessionToken,
  verifyOAuthState,
} from "@/lib/auth";
import {
  exchangeCode,
  fetchDiscordUser,
  joinGuild,
  isGuildMember,
  getGuildMember,
  memberIsAdmin,
} from "@/lib/discord";
import { env } from "@/lib/env";

function redirect(path: string) {
  const res = NextResponse.redirect(`${env.APP_URL}${path}`);
  res.cookies.set(OAUTH_COOKIE, "", {
    httpOnly: true,
    path: "/api/auth",
    maxAge: 0,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/** GET /api/auth/callback/discord — OAuth callback. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const error = url.searchParams.get("error");

  if (error || !code) {
    return redirect("/auth/signin?error=oauth_denied");
  }

  const nonce = (await cookies()).get(OAUTH_COOKIE)?.value ?? "";
  const stateData = await verifyOAuthState(state, nonce);
  if (!stateData) return redirect("/auth/signin?error=invalid_state");

  let accessToken: string;
  try {
    const tokens = await exchangeCode(code);
    accessToken = tokens.access_token;
  } catch (e) {
    console.error(e);
    return redirect("/auth/signin?error=oauth_failed");
  }

  const discordUser = await fetchDiscordUser(accessToken);

  // Require guild membership — auto-join via guilds.join scope first.
  const joined = await joinGuild(discordUser.id, accessToken);
  const member = await getGuildMember(discordUser.id);
  if (!joined && !(await isGuildMember(discordUser.id))) {
    return redirect("/auth/signin?error=guild_required");
  }

  const displayName = discordUser.global_name ?? discordUser.username;
  const isAdmin = memberIsAdmin(member);

  // Upsert user record.
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.discordId, discordUser.id))
    .limit(1);

  let userId: string;
  if (existing) {
    userId = existing.id;
    await db
      .update(users)
      .set({
        username: displayName,
        avatar: discordUser.avatar ?? null,
        email: discordUser.email ?? null,
      })
      .where(eq(users.id, existing.id));
  } else {
    const [created] = await db
      .insert(users)
      .values({
        discordId: discordUser.id,
        username: displayName,
        avatar: discordUser.avatar ?? null,
        email: discordUser.email ?? null,
      })
      .returning({ id: users.id });
    userId = created.id;
  }

  const token = await createSessionToken({
    userId,
    discordId: discordUser.id,
    username: displayName,
    avatar: discordUser.avatar ?? null,
    isAdmin,
  });

  // Client pairing flow takes precedence over a normal redirect.
  let dest = stateData.next ?? "/dashboard";
  if (stateData.pair) {
    dest = `/auth/client?code=${encodeURIComponent(stateData.pair)}`;
  }

  const res = redirect(dest);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
