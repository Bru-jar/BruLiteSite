# Desktop authentication protocol 2

Status: implemented on the auth-hardening branch; local checks and isolated Neon database checks passed. Not deployed as a website.
This establishes identity, licensing, registered-device limits and server session leases.
It does not attest an executable, prevent local patching, or prove an OS process count.
No gameplay functionality has been moved to the server. A compatible Windows staging launcher has now implemented this protocol on the local
codex/launcher-authentication branch, with staging acceptance described below. It is
not published. A coordinated production rollout and the remaining enforcement work
are still required before production deployment.

## Decisions and defaults

The launcher may open without a licence. Starting paid functionality requires an online
entitlement check and running-client lease. Access credentials last 5 minutes; leases
last at most 3 minutes (capped by membership expiry) and renew every 60 seconds. A failed
connection never grants a lease. Registered devices and running-client leases have
independent limits for monthly/yearly/manual memberships. Initial policies are 2/2 for
each plan; these are migration defaults, not a pricing decision. Configure approved
commercial limits in Admin > Users before release. Per-user nullable overrides take
precedence; blank means use the plan. Explicit legacy seat limits other than 2 migrate
to overrides. Over-limit devices/sessions stop qualifying on renewal in stable order.

## Browser pairing

1. Generate and persist an installation ES256/P-256 key pair. Prefer a protected,
   non-exportable Windows key where available. Do not embed a shared product secret.
2. POST /api/client/pair with JSON {publicKey:{kty,crv,x,y},deviceName}. Only public
   key fields are accepted. Response: {code,retrievalSecret,verifyUrl,expiresIn:600,
   pollInterval:2,protocol:2}. Keep retrievalSecret in launcher memory, never in a URL.
3. Display the code and open verifyUrl on the configured HTTPS site. The browser logs
   in through Discord, compares its code with the launcher and explicitly approves.
   Browser approval is atomic and does not return a client credential to the browser.
4. GET /api/client/pair/{code} every 2 seconds with Authorization: Pair <retrievalSecret>
   and a signed proof (below). HTTP 202 means pending. Both pending and approved codes
   expire after ten minutes. Successful collection registers/reuses the installation
   and returns {status:complete,token,refreshToken,tokenType:DPoP,expiresIn:300,
   refreshExpiresAt,deviceId,protocol:2}. Collection is atomic and single-use. Interrupted
   delivery requires a fresh browser pairing; reusing the installation key reuses its
   seat. A fresh pairing revokes the previous credential family for that installation.
5. Protect the refresh credential at rest (for example per-user Windows DPAPI). Never
   log credentials, proofs, retrieval secrets or full device keys. Raw credentials are
   never stored in the database; legacy pending plaintext is scrubbed by migration.

## Request proofs and credential rotation

Each protected request includes a fresh DPoP header: an ES256 JWT signed by the enrolled
installation key. Protected header: {alg:ES256,typ:dpop+jwt,jwk:<public key>}. Claims:
- jti: new UUID; iat: current epoch seconds; exp: at most iat+60 seconds.
- htm: uppercase HTTP method; htu: configured site origin + pathname, excluding query.
- ath: base64url SHA-256 of the credential authorizing this request (access token,
  pairing retrieval secret or refresh token, depending on the operation).

Proofs are accepted only in a short clock window. Protected access proofs are consumed
once per installation in the database, including rejected business operations. A copied
credential without its private key is insufficient. DPoP-style proofs are used with
BruLite-specific pairing/refresh endpoints; this is not a general OAuth authorization
server. The launcher must create a new proof on each retry. It must not retry a consumed
refresh credential: uncertain delivery requires re-pairing. There is no claim that a
key can never be used by modified software on its authorized machine.

Access requests use Authorization: DPoP <token>. GET /api/client/me returns identity;
GET /api/client/entitlement returns the current membership and effective limits.
POST /api/client/refresh with {refreshToken} and its proof rotates BOTH credentials.
Old refresh reuse revokes the entire family, including replacement access credentials
and running leases. Rotation is serialized per account and has an absolute 90-day
family expiry. Expired families require browser pairing. POST /api/client/revoke with
access authorization/proof signs out and revokes the family; website users/admins can
also disconnect a device, revoking all of its families and leases.

## Running-client sessions

POST /api/client/sessions with {instanceId:<fresh UUID per game instance>,clientVersion:
MAJOR.MINOR.PATCH} and access authorization/proof starts a lease. Response:
{sessionId,expiresAt,heartbeatAfter:60}. Reusing instanceId for an already active lease
is idempotent; it cannot revive an expired lease. POST /api/client/sessions/{id} with
{clientVersion} renews; DELETE ends it. Each request is bound to the account, installation
and credential family. Current membership, plan/account limits and minimum version are
checked again on renewals. No cached local boolean or token alone grants a new lease.
A client-reported version is a compatibility check, not tamper attestation.

Future paid server operations MUST use withLicensedSession with X-BruLite-Session and
X-BruLite-Version, plus access authorization/proof. It rechecks current entitlement,
lease ownership/expiry and limits on every request. authorized alone is identity-only.
Do not turn a heartbeat into blanket permission for independent backend operations.
A modified client can multiplex local processes through one logical session; the
server counts leases, not independently attested OS processes. Valuable server work
still needs resource quotas and abuse controls. Fully local plugins remain patchable.

## Website protection and operations

Website sessions and OAuth state use separate derived signing keys, required types,
audiences, issuer and claim validation. OAuth state also requires a matching HttpOnly
browser nonce and one-time database record. Web sessions are database-backed/revocable;
admin roles are rechecked against Discord for admin pages and API operations. API cookie
mutations enforce the configured origin via Next.js Node proxy; native requests use
proofs, not website cookies. AUTH_SECRET must be random and at least 32 characters.
Use Node 22+ for the request-scoped Neon WebSocket transaction driver. Keep public HTTP
access through trusted Vercel ingress; x-forwarded-for is not trustworthy on an exposed
origin. Rate limits are atomic shared database buckets and database failure denies
access. New authentication bodies are capped at 8 KiB; credential responses use no-store.

Set CRON_SECRET to a separate random secret of at least 32 characters. Schedule an
hourly GET /api/internal/auth-cleanup with Authorization: Bearer <CRON_SECRET> to remove
expired proofs, login attempts, web sessions, pairings and old limiter buckets. There
is no public cleanup action or automatic deployment/migration in the build.

## Rollout and validation

1. Review migration 0004_auth_hardening.sql and configure plan defaults/overrides.
2. Use a separate Neon staging branch and staging Discord OAuth app/redirect URL.
   Never point a preview deployment at the production database for migration testing.
3. Apply migrations to staging, deploy the backend, then exercise a compatible launcher
   end to end: browser approval, renewal, expiry, reconnect, sign-out, cancellation,
   device replacement, parallel clients, role removal and administrator revocation.
4. Test independent concurrent database connections on staging. Local PGlite tests
   exercise real SQL and transactions but serialize through one embedded engine;
   they do not prove Neon multi-connection behavior or Vercel ingress configuration.
5. Coordinate a production maintenance window. The migration scrubs old pending tokens
   and revokes unbound legacy desktop tokens. Existing web cookies also require fresh
   sign-in because the token validation/signing purposes changed. Raw key minting and
   regeneration now return 426 pairing_required. Old clients cannot authenticate.
6. Back up first; deploy migration plus compatible server/client together. Do not restore
   old credentials or re-enable bearer-only fallback as a rollback. Keep the prior app
   for operational recovery, but gate desktop access during a failed rollout.

Local verification: TypeScript, production build, ESLint on changed files, and isolated
PostgreSQL/cryptographic tests. No production migration has been performed. Local staging browser sign-in and browser-approved HTTP pairing have now passed; see the staging setup record. Synthetic
credentials were issued only inside the isolated staging database and removed after testing. Full-repository lint has an existing mobile-menu set-state-in-effect
violation unrelated to this change. This hardening is not a penetration-test certificate
or a promise of crack-proof software.

Verification summary (2026-10-16): 48 tests passed across six files; TypeScript and
changed-source ESLint passed; production build passed without the former Edge
middleware warnings. Runtime npm audit: zero advisories. Full npm audit: nine
inherited development-tool advisories (Drizzle tooling / ESLint dependency trees);
no forced package downgrades or unrelated dependency changes were applied. Full
repository ESLint remains blocked by the pre-existing mobile-menu effect violation.
See [staging setup](staging-setup.md) for the next user action. The staging checker
was exercised without a config file and correctly refused to migrate anything.

The isolated Neon verification also passed using independent WebSocket connections:
last-device allocation, proof replay, last-session allocation, refresh reuse revoking
replacement credentials, lease expiry and revoked membership. The blank staging database
has all five migrations; synthetic verification records were removed. This strengthens
the database concurrency evidence but does not complete the browser/launcher acceptance
tests or verify a deployed Vercel environment. See the updated staging setup record.

Local browser acceptance subsequently passed with the staging Discord application,
test guild and isolated Neon database: the user completed OAuth and a manual membership
grant; read-only checks confirmed the persisted session and Customer role. The
browser-approved HTTP probe passed device-bound pairing, identity/licensing checks,
missing-proof and replay rejection, session creation/renewal, refresh rotation and
sign-out. Its temporary installation and credentials were revoked afterward. The Windows staging launcher subsequently implemented protocol 2 and Windows-protected
credential storage as recorded below. This evidence does not authorize a production rollout.


## Native Windows staging acceptance

The local native launcher now implements browser code pairing, a persisted
non-exportable Windows Software KSP ES256 key, DPAPI-protected refresh storage,
serialized refresh rotation, identity/membership checks and online client leases.
Normal/account/command-line launches and explicit attach entry points are gated;
explicit attach itself still awaits live acceptance. Production transport is pinned
to HTTPS; local staging is a separate compile-time configuration and credential scope.
Direct DLL/plugin enforcement is separate work and is not claimed complete.

Real native tests passed browser-approved pairing, saved-sign-in restoration, session
allocation/end and periodic heartbeat renewal. The user confirmed game launch, normal
manual close, membership revocation closing the game and showing Membership check
required, and regrant/recheck recovery. Read-only checks confirmed the corresponding
membership/session records and Customer role removal/restoration.

An authorized local endpoint-outage test stopped only the guarded localhost staging
server while a test game ran at its login screen. The game exited when its existing
lease elapsed, while the launcher remained running and staging remained offline. The
server lease expired naturally without explicit revocation; no active native leases
remained, and membership was preserved. The staging site was restarted and returned
HTTP 200. The latest native build subsequently passed an authorized repeat: the
game exited just after lease expiry, its protected refresh survived, and the user
confirmed Check membership restored Licence active without browser sign-in. No
new game lease was created by recovery. This run did not cross access-token expiry
while offline; native worker/DPAPI fixtures cover that boundary. This tests a failed
endpoint connection, not every internet failure mode or full executable integrity.
Production and hosted Vercel configuration remain unchanged.
