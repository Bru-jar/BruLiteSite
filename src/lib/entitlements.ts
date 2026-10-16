import { and, desc, eq } from "drizzle-orm";
import { authTransaction } from "@/lib/db/transaction";
import { clientSessions } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { auditLog, entitlements, subscriptions, users } from "@/lib/db/schema";
import { addGuildRole, removeGuildRole } from "@/lib/discord";
import { env } from "@/lib/env";
import { decideEntitlement } from "@/lib/entitlement-logic";

export type EntitlementStatus = {
  entitled: boolean;
  status: "active" | "expired" | "revoked" | "none";
  plan: "monthly" | "yearly" | "manual" | null;
  expiresAt: Date | null;
  /** Subscription canceled but still inside paid period. */
  cancelAtPeriodEnd: boolean;
  /** Stripe says payment is overdue; still inside paid period. */
  pastDue: boolean;
};

/**
 * Recompute a user's entitlement row from their latest subscription.
 * Idempotent: safe to call from any webhook event in any order, since the
 * result derives from current subscription state — not event ordering.
 */
export async function syncEntitlementFromSubscription(userId: string) {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1);

  const now = new Date();
  const decision = decideEntitlement(sub ?? null, now);

  const [existing] = await db
    .select()
    .from(entitlements)
    .where(
      and(eq(entitlements.userId, userId), eq(entitlements.source, "stripe")),
    )
    .orderBy(desc(entitlements.grantedAt))
    .limit(1);

  if (decision === "active" && sub) {
    if (existing && existing.status === "active") {
      await db
        .update(entitlements)
        .set({
          expiresAt: sub.currentPeriodEnd,
          planInterval: sub.planInterval,
        })
        .where(eq(entitlements.id, existing.id));
    } else {
      await db.insert(entitlements).values({
        userId,
        source: "stripe",
        status: "active",
        planInterval: sub.planInterval,
        expiresAt: sub.currentPeriodEnd,
      });
    }
    await syncCustomerRole(userId, true);
    return;
  }

  if (existing && existing.status === "active") {
    await db
      .update(entitlements)
      .set({
        status: decision,
        revokedAt: decision === "revoked" ? now : null,
        reason:
          decision === "revoked"
            ? `subscription ${sub?.status}`
            : "period ended",
      })
      .where(eq(entitlements.id, existing.id));
    await syncCustomerRole(userId, false);
  }
}

/** Read the effective entitlement status for a user (used by API + dashboard). */
export async function getEntitlementStatus(
  userId: string,
): Promise<EntitlementStatus> {
  const now = new Date();

  const [ent] = await db
    .select()
    .from(entitlements)
    .where(eq(entitlements.userId, userId))
    .orderBy(desc(entitlements.grantedAt))
    .limit(1);

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1);

  if (!ent || ent.status !== "active") {
    return {
      entitled: false,
      status: ent ? (ent.status as EntitlementStatus["status"]) : "none",
      plan: null,
      expiresAt: null,
      cancelAtPeriodEnd: false,
      pastDue: false,
    };
  }

  if (ent.expiresAt && ent.expiresAt <= now) {
    // Lazily expire + drop the Discord role.
    await db
      .update(entitlements)
      .set({ status: "expired", reason: "period ended" })
      .where(eq(entitlements.id, ent.id));
    await syncCustomerRole(userId, false);
    return {
      entitled: false,
      status: "expired",
      plan: null,
      expiresAt: ent.expiresAt,
      cancelAtPeriodEnd: false,
      pastDue: false,
    };
  }

  return {
    entitled: true,
    status: "active",
    plan:
      ent.planInterval === "month"
        ? "monthly"
        : ent.planInterval === "year"
          ? "yearly"
          : ent.source === "manual"
            ? "manual"
            : null,
    expiresAt: ent.expiresAt,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    pastDue: sub?.status === "past_due",
  };
}

/** Immediately revoke a user's entitlement (refund, chargeback, admin action). */
export async function revokeEntitlement(
  userId: string,
  reason: string,
  actorUserId?: string,
) {
  await authTransaction(async (tx) => {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    await tx
      .update(entitlements)
      .set({ status: "revoked", revokedAt: new Date(), reason })
      .where(
        and(eq(entitlements.userId, userId), eq(entitlements.status, "active")),
      );
    await tx
      .update(clientSessions)
      .set({ revokedAt: new Date() })
      .where(eq(clientSessions.userId, userId));
  });
  await syncCustomerRole(userId, false);
  await db.insert(auditLog).values({
    actorUserId: actorUserId ?? null,
    action: "entitlement.revoked",
    target: userId,
    meta: { reason },
  });
}

/** Admin grant of manual access (no expiry = lifetime). */
export async function grantManualEntitlement(
  userId: string,
  actorUserId: string,
  expiresAt?: Date,
) {
  // Expire any existing manual entitlement to keep the latest-authoritative.
  await db
    .update(entitlements)
    .set({ status: "expired", reason: "superseded" })
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.source, "manual"),
        eq(entitlements.status, "active"),
      ),
    );
  await db.insert(entitlements).values({
    userId,
    source: "manual",
    status: "active",
    expiresAt: expiresAt ?? null,
  });
  await syncCustomerRole(userId, true);
  await db.insert(auditLog).values({
    actorUserId,
    action: "entitlement.granted",
    target: userId,
    meta: { expiresAt },
  });
}

async function syncCustomerRole(userId: string, grant: boolean) {
  try {
    const [u] = await db
      .select({ discordId: users.discordId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!u) return;
    if (grant) await addGuildRole(u.discordId, env.DISCORD_CUSTOMER_ROLE_ID);
    else await removeGuildRole(u.discordId, env.DISCORD_CUSTOMER_ROLE_ID);
  } catch (e) {
    // Role sync is best-effort — the DB is the source of truth.
    console.error("Discord role sync failed", e);
  }
}
