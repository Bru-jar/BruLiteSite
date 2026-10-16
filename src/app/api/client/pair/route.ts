import { createPairing } from "@/lib/client-service";
import { clientResponse, clientBody } from "@/lib/client-response";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { ClientError } from "@/lib/client-service";
export async function POST(req: Request) {
  return clientResponse(async () => {
    if (!(await rateLimit(`pair-create:${clientIp(req)}`, 10, 60_000)).ok)
      throw new ClientError("rate_limited", 429);
    return createPairing(await clientBody(req));
  });
}
