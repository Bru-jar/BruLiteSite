import { requireAdminPage } from "@/lib/admin-page";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { prices, products } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui";
import { ProductManager } from "@/components/product-manager";

export const metadata = { title: "Products" };
export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  await requireAdminPage();
  const prods = await db.select().from(products).orderBy(asc(products.name));
  const allPrices = await db.select().from(prices);

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Membership plans and bundles bound to Stripe prices."
      />
      <ProductManager
        products={prods.map((p) => ({
          ...p,
          prices: allPrices.filter((pr) => pr.productId === p.id),
        }))}
      />
    </div>
  );
}
