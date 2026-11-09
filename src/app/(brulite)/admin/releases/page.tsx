import { requireAdminPage } from "@/lib/admin-page";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { releases } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui";
import { ReleaseManager } from "@/components/release-manager";

export const metadata = { title: "Releases" };
export const dynamic = "force-dynamic";

export default async function AdminReleasesPage() {
  await requireAdminPage();
  const rows = await db
    .select()
    .from(releases)
    .orderBy(desc(releases.createdAt));

  return (
    <div>
      <PageHeader
        title="Releases"
        subtitle="Client builds served to members via the dashboard download."
      />
      <ReleaseManager releases={rows} />
    </div>
  );
}
