import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientDevices, clientSessions } from "@/lib/db/schema";
import { getSession } from "@/lib/auth";
import { clientResponse, clientBody } from "@/lib/client-response";
import { ClientError, revokeDevice } from "@/lib/client-service";
import { z } from "zod";
export async function GET() {
  return clientResponse(async () => {
    const user = await getSession();
    if (!user) throw new ClientError("unauthorized", 401);
    const devices = await db
      .select({
        id: clientDevices.id,
        name: clientDevices.name,
        createdAt: clientDevices.createdAt,
        revokedAt: clientDevices.revokedAt,
      })
      .from(clientDevices)
      .where(eq(clientDevices.userId, user.userId));
    const sessions = await db
      .select({
        id: clientSessions.id,
        deviceId: clientSessions.deviceId,
        expiresAt: clientSessions.expiresAt,
      })
      .from(clientSessions)
      .where(
        and(
          eq(clientSessions.userId, user.userId),
          isNull(clientSessions.revokedAt),
          gt(clientSessions.expiresAt, new Date()),
        ),
      );
    return { devices, sessions };
  });
}
export async function DELETE(req: Request) {
  return clientResponse(async () => {
    const user = await getSession();
    if (!user) throw new ClientError("unauthorized", 401);
    const body = z
      .object({ deviceId: z.uuid() })
      .strict()
      .safeParse(await clientBody(req));
    if (!body.success) throw new ClientError("invalid_body", 400);
    return revokeDevice(user.userId, body.data.deviceId);
  });
}
