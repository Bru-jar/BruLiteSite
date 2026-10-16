import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { prices, subscriptions, users } from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import { hasAcceptedCurrentTerms } from "@/lib/terms";
import { stripeProvider } from "@/lib/payments/stripe";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({ priceId: z.uuid() });

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`checkout:${session.userId}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_price" }, { status: 400 });
  }

  // ToS must be accepted (and recorded) before checkout.
  if (!(await hasAcceptedCurrentTerms(session.userId))) {
    return NextResponse.json({ error: "terms_required" }, { status: 403 });
  }

  const [price] = await db
    .select()
    .from(prices)
    .where(and(eq(prices.id, parsed.data.priceId), eq(prices.active, true)))
    .limit(1);
  if (!price) {
    return NextResponse.json({ error: "invalid_price" }, { status: 400 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [existingSub] = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  try {
    const checkout = await stripeProvider.createCheckoutSession({
      userId: user.id,
      email: user.email,
      stripeCustomerId: existingSub?.stripeCustomerId ?? null,
      stripePriceId: price.stripePriceId,
      successUrl: `${env.APP_URL}/dashboard?checkout=success`,
      cancelUrl: `${env.APP_URL}/pricing?checkout=canceled`,
    });
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    console.error("checkout failed", e);
    return NextResponse.json(
      { error: "checkout_unavailable" },
      { status: 502 },
    );
  }
}
