import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, revokeWebSession } from "@/lib/auth";
import { env } from "@/lib/env";

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await revokeWebSession(token);
  const res = NextResponse.redirect(`${env.APP_URL}/`);
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}
