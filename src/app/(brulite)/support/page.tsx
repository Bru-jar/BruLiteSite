import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import { Badge, Card, PageHeader } from "@/components/ui";
import { TicketForm } from "@/components/ticket-form";
import { redirect } from "next/navigation";

export const metadata = { title: "Support" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "default" | "green" | "yellow" | "purple"> = {
  open: "purple",
  in_progress: "yellow",
  resolved: "green",
  closed: "default",
};

export default async function SupportPage() {
  const session = await getSession();
  if (!session) redirect("/auth/signin?next=/support");

  const myTickets = await db
    .select()
    .from(tickets)
    .where(eq(tickets.userId, session.userId))
    .orderBy(desc(tickets.createdAt));

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <PageHeader
        title="Support"
        subtitle="Report a bug or request a feature — tickets go straight to the team on Discord."
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <h2 className="mb-4 font-semibold">New ticket</h2>
          <TicketForm />
        </Card>

        <div>
          <h2 className="mb-4 font-semibold">Your tickets</h2>
          {myTickets.length === 0 ? (
            <Card className="py-10 text-center text-sm text-muted">
              Nothing here yet.
            </Card>
          ) : (
            <ul className="space-y-3">
              {myTickets.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/support/${t.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/80 px-4 py-3 transition-colors hover:border-primary/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      <p className="text-xs text-muted">
                        {t.type} ·{" "}
                        {t.createdAt.toLocaleDateString("en-GB", {
                          dateStyle: "medium",
                        })}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[t.status] ?? "default"}>
                      {t.status.replace("_", " ")}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
