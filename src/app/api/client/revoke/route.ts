import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  signOutClient,
  revokeOwnedToken,
  ClientError,
} from "@/lib/client-service";
import { clientResponse, clientBody } from "@/lib/client-response";
export async function POST(req: Request) {
  return clientResponse(async () => {
    if (req.headers.has("authorization")) return signOutClient(req);
    const user = await getSession();
    if (!user) throw new ClientError("unauthorized", 401);
    const parsed = z
      .object({ tokenId: z.uuid() })
      .strict()
      .safeParse(await clientBody(req));
    if (!parsed.success) throw new ClientError("invalid_body", 400);
    return revokeOwnedToken(user.userId, parsed.data.tokenId);
  });
}
