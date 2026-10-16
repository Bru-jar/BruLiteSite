import { renewSession, endSession, ClientError } from "@/lib/client-service";
import { clientResponse, clientBody } from "@/lib/client-response";
import { rateLimit, clientIp } from "@/lib/rate-limit";
type Context = { params: Promise<{ id: string }> };
export async function POST(req: Request, { params }: Context) {
  return clientResponse(async () => {
    if (!(await rateLimit(`heartbeat:${clientIp(req)}`, 120, 60_000)).ok)
      throw new ClientError("rate_limited", 429);
    return renewSession(req, (await params).id, await clientBody(req));
  });
}
export async function DELETE(req: Request, { params }: Context) {
  return clientResponse(async () => endSession(req, (await params).id));
}
