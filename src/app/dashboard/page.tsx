import { DisconnectDevice } from "@/components/linked-devices";
import Link from "next/link";
import { desc, eq, and, isNull, gt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clientDevices,
  clientSessions,
  licensePolicies,
  releases,
  subscriptions,
  tickets,
  users,
} from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import { getEntitlementStatus } from "@/lib/entitlements";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import {
  ManageBillingButton,
  NewTokenButton,
} from "@/components/dashboard-actions";
import { Download, KeyRound, Ticket } from "lucide-react";
import { redirect } from "next/navigation";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

function fmtDate(d: Date | null) {
  return d ? d.toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—";
}

export default async function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  const session = await getSession();
  if (!session) redirect("/auth/signin?next=/dashboard");
  const { checkout } = await searchParams;

  const [
    ent,
    [sub],
    devices,
    myTickets,
    releaseRows,
    [me],
    policies,
    activeSessions,
  ] = await Promise.all([
    getEntitlementStatus(session.userId),
    db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.userId))
      .orderBy(desc(subscriptions.currentPeriodEnd))
      .limit(1),
    db
      .select()
      .from(clientDevices)
      .where(
        and(
          eq(clientDevices.userId, session.userId),
          isNull(clientDevices.revokedAt),
        ),
      )
      .orderBy(desc(clientDevices.createdAt)),
    db
      .select()
      .from(tickets)
      .where(eq(tickets.userId, session.userId))
      .orderBy(desc(tickets.createdAt))
      .limit(5),
    db
      .select()
      .from(releases)
      .where(eq(releases.artifactType, "bundle"))
      .orderBy(desc(releases.createdAt))
      .limit(10),
    db
      .select({
        deviceLimit: users.deviceLimitOverride,
        concurrentLimit: users.concurrentLimitOverride,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1),
    db.select().from(licensePolicies),
    db
      .select({ id: clientSessions.id })
      .from(clientSessions)
      .where(
        and(
          eq(clientSessions.userId, session.userId),
          isNull(clientSessions.revokedAt),
          gt(clientSessions.expiresAt, new Date()),
        ),
      ),
  ]);

  const plan = policies.find((p) => p.plan === (ent.plan ?? "manual"));
  const deviceLimit = me?.deviceLimit ?? plan?.deviceLimit ?? 0;
  const concurrentLimit = me?.concurrentLimit ?? plan?.concurrentLimit ?? 0;

  // Latest bundle per platform (universal counts for everything).
  const latestByPlatform = new Map<string, (typeof releaseRows)[number]>();
  for (const r of releaseRows) {
    if (!latestByPlatform.has(r.platform)) latestByPlatform.set(r.platform, r);
  }
  const winRelease =
    latestByPlatform.get("windows-x64") ?? latestByPlatform.get("universal");
  const macRelease =
    latestByPlatform.get("macos-arm64") ?? latestByPlatform.get("universal");

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <PageHeader
        title={`Welcome, ${session.username}`}
        subtitle="Manage your membership, download, and linked clients."
      />

      {checkout === "success" && (
        <p className="mb-6 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          Payment received — your membership will activate as soon as Stripe
          confirms it (usually seconds).
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Membership */}
        <Card>
          <CardTitle>Membership</CardTitle>
          <div className="flex items-center justify-between">
            <div>
              {ent.entitled ? (
                <>
                  <Badge tone="green">Active</Badge>
                  <p className="mt-3 text-sm text-muted">
                    {ent.plan === "monthly"
                      ? "Monthly"
                      : ent.plan === "yearly"
                        ? "Yearly"
                        : "Manual"}{" "}
                    plan ·{" "}
                    {ent.expiresAt
                      ? `renews/ends ${fmtDate(ent.expiresAt)}`
                      : "no expiry"}
                  </p>
                </>
              ) : (
                <>
                  <Badge tone="red">No active membership</Badge>
                  <p className="mt-3 text-sm text-muted">
                    {ent.status === "revoked"
                      ? "Access was revoked — contact support."
                      : "Subscribe to unlock the client."}
                  </p>
                </>
              )}
              {ent.pastDue && (
                <p className="mt-2 text-sm text-amber-300">
                  Your last payment failed — update billing to keep access.
                </p>
              )}
              {ent.cancelAtPeriodEnd && ent.entitled && (
                <p className="mt-2 text-sm text-amber-300">
                  Cancels at period end ({fmtDate(ent.expiresAt)}).
                </p>
              )}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            {!ent.entitled && (
              <Link
                href="/pricing"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-bright"
              >
                View plans
              </Link>
            )}
            {sub && <ManageBillingButton />}
          </div>
        </Card>

        {/* Download */}
        <Card>
          <CardTitle>Client download</CardTitle>
          {ent.entitled ? (
            winRelease || macRelease ? (
              <>
                <p className="text-sm text-muted">
                  Latest builds — pick your platform:
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  {winRelease && (
                    <a
                      href="/api/download/client?platform=windows-x64"
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-bright"
                    >
                      <Download className="h-4 w-4" /> Windows (v
                      {winRelease.version})
                    </a>
                  )}
                  {macRelease && (
                    <a
                      href="/api/download/client?platform=macos-arm64"
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-bright"
                    >
                      <Download className="h-4 w-4" /> macOS Apple Silicon (v
                      {macRelease.version})
                    </a>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">
                No build has been published yet — check Discord for release
                announcements.
              </p>
            )
          ) : (
            <p className="text-sm text-muted">
              An active membership is required to download the client.
            </p>
          )}
        </Card>

        {/* Linked clients */}
        <Card>
          <CardTitle>
            <span className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-accent" /> Linked clients
            </span>
          </CardTitle>
          <p className="mb-3 text-xs text-muted">
            {devices.length} of {deviceLimit} registered devices.{" "}
            {activeSessions.length} of {concurrentLimit} running clients.
          </p>
          {devices.length === 0 ? (
            <p className="text-sm text-muted">
              No linked devices. Sign in from inside BruLite to connect this
              computer.
            </p>
          ) : (
            <ul className="space-y-3">
              {devices.map((device) => (
                <li
                  key={device.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm"
                >
                  <span>
                    {device.name}
                    <span className="ml-3 text-muted">
                      Linked {fmtDate(device.createdAt)}
                    </span>
                  </span>
                  <DisconnectDevice deviceId={device.id} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <NewTokenButton />
          </div>
        </Card>

        {/* Recent tickets */}
        <Card>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-accent" /> Recent tickets
            </span>
          </CardTitle>
          {myTickets.length === 0 ? (
            <p className="text-sm text-muted">
              No tickets yet.{" "}
              <Link href="/support" className="text-accent underline">
                File a bug or request a feature
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-3">
              {myTickets.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/support/${t.id}`}
                    className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm transition-colors hover:border-primary/50"
                  >
                    <span className="truncate font-medium">{t.title}</span>
                    <Badge>{t.status}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
