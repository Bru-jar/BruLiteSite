import { generateToken } from "@/lib/tokens";
import { NextResponse } from "next/server";
import { buildOAuthUrl } from "@/lib/discord";
import { createOAuthState, OAUTH_COOKIE } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/** GET /api/auth/discord?next=/dashboard&pair=CODE — start Discord OAuth. */
export async function GET(req: Request) {
  const rl = await rateLimit(`oauth:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return new Response("Too many requests", { status: 429 });

  const url = new URL(req.url);
  const next = url.searchParams.get("next") ?? undefined;
  const pair = url.searchParams.get("pair") ?? undefined;
  if (pair && !/^[A-Za-z0-9_-]{8}$/.test(pair))
    return new Response("Invalid pairing code", { status: 400 });
  const nonce = generateToken();
  const state = await createOAuthState({ next, pair }, nonce);
  const res = NextResponse.redirect(buildOAuthUrl(state));
  res.cookies.set(OAUTH_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 600,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
