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
ONLY to the selected staging URL. This command has not been run against any server.

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
