# BruLite

The official website for **BruLite** — a custom OSRS client. Users sign in with
Discord (auto-joined to the server), buy a membership via Stripe, download the
client, browse the plugin showcase, and file bug/feature tickets that mirror to
Discord.

**Stack:** Next.js (App Router) · TypeScript · Tailwind v4 · Neon Postgres +
Drizzle · Stripe · Discord OAuth + bot REST · Vercel Blob

## Core principle

**Stripe is the payment provider; the BruLite database is the membership
authority.** Client access is decided solely by the `entitlements` table,
checked by the desktop client via `/api/client/entitlement` with a key-bound
token. The Discord `Customer` role is a perk that mirrors entitlement state.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in values (see docs/)
npm run db:generate          # create SQL migrations from schema
npm run db:migrate           # apply them to Neon
npm run db:seed              # seed membership product + sample plugins
npm run dev
```

## Setup docs

- `docs/discord-setup.md` — Discord app, bot, roles, webhook, IDs
- `docs/stripe-setup.md` — keys, products/prices (USD), webhook events,
  test-mode checklist

## Architecture

```
Browser ──► Next.js ──► Neon Postgres (Drizzle)
              ├─► Discord OAuth (identify email guilds guilds.join) + guild auto-join
              ├─► Stripe Checkout / Billing Portal
              ├─► /api/stripe/webhook ──► entitlements ──► Discord role sync
              ├─► /api/client/* (Bearer token) ◄── BruLite desktop client
              ├─► /api/download/client (members only) ──► private Blob stream
              └─► Tickets ──► DB + Discord webhook post
```

### Client pairing flow (desktop app)

The hardened protocol uses browser-approved, key-bound pairing, five-minute access
credentials, rotating refresh credentials and server-managed running-client leases.
Registered devices and concurrent clients have independent plan limits with admin
overrides. Legacy copy/paste keys are retired. See [the complete protocol and rollout
checklist](docs/client-authentication.md) before deployment; existing clients require
an update and the database migration is intentionally not run by the build.


## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js lifecycle |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run db:generate` | Generate migrations from `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (Neon) |
| `npm run db:seed` | Seed products/prices + sample plugins |

## Notes before launch

- `TERMS_VERSION` bump re-prompts ToS acceptance at checkout.
- Terms & Privacy pages are **placeholder text** — get legal review.
- Admin access = holding a role in `DISCORD_ADMIN_ROLE_IDS`.
- Vercel Blob free tier is ~1 GB; if builds exceed it, swap `src/lib/blob.ts` for S3.
- Confirm with Stripe that the business model is permitted before going live.
