import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { prices, products } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui";
import { PricingCards } from "@/components/pricing-cards";
import { getSession } from "@/lib/auth";

export const metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const session = await getSession();

  const rows = await db
    .select({
      priceId: prices.id,
      interval: prices.interval,
      amountUsdCents: prices.amountUsdCents,
      productName: products.name,
      description: products.description,
      category: products.category,
    })
    .from(prices)
    .innerJoin(products, eq(products.id, prices.productId))
    .where(eq(prices.active, true))
    .orderBy(asc(prices.amountUsdCents));

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <PageHeader
        centered
        eyebrow="Pricing"
        title="One membership, everything included"
        subtitle="The full client, every plugin, and your Discord role — monthly or yearly."
      />
      <PricingCards prices={rows} signedIn={!!session} />
      <p className="mt-8 text-center text-sm text-muted">
        Prices in USD. Cancel anytime — access continues until the end of your
        paid period. See our{" "}
        <a href="/terms" className="text-accent underline">
          Terms
        </a>{" "}
        for the refund policy.
      </p>
    </div>
  );
}
