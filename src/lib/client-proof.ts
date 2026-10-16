import { calculateJwkThumbprint, importJWK, jwtVerify, type JWK } from "jose";
import { z } from "zod";
import { createHash } from "crypto";
import { env } from "@/lib/env";

export const publicKeySchema = z
  .object({
    kty: z.literal("EC"),
    crv: z.literal("P-256"),
    x: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    y: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export type PublicKey = z.infer<typeof publicKeySchema>;
export function credentialHash(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}
export async function keyThumbprint(key: PublicKey) {
  return calculateJwkThumbprint(key as JWK, "sha256");
}

/** DPoP proves key possession, not that the executable is untampered. Replay is consumed in the DB. */
export async function verifyClientProof(
  req: Request,
  key: PublicKey,
  credential: string,
): Promise<string | null> {
  try {
    const proof = req.headers.get("dpop");
    if (!proof || proof.length > 4096) return null;
    const { payload, protectedHeader } = await jwtVerify(
      proof,
      await importJWK(key, "ES256"),
      {
        algorithms: ["ES256"],
        requiredClaims: ["iat", "exp", "jti"],
        maxTokenAge: "60s",
        clockTolerance: 5,
      },
    );
    if (
      protectedHeader.typ !== "dpop+jwt" ||
      !protectedHeader.jwk ||
      !publicKeySchema.safeParse(protectedHeader.jwk).success ||
      (await keyThumbprint(protectedHeader.jwk as PublicKey)) !==
        (await keyThumbprint(key))
    )
      return null;
    const now = Math.floor(Date.now() / 1000);
    if (
      !z.uuid().safeParse(payload.jti).success ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      payload.iat > now + 5 ||
      payload.exp > payload.iat + 60
    )
      return null;
    const expected = new URL(new URL(req.url).pathname, env.APP_URL).href;
    if (
      payload.htm !== req.method.toUpperCase() ||
      payload.htu !== expected ||
      payload.ath !== credentialHash(credential)
    )
      return null;
    return payload.jti!;
  } catch {
    return null;
  }
}
