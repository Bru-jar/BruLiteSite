import { requireAdminPage } from "@/lib/admin-page";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { entitlements, tickets, users } from "@/lib/db/schema";
import { Card, CardTitle, PageHeader, Badge } from "@/components/ui";
import Link from "next/link";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdminPage();
  const [[userCount], [entitledCount], [openTickets], recentTickets] =
    await Promise.all([
      db.select({ count: count() }).from(users),
      db
        .select({ count: count() })
        .from(entitlements)
        .where(eq(entitlements.status, "active")),
      db
        .select({ count: count() })
        .from(tickets)
        .where(eq(tickets.status, "open")),
      db
        .select({
          id: tickets.id,
          title: tickets.title,
          type: tickets.type,
          status: tickets.status,
          createdAt: tickets.createdAt,
          username: users.username,
        })
        .from(tickets)
        .innerJoin(users, eq(users.id, tickets.userId))
        .orderBy(desc(tickets.createdAt))
        .limit(8),
    ]);

  const stats = [
    { label: "Users", value: userCount.count },
    { label: "Active members", value: entitledCount.count },
    { label: "Open tickets", value: openTickets.count },
  ];

  return (
    <div>
      <PageHeader title="Admin overview" />
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <p className="text-sm text-muted">{s.label}</p>
            <p className="mt-1 text-3xl font-bold">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-8">
        <CardTitle>Latest tickets</CardTitle>
        {recentTickets.length === 0 ? (
          <p className="text-sm text-muted">No tickets yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recentTickets.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <Link
                    href="/admin/tickets"
                    className="font-medium hover:text-accent"
                  >
                    {t.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {t.username} · {t.type} ·{" "}
                    {t.createdAt.toLocaleDateString("en-GB")}
                  </p>
                </div>
                <Badge>{t.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
