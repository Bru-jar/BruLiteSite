import { NextResponse, type NextRequest } from "next/server";
import {
  betaPath, callbackPath, hash, landingPath, oauthCookie, oauthSeconds,
  randomToken, sessionCookie, sessionSeconds, stateFor, verifyAttempt, webSessions, type WebConfig,
} from "./auth";
import { discord, discordRequest, guildMembership, isDiscordId } from "./discord";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

function redirect(location: string | URL) {
  return new NextResponse(null, { status: 303, headers: { ...headers, Location: String(location) } });
}

function setCookie(response: NextResponse, name: string, value: string, maxAge: number) {
  response.cookies.set(name, value, { path: "/", maxAge, httpOnly: true, secure: true, sameSite: "lax" });
}

function sameHost(request: NextRequest, config: WebConfig | null): config is WebConfig {
  return config !== null && request.nextUrl.origin === config.origin;
}

export function startOAuth(request: NextRequest, config: WebConfig | null) {
  if (!sameHost(request, config)) return redirect(landingPath + "?status=unavailable");
  const verifier = randomToken();
  const attempt = `${Math.floor(Date.now() / 1000)}.${verifier}`;
  const authorize = new URL(discord + "/oauth2/authorize");
  authorize.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.origin + callbackPath,
    response_type: "code",
    scope: "identify",
    state: stateFor(config, attempt),
    code_challenge: hash(verifier),
    code_challenge_method: "S256",
  }).toString();
  const response = redirect(authorize);
  setCookie(response, oauthCookie, attempt, oauthSeconds);
  return response;
}

export async function finishOAuth(
  request: NextRequest,
  config: WebConfig | null,
  sessions = config ? webSessions(config) : null,
  requestDiscord = discordRequest,
) {
  function complete(destination: string, token?: string) {
    const response = redirect(destination);
    setCookie(response, oauthCookie, "", 0);
    if (token) setCookie(response, sessionCookie, token, sessionSeconds);
    return response;
  }

  if (!sameHost(request, config) || !sessions) return complete(landingPath + "?status=unavailable");
  const params = request.nextUrl.searchParams;
  const [state, ...extraStates] = params.getAll("state");
  const [issuer, ...extraIssuers] = params.getAll("iss");
  const [code, ...extraCodes] = params.getAll("code");
  const attempt = request.cookies.get(oauthCookie)?.value;
  const verifier = state && attempt && !extraStates.length ? verifyAttempt(config, attempt, state) : null;
  if (!verifier || issuer !== discord || extraIssuers.length) return complete(landingPath + "?status=expired");
  if (params.get("error") === "access_denied" && !params.has("code")) {
    return complete(landingPath + "?status=cancelled");
  }
  if (!code || !/^[A-Za-z0-9._~-]{1,512}$/.test(code) || extraCodes.length || params.has("error")) {
    return complete(landingPath + "?status=failed");
  }
  try {
    const tokenResponse = await requestDiscord("/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.origin + callbackPath,
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
      }),
    });
    if (!tokenResponse.ok) return complete(landingPath + "?status=failed");
    const token = await tokenResponse.json();
    if (typeof token?.access_token !== "string" || !/^[!-~]{1,2048}$/.test(token.access_token) ||
        String(token.token_type).toLowerCase() !== "bearer" || token.scope !== "identify") {
      return complete(landingPath + "?status=failed");
    }
    const identityResponse = await requestDiscord("/users/@me", {
      headers: { Authorization: "Bearer " + token.access_token },
    });
    if (!identityResponse.ok) return complete(landingPath + "?status=failed");
    const identity = await identityResponse.json();
    if (!isDiscordId(identity?.id)) return complete(landingPath + "?status=failed");
    const membership = await guildMembership(config, identity.id, requestDiscord);
    if (membership !== "member") return complete(landingPath + "?status=" + membership);
    const name = [identity.global_name, identity.username]
      .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    return complete(betaPath, await sessions.create(identity.id, name?.trim().slice(0, 100) ?? "Discord user"));
  } catch {
    return complete(landingPath + "?status=failed");
  }
}

export async function signOut(
  request: NextRequest,
  config: WebConfig | null,
  sessions = config ? webSessions(config) : null,
) {
  if (!sameHost(request, config) || !sessions) return redirect(landingPath + "?status=unavailable");
  if (request.headers.get("origin") !== config.origin) {
    return new NextResponse("Forbidden", { status: 403, headers });
  }
  try {
    await sessions.revoke(request.cookies.get(sessionCookie)?.value);
  } catch {
    return redirect(landingPath + "?status=signout_failed");
  }
  const response = redirect(landingPath + "?status=signed_out");
  setCookie(response, sessionCookie, "", 0);
  setCookie(response, oauthCookie, "", 0);
  return response;
}
