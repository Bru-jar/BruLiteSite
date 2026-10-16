import { requireAdminPage } from "@/lib/admin-page";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { entitlements, subscriptions, users } from "@/lib/db/schema";
import { Badge, Card, PageHeader } from "@/components/ui";
import { EntitlementActions } from "@/components/user-actions";
import { LicensePolicyManager } from "@/components/license-policy-manager";
import { licensePolicies } from "@/lib/db/schema";
import { UserDevicesPanel } from "@/components/user-devices-panel";
import { avatarUrl } from "@/lib/auth";

export const metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: PageProps<"/admin/users">) {
  await requireAdminPage();
  const { q } = await searchParams;
  const query = typeof q === "string" && q ? `%${q}%` : null;

  const policies = await db
    .select()
    .from(licensePolicies)
    .orderBy(licensePolicies.plan);
  const rows = await db
    .select({
      id: users.id,
      discordId: users.discordId,
      username: users.username,
      avatar: users.avatar,
      createdAt: users.createdAt,
      entitlementStatus: entitlements.status,
      entitlementExpiry: entitlements.expiresAt,
      subStatus: subscriptions.status,
    })
    .from(users)
    .leftJoin(
      entitlements,
      and(eq(entitlements.userId, users.id), eq(entitlements.status, "active")),
    )
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .where(
      query
        ? or(ilike(users.username, query), ilike(users.discordId, query))
        : undefined,
    )
    .orderBy(desc(users.createdAt))
    .limit(100);

  return (
    <div>
      <PageHeader title="Users" subtitle="Search by Discord name or ID." />

      <LicensePolicyManager policies={policies} />
      <form className="mb-6">
        <input
          name="q"
          defaultValue={typeof q === "string" ? q : ""}
          placeholder="Search users…"
          className="w-full max-w-sm rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </form>

      <Card>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No users found.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((u) => {
              const activeEnt = u.entitlementStatus === "active";
              return (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={avatarUrl(u.discordId, u.avatar)}
                      alt=""
                      width={32}
                      height={32}
                      className="rounded-full"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {u.username}
                      </p>
                      <p className="text-xs text-muted">{u.discordId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {activeEnt ? (
                      <Badge tone="green">
                        {u.subStatus ? `sub:${u.subStatus}` : "manual"}
                      </Badge>
                    ) : (
                      <Badge>no access</Badge>
                    )}
                    <EntitlementActions userId={u.id} entitled={activeEnt} />
                  </div>
                  <div className="w-full">
                    <UserDevicesPanel userId={u.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
