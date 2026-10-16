import { collectPairing, ClientError } from "@/lib/client-service";
import { clientResponse } from "@/lib/client-response";
import { rateLimit, clientIp } from "@/lib/rate-limit";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  return clientResponse(async () => {
    if (!(await rateLimit(`pair-poll:${clientIp(req)}`, 60, 60_000)).ok)
      throw new ClientError("rate_limited", 429);
    return collectPairing(req, (await params).code);
  });
}
