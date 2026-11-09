import { requireAdminPage } from "@/lib/admin-page";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { plugins } from "@/lib/db/schema";
import { PageHeader } from "@/components/ui";
import { PluginManager } from "@/components/plugin-manager";

export const metadata = { title: "Plugins" };
export const dynamic = "force-dynamic";

export default async function AdminPluginsPage() {
  await requireAdminPage();
  const rows = await db
    .select()
    .from(plugins)
    .orderBy(asc(plugins.sortOrder), asc(plugins.name));

  return (
    <div>
      <PageHeader
        title="Plugins"
        subtitle="Manage the public plugin showcase."
      />
      <PluginManager plugins={rows} />
    </div>
  );
}
