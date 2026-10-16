import { randomUUID } from "crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { authTransaction, type AuthTransaction } from "@/lib/db/transaction";
import {
  clientDevices,
  clientPairings,
  clientProofs,
  clientRefreshTokens,
  clientSessions,
  entitlements,
  licensePolicies,
  licenseTokens,
  users,
  auditLog,
} from "@/lib/db/schema";
import { generatePairCode, generateToken, hashToken } from "@/lib/tokens";
import {
  keyThumbprint,
  publicKeySchema,
  verifyClientProof,
  type PublicKey,
} from "@/lib/client-proof";
import { rateLimit } from "@/lib/rate-limit";
import { env } from "@/lib/env";

export const ACCESS_SECONDS = 300;
export const LEASE_SECONDS = 180;
const REFRESH_MS = 90 * 24 * 60 * 60 * 1000;
export class ClientError extends Error {
  constructor(
    public code: string,
    public status = 403,
  ) {
    super(code);
  }
}
const fail = (code: string, status = 403): never => {
  throw new ClientError(code, status);
};
const bearer = (req: Request) =>
  /^DPoP ([A-Za-z0-9_-]{43})$/.exec(
    req.headers.get("authorization") ?? "",
  )?.[1] ?? fail("unauthorized", 401);
const secret = (req: Request) =>
  /^Pair ([A-Za-z0-9_-]{43})$/.exec(
    req.headers.get("authorization") ?? "",
  )?.[1] ?? fail("pair_secret_required", 401);
const codeValid = (code: string) => /^[A-Za-z0-9_-]{8}$/.test(code);

async function lockUser(tx: AuthTransaction, id: string) {
  const [user] = await tx
    .select()
    .from(users)
    .where(eq(users.id, id))
    .for("update");
  return user ?? fail("unauthorized", 401);
}
async function policy(tx: AuthTransaction, user: typeof users.$inferSelect) {
  const [ent] = await tx
    .select()
    .from(entitlements)
    .where(eq(entitlements.userId, user.id))
    .orderBy(desc(entitlements.grantedAt), desc(entitlements.id))
    .limit(1);
  const now = new Date();
  if (
    !ent ||
    ent.status !== "active" ||
    (ent.expiresAt && ent.expiresAt <= now)
  )
    return fail("not_entitled");
  const plan =
    ent.planInterval === "month"
      ? "monthly"
      : ent.planInterval === "year"
        ? "yearly"
        : "manual";
  const [limits] = await tx
    .select()
    .from(licensePolicies)
    .where(eq(licensePolicies.plan, plan))
    .limit(1);
  if (!limits) return fail("policy_unavailable", 503);
  return {
    ent,
    plan,
    deviceLimit: user.deviceLimitOverride ?? limits.deviceLimit,
    concurrentLimit: user.concurrentLimitOverride ?? limits.concurrentLimit,
  };
}
async function requireDeviceWithinLimit(
  tx: AuthTransaction,
  ctx: ClientContext,
  limit: number,
) {
  const devices = await tx
    .select({ id: clientDevices.id })
    .from(clientDevices)
    .where(
      and(
        eq(clientDevices.userId, ctx.user.id),
        isNull(clientDevices.revokedAt),
      ),
    )
    .orderBy(clientDevices.createdAt, clientDevices.id);
  const position = devices.findIndex((d) => d.id === ctx.device.id);
  if (position < 0 || position >= limit) return fail("device_limit");
}
export async function revokeFamily(tx: AuthTransaction, familyId: string) {
  const now = new Date();
  await tx
    .update(clientRefreshTokens)
    .set({ revokedAt: now })
    .where(eq(clientRefreshTokens.familyId, familyId));
  await tx
    .update(licenseTokens)
    .set({ revokedAt: now })
    .where(eq(licenseTokens.familyId, familyId));
  await tx
    .update(clientSessions)
    .set({ revokedAt: now })
    .where(eq(clientSessions.familyId, familyId));
}
async function issue(
  tx: AuthTransaction,
  userId: string,
  deviceId: string,
  familyId: string,
  refreshExpiresAt: Date,
) {
  const token = generateToken(),
    refreshToken = generateToken();
  const now = Date.now();
  await tx
    .insert(licenseTokens)
    .values({
      userId,
      deviceId,
      familyId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now + ACCESS_SECONDS * 1000),
      label: "paired-v2",
    });
  await tx
    .insert(clientRefreshTokens)
    .values({
      userId,
      deviceId,
      familyId,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
    });
  return {
    token,
    refreshToken,
    tokenType: "DPoP",
    expiresIn: ACCESS_SECONDS,
    refreshExpiresAt,
    deviceId,
    protocol: 2,
  };
}
async function consumeProof(
  tx: AuthTransaction,
  deviceId: string,
  proofId: string,
) {
  const [row] = await tx
    .insert(clientProofs)
    .values({ deviceId, proofId, expiresAt: new Date(Date.now() + 120_000) })
    .onConflictDoNothing()
    .returning({ id: clientProofs.id });
  if (!row) fail("proof_replayed", 401);
}

export async function createPairing(body: unknown) {
  const parsed = z
    .object({
      publicKey: publicKeySchema,
      deviceName: z.string().trim().min(1).max(80),
    })
    .strict()
    .safeParse(body);
  if (!parsed.success) return fail("invalid_device", 400);
  // Validate that the curve coordinates really describe a usable public key before storing it.
  const { importJWK } = await import("jose");
  await importJWK(parsed.data.publicKey, "ES256");
  const code = generatePairCode(),
    retrievalSecret = generateToken();
  await authTransaction(async (tx) => {
    await tx
      .insert(clientPairings)
      .values({
        code,
        secretHash: hashToken(retrievalSecret),
        publicKey: parsed.data.publicKey,
        deviceName: parsed.data.deviceName,
        status: "pending",
        expiresAt: new Date(Date.now() + 600_000),
      });
  });
  return {
    code,
    retrievalSecret,
    verifyUrl: `${env.APP_URL}/auth/client?code=${code}`,
    expiresIn: 600,
    pollInterval: 2,
    protocol: 2,
  };
}
export async function approvePairing(code: string, userId: string) {
  if (!codeValid(code)) return fail("invalid_code", 404);
  return authTransaction(async (tx) => {
    const [pair] = await tx
      .update(clientPairings)
      .set({ status: "complete", userId })
      .where(
        and(
          eq(clientPairings.code, code),
          eq(clientPairings.status, "pending"),
          gt(clientPairings.expiresAt, new Date()),
          sql`${clientPairings.secretHash} IS NOT NULL`,
        ),
      )
      .returning({ code: clientPairings.code });
    if (!pair) fail("invalid_code", 404);
    return { ok: true };
  });
}
export async function collectPairing(
  req: Request,
  code: string,
): Promise<
  | { status: "pending" }
  | ({ status: "complete" } & Awaited<ReturnType<typeof issue>>)
> {
  if (!codeValid(code)) return fail("invalid_code", 404);
  const retrievalSecret = secret(req);
  return authTransaction(async (tx) => {
    const [pair] = await tx
      .select()
      .from(clientPairings)
      .where(
        and(
          eq(clientPairings.code, code),
          eq(clientPairings.secretHash, hashToken(retrievalSecret)),
        ),
      )
      .for("update");
    if (!pair || !pair.publicKey) return fail("invalid_code", 404);
    if (pair.expiresAt <= new Date()) return fail("pair_expired", 410);
    if (
      !(await verifyClientProof(
        req,
        pair.publicKey as PublicKey,
        retrievalSecret,
      ))
    )
      return fail("invalid_proof", 401);
    if (pair.status === "pending") return { status: "pending" as const };
    if (pair.status !== "complete" || !pair.userId)
      return fail("pair_consumed", 410);
    const user = await lockUser(tx, pair.userId);
    // Pairing establishes identity; membership is checked separately when starting/renewing a session.
    const [ent] = await tx
      .select()
      .from(entitlements)
      .where(eq(entitlements.userId, user.id))
      .orderBy(desc(entitlements.grantedAt), desc(entitlements.id))
      .limit(1);
    const plan =
      ent?.planInterval === "month"
        ? "monthly"
        : ent?.planInterval === "year"
          ? "yearly"
          : "manual";
    const [limits] = await tx
      .select()
      .from(licensePolicies)
      .where(eq(licensePolicies.plan, plan))
      .limit(1);
    if (!limits) return fail("policy_unavailable", 503);
    const thumbprint = await keyThumbprint(pair.publicKey as PublicKey);
    const [existing] = await tx
      .select()
      .from(clientDevices)
      .where(
        and(
          eq(clientDevices.userId, user.id),
          eq(clientDevices.keyThumbprint, thumbprint),
        ),
      )
      .limit(1);
    if (!existing || existing.revokedAt) {
      const seats = await tx
        .select({ id: clientDevices.id })
        .from(clientDevices)
        .where(
          and(
            eq(clientDevices.userId, user.id),
            isNull(clientDevices.revokedAt),
          ),
        );
      if (seats.length >= (user.deviceLimitOverride ?? limits.deviceLimit))
        return fail("device_limit");
    }
    const [device] = await tx
      .insert(clientDevices)
      .values({
        userId: user.id,
        keyThumbprint: thumbprint,
        publicKey: pair.publicKey,
        name: pair.deviceName ?? "BruLite",
      })
      .onConflictDoUpdate({
        target: [clientDevices.userId, clientDevices.keyThumbprint],
        set: { revokedAt: null, name: pair.deviceName ?? "BruLite" },
      })
      .returning();
    // A fresh browser approval replaces credentials for this installation, freeing orphaned families.
    const previous = await tx
      .select({ familyId: licenseTokens.familyId })
      .from(licenseTokens)
      .where(
        and(
          eq(licenseTokens.deviceId, device.id),
          isNull(licenseTokens.revokedAt),
        ),
      );
    for (const old of previous)
      if (old.familyId) await revokeFamily(tx, old.familyId);
    const result = await issue(
      tx,
      user.id,
      device.id,
      randomUUID(),
      new Date(Date.now() + REFRESH_MS),
    );
    await tx
      .insert(auditLog)
      .values({
        actorUserId: user.id,
        action: "client.paired",
        target: device.id,
      });
    await tx
      .update(clientPairings)
      .set({ status: "collected", pendingToken: null, secretHash: null })
      .where(eq(clientPairings.code, code));
    return { status: "complete" as const, ...result };
  });
}

type AccessRow = typeof licenseTokens.$inferSelect;
type DeviceRow = typeof clientDevices.$inferSelect;
export type ClientContext = {
  user: typeof users.$inferSelect;
  token: AccessRow;
  device: DeviceRow;
};
/** All auth decisions serialize on the user row. Revocation and session management use the same lock. */
export async function authorized<T>(
  req: Request,
  work: (tx: AuthTransaction, ctx: ClientContext) => Promise<T>,
): Promise<T> {
  const raw = bearer(req);
  const result = await authTransaction(async (tx) => {
    const [hint] = await tx
      .select()
      .from(licenseTokens)
      .where(eq(licenseTokens.tokenHash, hashToken(raw)))
      .limit(1);
    if (!hint) return fail("unauthorized", 401);
    const user = await lockUser(tx, hint.userId);
    const [token] = await tx
      .select()
      .from(licenseTokens)
      .where(eq(licenseTokens.id, hint.id))
      .limit(1);
    if (
      !token ||
      token.revokedAt ||
      token.expiresAt <= new Date() ||
      !token.deviceId ||
      !token.familyId
    )
      return fail("unauthorized", 401);
    const [device] = await tx
      .select()
      .from(clientDevices)
      .where(
        and(
          eq(clientDevices.id, token.deviceId),
          eq(clientDevices.userId, user.id),
          isNull(clientDevices.revokedAt),
        ),
      )
      .limit(1);
    if (!device) return fail("device_revoked", 401);
    const proof = await verifyClientProof(
      req,
      device.publicKey as PublicKey,
      raw,
    );
    if (!proof) return fail("invalid_proof", 401);
    await consumeProof(tx, device.id, proof);
    const allowance = await rateLimit(
      `client:${user.id}`,
      600,
      60_000,
      async (statement) => (await tx.execute(statement)).rows,
    );
    if (!allowance.ok)
      return {
        ok: false as const,
        error: new ClientError("rate_limited", 429),
      };
    await tx
      .update(licenseTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(licenseTokens.id, token.id));
    try {
      // Failed business decisions roll back their own writes, while the consumed proof still commits.
      const value = await tx.transaction((inner) =>
        work(inner, { user, token, device }),
      );
      return { ok: true as const, value };
    } catch (error) {
      if (error instanceof ClientError) return { ok: false as const, error };
      throw error;
    }
  });
  if (!result.ok) throw result.error;
  return result.value;
}
export async function refreshAccess(req: Request, body: unknown) {
  const parsed = z
    .object({ refreshToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
    .strict()
    .safeParse(body);
  if (!parsed.success) return fail("invalid_body", 400);
  const raw = parsed.data.refreshToken;
  // Return the error AFTER commit when replay revocation must survive the rejected request.
  const result = await authTransaction(async (tx) => {
    const [hint] = await tx
      .select()
      .from(clientRefreshTokens)
      .where(eq(clientRefreshTokens.tokenHash, hashToken(raw)))
      .limit(1);
    if (!hint) return { error: "unauthorized" };
    await lockUser(tx, hint.userId);
    const [token] = await tx
      .select()
      .from(clientRefreshTokens)
      .where(eq(clientRefreshTokens.id, hint.id))
      .limit(1);
    const [device] = await tx
      .select()
      .from(clientDevices)
      .where(eq(clientDevices.id, token.deviceId))
      .limit(1);
    if (
      !device ||
      device.revokedAt ||
      token.revokedAt ||
      token.expiresAt <= new Date()
    )
      return { error: "unauthorized" };
    const proof = await verifyClientProof(
      req,
      device.publicKey as PublicKey,
      raw,
    );
    if (!proof) return { error: "invalid_proof" };
    await consumeProof(tx, device.id, proof);
    const allowance = await rateLimit(
      `refresh-user:${token.userId}`,
      30,
      60_000,
      async (statement) => (await tx.execute(statement)).rows,
    );
    if (!allowance.ok) return { error: "rate_limited" };
    if (token.consumedAt) {
      await revokeFamily(tx, token.familyId);
      await tx
        .insert(auditLog)
        .values({
          actorUserId: token.userId,
          action: "client.refresh_reuse",
          target: token.familyId,
        });
      return { error: "refresh_reused" };
    }
    await tx
      .update(clientRefreshTokens)
      .set({ consumedAt: new Date() })
      .where(eq(clientRefreshTokens.id, token.id));
    await tx
      .update(licenseTokens)
      .set({ revokedAt: new Date() })
      .where(eq(licenseTokens.familyId, token.familyId));
    return issue(
      tx,
      token.userId,
      token.deviceId,
      token.familyId,
      token.expiresAt,
    );
  });
  if ("error" in result)
    return fail(result.error!, result.error === "rate_limited" ? 429 : 401);
  return result;
}
export async function clientIdentity(req: Request) {
  return authorized(req, async (_tx, { user, device, token }) => ({
    username: user.username,
    discordId: user.discordId,
    deviceId: device.id,
    tokenExpiresAt: token.expiresAt,
  }));
}
export async function clientEntitlement(req: Request) {
  return authorized(req, async (tx, { user, token }) => {
    try {
      const p = await policy(tx, user);
      return {
        entitled: true,
        status: "active",
        plan: p.plan,
        expiresAt: p.ent.expiresAt,
        deviceLimit: p.deviceLimit,
        concurrentLimit: p.concurrentLimit,
        tokenExpiresAt: token.expiresAt,
        minClientVersion: env.MIN_CLIENT_VERSION || null,
      };
    } catch (e) {
      if (e instanceof ClientError && e.code === "not_entitled")
        return { entitled: false, status: "inactive" };
      throw e;
    }
  });
}
export async function beginSession(req: Request, body: unknown) {
  const parsed = z
    .object({
      instanceId: z.uuid(),
      clientVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    })
    .strict()
    .safeParse(body);
  if (!parsed.success) return fail("invalid_body", 400);
  return authorized(req, async (tx, ctx) => {
    const p = await policy(tx, ctx.user);
    await requireDeviceWithinLimit(tx, ctx, p.deviceLimit);
    if (!versionAllowed(parsed.data.clientVersion, env.MIN_CLIENT_VERSION))
      return fail("upgrade_required", 426);
    const now = new Date();
    const active = await tx
      .select()
      .from(clientSessions)
      .where(
        and(
          eq(clientSessions.userId, ctx.user.id),
          isNull(clientSessions.revokedAt),
          gt(clientSessions.expiresAt, now),
        ),
      );
    const existing = active.find(
      (x) =>
        x.deviceId === ctx.device.id &&
        x.instanceId === parsed.data.instanceId &&
        x.familyId === ctx.token.familyId,
    );
    if (!existing && active.length >= p.concurrentLimit)
      return fail("concurrent_limit");
    // Plan reductions apply to existing sessions in stable creation order on renewal.
    if (
      existing &&
      active
        .sort(
          (a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime() ||
            a.id.localeCompare(b.id),
        )
        .indexOf(existing) >= p.concurrentLimit
    )
      return fail("concurrent_limit");
    const expiresAt = new Date(
      Math.min(
        Date.now() + LEASE_SECONDS * 1000,
        p.ent.expiresAt?.getTime() ?? Infinity,
      ),
    );
    const session =
      existing ??
      (
        await tx
          .insert(clientSessions)
          .values({
            userId: ctx.user.id,
            deviceId: ctx.device.id,
            familyId: ctx.token.familyId!,
            instanceId: parsed.data.instanceId,
            expiresAt,
          })
          .returning()
      )[0];
    if (existing)
      await tx
        .update(clientSessions)
        .set({ expiresAt })
        .where(eq(clientSessions.id, session.id));
    if (!existing)
      await tx
        .insert(auditLog)
        .values({
          actorUserId: ctx.user.id,
          action: "client.session_started",
          target: session.id,
        });
    return { sessionId: session.id, expiresAt, heartbeatAfter: 60 };
  });
}
export function versionAllowed(version: string, minimum: string): boolean {
  if (!minimum) return true;
  if (!/^\d+\.\d+\.\d+$/.test(minimum)) return false;
  const a = version.split(".").map(Number),
    b = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}
export async function renewSession(req: Request, id: string, body: unknown) {
  const parsed = z
    .object({ clientVersion: z.string().regex(/^\d+\.\d+\.\d+$/) })
    .strict()
    .safeParse(body);
  if (!z.uuid().safeParse(id).success || !parsed.success)
    return fail("invalid_body", 400);
  return authorized(req, async (tx, ctx) => {
    const p = await policy(tx, ctx.user);
    await requireDeviceWithinLimit(tx, ctx, p.deviceLimit);
    if (!versionAllowed(parsed.data.clientVersion, env.MIN_CLIENT_VERSION))
      return fail("upgrade_required", 426);
    const active = await tx
      .select()
      .from(clientSessions)
      .where(
        and(
          eq(clientSessions.userId, ctx.user.id),
          isNull(clientSessions.revokedAt),
          gt(clientSessions.expiresAt, new Date()),
        ),
      )
      .orderBy(clientSessions.createdAt, clientSessions.id);
    const index = active.findIndex(
      (x) =>
        x.id === id &&
        x.deviceId === ctx.device.id &&
        x.familyId === ctx.token.familyId,
    );
    if (index < 0) return fail("session_expired", 401);
    if (index >= p.concurrentLimit) return fail("concurrent_limit");
    const expiresAt = new Date(
      Math.min(
        Date.now() + LEASE_SECONDS * 1000,
        p.ent.expiresAt?.getTime() ?? Infinity,
      ),
    );
    await tx
      .update(clientSessions)
      .set({ expiresAt })
      .where(eq(clientSessions.id, id));
    return { sessionId: id, expiresAt, heartbeatAfter: 60 };
  });
}
export async function endSession(req: Request, id: string) {
  if (!z.uuid().safeParse(id).success) return fail("invalid_body", 400);
  return authorized(req, async (tx, ctx) => {
    await tx
      .update(clientSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(clientSessions.id, id),
          eq(clientSessions.userId, ctx.user.id),
          eq(clientSessions.deviceId, ctx.device.id),
          eq(clientSessions.familyId, ctx.token.familyId!),
        ),
      );
    return { ok: true };
  });
}
export async function signOutClient(req: Request) {
  return authorized(req, async (tx, ctx) => {
    await revokeFamily(tx, ctx.token.familyId!);
    return { ok: true };
  });
}

/** Owner/admin revocation shares the allocation lock, and revokes credentials plus leases together. */
export async function revokeDevice(userId: string, deviceId: string) {
  if (!z.uuid().safeParse(deviceId).success) return fail("invalid_device", 400);
  return authTransaction(async (tx) => {
    await lockUser(tx, userId);
    const [device] = await tx
      .update(clientDevices)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(clientDevices.id, deviceId), eq(clientDevices.userId, userId)),
      )
      .returning();
    if (!device) return fail("not_found", 404);
    await tx
      .update(licenseTokens)
      .set({ revokedAt: new Date() })
      .where(eq(licenseTokens.deviceId, deviceId));
    await tx
      .update(clientRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(clientRefreshTokens.deviceId, deviceId));
    await tx
      .update(clientSessions)
      .set({ revokedAt: new Date() })
      .where(eq(clientSessions.deviceId, deviceId));
    await tx
      .insert(auditLog)
      .values({
        actorUserId: userId,
        action: "client.device_revoked",
        target: deviceId,
      });
    return { ok: true };
  });
}
export async function revokeOwnedToken(userId: string, tokenId: string) {
  return authTransaction(async (tx) => {
    await lockUser(tx, userId);
    const [token] = await tx
      .select()
      .from(licenseTokens)
      .where(
        and(eq(licenseTokens.id, tokenId), eq(licenseTokens.userId, userId)),
      )
      .limit(1);
    if (!token) return fail("not_found", 404);
    if (token.familyId) await revokeFamily(tx, token.familyId);
    else
      await tx
        .update(licenseTokens)
        .set({ revokedAt: new Date() })
        .where(eq(licenseTokens.id, tokenId));
    return { ok: true };
  });
}

/** Future paid server operations must use this gate, not just the identity-only authorized helper. */
export async function withLicensedSession<T>(
  req: Request,
  work: (tx: AuthTransaction, ctx: ClientContext) => Promise<T>,
): Promise<T> {
  const sessionId = req.headers.get("x-brulite-session");
  const version = req.headers.get("x-brulite-version") ?? "";
  if (!sessionId || !z.uuid().safeParse(sessionId).success)
    return fail("session_required", 401);
  return authorized(req, async (tx, ctx) => {
    const p = await policy(tx, ctx.user);
    await requireDeviceWithinLimit(tx, ctx, p.deviceLimit);
    if (
      !/^\d+\.\d+\.\d+$/.test(version) ||
      !versionAllowed(version, env.MIN_CLIENT_VERSION)
    )
      return fail("upgrade_required", 426);
    const sessions = await tx
      .select()
      .from(clientSessions)
      .where(
        and(
          eq(clientSessions.userId, ctx.user.id),
          isNull(clientSessions.revokedAt),
          gt(clientSessions.expiresAt, new Date()),
        ),
      )
      .orderBy(clientSessions.createdAt, clientSessions.id);
    const index = sessions.findIndex(
      (s) =>
        s.id === sessionId &&
        s.deviceId === ctx.device.id &&
        s.familyId === ctx.token.familyId,
    );
    if (index < 0) return fail("session_expired", 401);
    if (index >= p.concurrentLimit) return fail("concurrent_limit");
    return work(tx, ctx);
  });
}
