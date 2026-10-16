import { beginSession, ClientError } from "@/lib/client-service";
import { clientResponse, clientBody } from "@/lib/client-response";
import { rateLimit, clientIp } from "@/lib/rate-limit";
export async function POST(req: Request) {
  return clientResponse(async () => {
    if (!(await rateLimit(`session:${clientIp(req)}`, 60, 60_000)).ok)
      throw new ClientError("rate_limited", 429);
    return beginSession(req, await clientBody(req));
  });
}
