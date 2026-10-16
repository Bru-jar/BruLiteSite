import { clientEntitlement, ClientError } from "@/lib/client-service";
import { clientResponse } from "@/lib/client-response";
import { rateLimit, clientIp } from "@/lib/rate-limit";
export async function GET(req: Request) {
  return clientResponse(async () => {
    if (!(await rateLimit(`entitlement:${clientIp(req)}`, 120, 60_000)).ok)
      throw new ClientError("rate_limited", 429);
    return clientEntitlement(req);
  });
}
