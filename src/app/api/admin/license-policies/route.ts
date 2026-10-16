import { eq } from "drizzle-orm";
import { z } from "zod";
import { authTransaction } from "@/lib/db/transaction";
import { db } from "@/lib/db/client";
import { licensePolicies, auditLog } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { clientResponse } from "@/lib/client-response";
import { ClientError } from "@/lib/client-service";
export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return e as Response;
  }
  return clientResponse(() =>
    db.select().from(licensePolicies).orderBy(licensePolicies.plan),
  );
}
export async function PUT(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    return e as Response;
  }
  return clientResponse(async () => {
    const parsed = z
      .object({
        plan: z.enum(["monthly", "yearly", "manual"]),
        deviceLimit: z.number().int().min(1).max(100),
        concurrentLimit: z.number().int().min(1).max(100),
      })
      .strict()
      .safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ClientError("invalid_body", 400);
    await authTransaction(async (tx) => {
      const rows = await tx
        .update(licensePolicies)
        .set({
          deviceLimit: parsed.data.deviceLimit,
          concurrentLimit: parsed.data.concurrentLimit,
        })
        .where(eq(licensePolicies.plan, parsed.data.plan))
        .returning({ plan: licensePolicies.plan });
      if (!rows.length) throw new ClientError("not_found", 404);
      await tx
        .insert(auditLog)
        .values({
          actorUserId: admin.userId,
          action: "license.policy_changed",
          target: parsed.data.plan,
          meta: parsed.data,
        });
    });
    return { ok: true };
  });
}
