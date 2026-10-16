import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { authTransaction } from "@/lib/db/transaction";
import {
  clientDevices,
  clientSessions,
  licenseTokens,
  users,
  auditLog,
} from "@/lib/db/schema";
import { clientResponse } from "@/lib/client-response";
import {
  ClientError,
  revokeDevice,
  revokeOwnedToken,
} from "@/lib/client-service";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, { params }: Context) {
  try {
    await requireAdmin();
  } catch (e) {
    return e as Response;
  }
  return clientResponse(async () => {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success)
      throw new ClientError("not_found", 404);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!user) throw new ClientError("not_found", 404);
    const devices = await db
      .select({
        id: clientDevices.id,
        name: clientDevices.name,
        createdAt: clientDevices.createdAt,
        revokedAt: clientDevices.revokedAt,
      })
      .from(clientDevices)
      .where(eq(clientDevices.userId, id));
    const sessions = await db
      .select({
        id: clientSessions.id,
        deviceId: clientSessions.deviceId,
        expiresAt: clientSessions.expiresAt,
      })
      .from(clientSessions)
      .where(
        and(
          eq(clientSessions.userId, id),
          isNull(clientSessions.revokedAt),
          gt(clientSessions.expiresAt, new Date()),
        ),
      );
    const tokens = await db
      .select({
        id: licenseTokens.id,
        label: licenseTokens.label,
        deviceName: licenseTokens.deviceName,
        boundAt: licenseTokens.boundAt,
        createdAt: licenseTokens.createdAt,
        expiresAt: licenseTokens.expiresAt,
        lastUsedAt: licenseTokens.lastUsedAt,
        revokedAt: licenseTokens.revokedAt,
      })
      .from(licenseTokens)
      .where(eq(licenseTokens.userId, id))
      .orderBy(desc(licenseTokens.createdAt));
    return {
      deviceLimit: user.deviceLimitOverride,
      concurrentLimit: user.concurrentLimitOverride,
      devices,
      sessions,
      tokens,
    };
  });
}
const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_limit"),
    deviceLimit: z.number().int().min(1).max(100).nullable(),
    concurrentLimit: z.number().int().min(1).max(100).nullable().optional(),
  }),
  z.object({ action: z.literal("revoke"), tokenId: z.uuid() }),
  z.object({ action: z.literal("revoke_device"), deviceId: z.uuid() }),
]);
export async function POST(req: Request, { params }: Context) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return e as Response;
  }
  return clientResponse(async () => {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success)
      throw new ClientError("not_found", 404);
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ClientError("invalid_body", 400);
    if (parsed.data.action === "revoke_device")
      return revokeDevice(id, parsed.data.deviceId);
    if (parsed.data.action === "revoke")
      return revokeOwnedToken(id, parsed.data.tokenId);
    const data = parsed.data;
    await authTransaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, id))
        .for("update");
      if (!user) throw new ClientError("not_found", 404);
      await tx
        .update(users)
        .set({
          deviceLimitOverride: data.deviceLimit,
          concurrentLimitOverride: data.concurrentLimit,
        })
        .where(eq(users.id, id));
      await tx
        .insert(auditLog)
        .values({
          actorUserId: admin.userId,
          action: "license.user_limits_changed",
          target: id,
          meta: data,
        });
    });
    return { ok: true };
  });
}
