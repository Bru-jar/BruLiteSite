# Set up isolated authentication staging

The local branch is codex/auth-hardening in D:\Dev\repos\BruLiteSite. The live site
is still running the previous authentication protocol. Do not use db:migrate here:
that existing command reads .env.local. Keep that production file unchanged.

## First action: Neon

1. Open the Neon console and select the project currently used by BruLiteSite.
2. Create a new branch called auth-staging. Use schema-only branching if offered,
   so customer records and existing credentials are not copied.
3. On this NEW branch create a new, empty database called brulite_auth_staging.
   Do not use the inherited neondb database: schema-only copies may have table
   definitions without migration-history rows, which is unsuitable for replaying
   the full migration chain. A new blank database avoids that ambiguity.
4. Select the new branch AND brulite_auth_staging in Connect. Copy its PostgreSQL
   connection string into the ignored local file .env.staging.local:

```dotenv
BRULITE_ENV=staging
DATABASE_URL=<connection string for auth-staging / brulite_auth_staging>
AUTH_SECRET=<new random secret, at least 32 characters>
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

Use the editor to fill values; do not paste secrets into chat or shell history.
To generate a secret locally, run the following in a private terminal and paste
its output directly into the ignored environment file:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

The guarded checker performs no network/database operation:

```powershell
node --import tsx scripts/migrate-staging.ts --check
```

It rejects the configured production endpoint (including pooled/unpooled aliases),
the production app URL, reused AUTH_SECRET, and the wrong database name. Once the
configuration is reviewed, the same command without --check applies migrations
ONLY to the selected staging URL. It has been run only against the isolated staging database, as recorded below.

## Hosted staging and Discord (after the first step is verified)

Create a separate Vercel project named brulite-staging, connected to the reviewed
branch. Do not copy the production project's environment wholesale. Set DATABASE_URL
to the staging connection string; use the new AUTH_SECRET and the staging project's
fixed HTTPS URL as NEXT_PUBLIC_APP_URL. Use Node 22 or later.

Create a separate Discord application for staging. Register its exact callback:
https://<staging-host>/api/auth/callback/discord. Populate staging DISCORD_CLIENT_ID,
DISCORD_CLIENT_SECRET and a staging bot token. Use a test guild and test role IDs:
sign-in may auto-join the configured guild, and membership changes may modify roles.
Only invite test accounts. Use Stripe test-mode keys/webhooks if billing is exercised;
never copy live Stripe keys. Use test Blob storage if uploads are exercised. Keep all
such values in the staging project's environment and the ignored staging file only.

A fixed staging URL is important: OAuth redirects and signed request targets must
agree exactly. If Vercel deployment protection is enabled, arrange access for both
the browser and test launcher; do not embed a deployment bypass secret in a client
that will be distributed. No hosted staging deployment has been created yet.

## Acceptance before production

- Apply the migration to staging and grant a test account manual membership.
- Configure monthly/yearly/manual device and concurrent-client limits in Admin > Users.
- Use a compatible launcher, with an installation key and protocol 2.
- Test browser sign-in and code comparison; sign-out and expired credentials;
  token replay/reuse; device replacement/revocation; independent concurrent
  connections racing for the last device/session slot; membership revocation;
  network interruption/reconnect; and administrator-role removal.
- Verify the Vercel ingress and hourly credential-protected cleanup schedule.
- Approve the production rollout separately, including forced reauthentication
  and retiring old launcher builds. No production migration or deployment is implied.

References:
- https://neon.com/docs/get-started-with-neon/workflow-primer
- https://vercel.com/docs/deployments/environments
- https://vercel.com/docs/environment-variables
- https://discord.com/developers/docs/topics/oauth2

## Database verification completed (2026-10-16)

The supplied connection initially contained a psql wrapper; only its PostgreSQL URL
was retained in the ignored staging file. The endpoint was checked against the local
production configuration. The supplied branch contained a clone of the main database.
A new blank brulite_auth_staging database was created on that separate staging endpoint;
the inherited database and its copied records were left untouched. The staging URL was
updated to target the blank database, the migration guard passed, and all five reviewed
migrations were applied there. No production migration or application deployment ran.

Run the opt-in verification only after the staging configuration has passed the guard:

```powershell
node --import tsx scripts/verify-staging.ts
```

This invokes the actual service/Neon WebSocket transaction implementation using separate
connections, not the embedded test engine. It creates one synthetic account and temporary
credentials, tests races for the final device and running-client slots, proof replay,
concurrent refresh reuse, lease expiry and revoked membership, then removes its fixtures.
It does not call Discord or Stripe and never displays credentials. All checks passed.
The staging migration history contains the five expected migrations. Real browser OAuth,
hosted deployment configuration and a compatible native launcher remain to be verified.

## Local browser staging

Once the separate Discord application and test guild settings are saved in
.env.staging.local, run:

```powershell
node --import tsx scripts/dev-staging.ts --check
node --import tsx scripts/dev-staging.ts
```

Open http://localhost:3001/auth/signin. The helper requires a distinct Discord
application, bot and guild configuration, verifies the isolated database and
signing key, blanks every variable from other local environment files, and only
passes staging authentication settings to Next. Billing, Blob storage and ticket
integrations stay disabled even if such keys were copied into the staging file.
It binds to loopback only. Stop with Ctrl+C. Do not use plain next dev for staging:
Next normally falls back to .env.local for unset values.

The staging application/token match, registered local callback and test guild role
IDs were verified through read-only Discord requests on 2026-10-16. Actual Next env
loading retained staging credentials and blocked production service fallback.
Local HTTP checks rejected an invalid OAuth state, redirected anonymous dashboard
access to sign-in, returned 401 for anonymous client identity, and rejected a
cross-origin cookie mutation. Browser navigation reached Discord authorization;
user consent and the successful callback remain to be tested. Put the staging bot
role above Customer before testing role assignment.
