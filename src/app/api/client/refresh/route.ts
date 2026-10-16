import { refreshAccess, ClientError } from "@/lib/client-service";
import { clientResponse, clientBody } from "@/lib/client-response";
import { rateLimit, clientIp } from "@/lib/rate-limit";
export async function POST(req: Request) {
  return clientResponse(async () => {
    if (!(await rateLimit(`refresh:${clientIp(req)}`, 30, 60_000)).ok)
      throw new ClientError("rate_limited", 429);
    return refreshAccess(req, await clientBody(req));
  });
}
