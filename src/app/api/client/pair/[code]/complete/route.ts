import { env } from "@/lib/env";
import { getSession } from "@/lib/auth";
import { approvePairing, ClientError } from "@/lib/client-service";
import { clientResponse } from "@/lib/client-response";
import { rateLimit } from "@/lib/rate-limit";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  return clientResponse(async () => {
    const user = await getSession();
    if (!user) throw new ClientError("unauthorized", 401);
    if (req.headers.get("origin") !== new URL(env.APP_URL).origin)
      throw new ClientError("forbidden", 403);
    if (!(await rateLimit(`pair-approve:${user.userId}`, 20, 60_000)).ok)
      throw new ClientError("rate_limited", 429);
    return approvePairing((await params).code, user.userId);
  });
}
