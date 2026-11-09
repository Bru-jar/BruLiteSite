import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { matrixAuthStore, type Query } from "./store";

const discord = "https://discord.com";
export const matrixAuthPath = "/api/matrix/auth";
const cookieName = "__Secure-matrix-approval";
const keyPattern = /^[A-Za-z0-9_-]{43}$/;
const idPattern = /^[1-9][0-9]{16,19}$/;
const codePattern = /^[0-9]{6}$/;
const key = () => randomBytes(32).toString("base64url");
const hash = (value: string) => createHash("sha256").update(value).digest("base64url");

type Config = { origin: string; clientId: string; clientSecret: string; allowedUserId: string };
type DiscordResponse = Record<string, unknown>;
type DiscordJson = (url: string, options: RequestInit) => Promise<DiscordResponse>;

const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "Content-Type": "text/plain; charset=utf-8",
};

function reply(status: number, text: string, extra?: Record<string, string>) {
  return new Response(text, { status, headers: { ...headers, ...extra } });
}

export function unavailable() {
  return reply(503, "Matrix authentication is unavailable.");
}

export function readMatrixAuthConfig(env: Readonly<Record<string, string | undefined>>): Config | null {
  const origin = env.MATRIX_AUTH_ORIGIN;
  const clientId = env.MATRIX_DISCORD_CLIENT_ID;
  const clientSecret = env.MATRIX_DISCORD_CLIENT_SECRET;
  const allowedUserId = env.MATRIX_DISCORD_ALLOWED_USER_ID;
  if (!origin || !clientId || !clientSecret || !allowedUserId || !idPattern.test(clientId) ||
      !idPattern.test(allowedUserId) || !/^[!-~]{16,256}$/.test(clientSecret)) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin) return null;
  } catch { return null; }
  return { origin, clientId, clientSecret, allowedUserId };
}

function credential(request: Request, scheme: string) {
  const value = request.headers.get("authorization");
  const token = value?.startsWith(scheme + " ") ? value.slice(scheme.length + 1) : "";
  return keyPattern.test(token) ? hash(token) : null;
}

function browserHash(request: Request) {
  const matching = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim())
    .filter(value => value.startsWith(cookieName + "="));
  const value = matching.length === 1 ? matching[0].slice(cookieName.length + 1) : "";
  return keyPattern.test(value) ? hash(value) : null;
}

function cookie(value: string, maxAge: number) {
  return cookieName + "=" + value + "; Path=" + matrixAuthPath + "/; Max-Age=" + maxAge +
    "; HttpOnly; Secure; SameSite=Lax";
}

function redirect(path: string, value?: string) {
  return reply(303, "", { Location: matrixAuthPath + path,
    ...(value === undefined ? {} : { "Set-Cookie": cookie(value, value ? 300 : 0) }) });
}

function approvalForm(status = 200) {
  const text = status === 400 ? "<p>That code did not match. Check your Matrix window and try again.</p>" : "";
  const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Approve Matrix sign-in</title><main><h1>Approve Matrix sign-in</h1>' +
    '<p>Enter the six-digit code shown in the Matrix launcher you opened yourself.</p>' + text +
    '<form method="post" action="' + matrixAuthPath + '/approve"><label>Matrix code ' +
    '<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label> ' +
    '<button type="submit">Approve sign-in</button></form></main></html>';
  return reply(status, html, { "Content-Type": "text/html; charset=utf-8", "Referrer-Policy": "same-origin" });
}

async function limitedText(body: ReadableStream<Uint8Array> | null, maxBytes: number) {
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let value = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return value + decoder.decode();
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error("Request or response exceeded its limit");
      }
      value += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

async function readDiscordJson(url: string, options: RequestInit) {
  const response = await fetch(url, { ...options, cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(8000) });
  if (!response.ok || !response.body) throw new Error("Discord request failed");
  return JSON.parse(await limitedText(response.body, 16384)) as DiscordResponse;
}

export function matrixAuthHandler(config: Config, query: Query, discordJson: DiscordJson = readDiscordJson) {
  const store = matrixAuthStore(query);
  const redirectUri = config.origin + matrixAuthPath + "/callback";
  const blind = (purpose: string, value: string) => createHmac("sha256", config.clientSecret)
    .update(purpose + "\n" + value).digest("base64url");

  async function callback(url: URL) {
    const params = url.searchParams;
    const state = params.getAll("state");
    const attempt = state.length === 1 && keyPattern.test(state[0]) ? await store.acceptCallback(hash(state[0])) : null;
    if (!attempt) return reply(400, "This Matrix sign-in request is invalid or expired.");

    const issuer = params.getAll("iss");
    const code = params.getAll("code");
    if (issuer.length !== 1 || issuer[0] !== discord) {
      await store.finishCallback(attempt.id, "FAILED");
      return redirect("/complete", "");
    }
    if (params.getAll("error").length === 1 && code.length === 0) {
      await store.finishCallback(attempt.id, "CANCELLED");
      return redirect("/complete", "");
    }

    let identity: unknown;
    try {
      if (code.length !== 1 || !/^[A-Za-z0-9._~-]{1,512}$/.test(code[0]) || params.has("error")) {
        throw new Error("Invalid authorization code");
      }
      const token = await discordJson(discord + "/api/v10/oauth2/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri,
          grant_type: "authorization_code", code: code[0], code_verifier: attempt.verifier,
        }),
      });
      if (typeof token?.access_token !== "string" || !/^[!-~]{1,2048}$/.test(token.access_token) ||
          String(token.token_type).toLowerCase() !== "bearer" || token.scope !== "identify") {
        throw new Error("Invalid Discord token response");
      }
      const user = await discordJson(discord + "/api/v10/users/@me", {
        headers: { Authorization: "Bearer " + token.access_token },
      });
      identity = user?.id;
    } catch {
      await store.finishCallback(attempt.id, "FAILED");
      return redirect("/complete", "");
    }
    if (identity !== config.allowedUserId) {
      await store.finishCallback(attempt.id, "DENIED");
      return redirect("/complete", "");
    }
    const browser = key();
    const saved = await store.finishCallback(attempt.id, "APPROVAL", config.allowedUserId, hash(browser));
    return saved ? redirect("/approve", browser) : redirect("/complete", "");
  }

  async function approve(request: Request) {
    const browser = browserHash(request);
    if (!browser) return reply(401, "Start sign-in from Matrix.");
    if (request.method === "GET") {
      return await store.awaitingApproval(browser) ? approvalForm() : reply(401, "This sign-in expired.");
    }
    if (request.method !== "POST" || request.headers.get("origin") !== config.origin ||
        !request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
      return reply(403, "Invalid Matrix approval request.");
    }
    let code: string | undefined;
    try {
      const codes = new URLSearchParams(await limitedText(request.body, 64)).getAll("code");
      if (codes.length === 1 && codePattern.test(codes[0])) code = codes[0];
    } catch {
      return reply(400, "Invalid Matrix approval code.");
    }
    if (code === undefined) return approvalForm(400);
    const status = await store.approve(browser, blind("approval", code));
    return status === "APPROVAL" ? approvalForm(400) : redirect("/complete", "");
  }

  return async (request: Request) => {
    const url = new URL(request.url);
    if (url.origin !== config.origin || !url.pathname.startsWith(matrixAuthPath + "/")) {
      return reply(404, "Matrix authentication endpoint not found.");
    }
    const route = url.pathname.slice(matrixAuthPath.length);
    try {
      if (route === "/callback" && request.method === "GET") return await callback(url);
      if (route === "/approve" && !url.search) return await approve(request);
      if (route === "/complete" && request.method === "GET" && !url.search) {
        return reply(200, "Return to Matrix to see the sign-in result. You can close this tab.");
      }
      if (request.headers.has("origin") || url.search || request.body !== null) {
        return reply(400, "Invalid Matrix API request.");
      }

      if (route === "/health" && request.method === "GET") {
        await store.ready();
        return reply(200, "READY");
      }
      if (route === "/desktop/start" && request.method === "POST") {
        const bucket = Math.floor(Date.now() / 300000);
        const ip = (request.headers.get("x-vercel-forwarded-for") ?? "unknown").slice(0, 64);
        if (!await store.limit(bucket, blind("start:" + bucket, ip), 8) ||
            !await store.limit(bucket, "global", 128)) return reply(429, "Too many Matrix sign-ins.");
        await store.prune(bucket);

        const handle = key();
        const state = key();
        const verifier = key();
        const code = randomInt(100000, 1000000).toString();
        await store.start(hash(handle), hash(state), verifier, blind("approval", code));
        const authorize = new URL(discord + "/oauth2/authorize");
        authorize.search = new URLSearchParams({
          client_id: config.clientId, response_type: "code", scope: "identify", redirect_uri: redirectUri, state,
          code_challenge: hash(verifier), code_challenge_method: "S256",
        }).toString();
        return reply(200, handle + "\n" + code + "\n" + authorize.href);
      }
      if ((route === "/desktop/poll" || route === "/desktop/cancel") && request.method === "POST") {
        const id = credential(request, "Pair");
        if (!id) return reply(401, "Missing Matrix pairing credential.");
        if (route === "/desktop/cancel") {
          await store.cancel(id);
          return reply(200, "CANCELLED");
        }
        const token = key();
        return await store.claim(id, hash(token))
          ? reply(200, "VERIFIED\n" + token) : reply(200, await store.phase(id));
      }
      const revoke = route === "/session/revoke" && request.method === "POST";
      if (revoke || (route === "/session" && request.method === "GET")) {
        const id = credential(request, "Bearer");
        const subject = id ? await store.session(id, revoke) : null;
        if (!subject || subject !== config.allowedUserId) return reply(401, "No active Matrix session.");
        return reply(200, revoke ? "REVOKED" : "VERIFIED\n" + subject);
      }
      return reply(404, "Matrix authentication endpoint not found.");
    } catch {
      return unavailable();
    }
  };
}
