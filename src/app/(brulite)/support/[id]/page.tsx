import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tickets } from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import { Badge, Card } from "@/components/ui";
import { env } from "@/lib/env";
import { notFound, redirect } from "next/navigation";

export const metadata = { title: "Ticket" };
export const dynamic = "force-dynamic";

export default async function TicketPage({
  params,
}: PageProps<"/support/[id]">) {
  const session = await getSession();
  if (!session) redirect("/auth/signin?next=/support");

  const { id } = await params;
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(eq(tickets.id, id))
    .limit(1);

  if (!ticket || (ticket.userId !== session.userId && !session.isAdmin)) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Link href="/support" className="text-sm text-accent hover:underline">
        ← Back to support
      </Link>
      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold">{ticket.title}</h1>
          <div className="flex gap-2">
            <Badge tone="purple">{ticket.type}</Badge>
            <Badge>{ticket.status.replace("_", " ")}</Badge>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          Opened{" "}
          {ticket.createdAt.toLocaleDateString("en-GB", { dateStyle: "full" })}
        </p>
        <p className="mt-6 whitespace-pre-wrap text-sm text-muted">
          {ticket.body}
        </p>
        {ticket.steps && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Steps to reproduce
            </h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
              {ticket.steps}
            </p>
          </div>
        )}
        {ticket.extra && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Other info
            </h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
              {ticket.extra}
            </p>
          </div>
        )}
        {ticket.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ticket.imageUrl}
            alt="Attached screenshot"
            className="mt-4 max-h-80 rounded-lg border border-border"
          />
        )}
        {ticket.discordMessageId && (
          <p className="mt-6 border-t border-border pt-4 text-xs text-muted">
            This ticket has a thread on the BruLite Discord — add evidence or
            follow the discussion there.
            <a
              href={`https://discord.com/channels/${env.DISCORD_GUILD_ID}/${ticket.discordMessageId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-accent underline"
            >
              Open Discord thread →
            </a>
          </p>
        )}
      </Card>
    </div>
  );
}
