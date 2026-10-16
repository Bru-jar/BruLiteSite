import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    discordId: text("discord_id").notNull(),
    username: text("username").notNull(),
    avatar: text("avatar"),
    email: text("email"),
    /** Max simultaneously bound client devices (admin-adjustable seat limit). */
    deviceLimit: integer("device_limit").notNull().default(2), // legacy display/migration only
    deviceLimitOverride: integer("device_limit_override"),
    concurrentLimitOverride: integer("concurrent_limit_override"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("users_discord_id_idx").on(t.discordId)],
);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  // membership now; qol_bundle / automation_bundle / etc. later
  category: text("category").notNull().default("membership"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const prices = pgTable("prices", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  stripePriceId: text("stripe_price_id").notNull().unique(),
  interval: text("interval").notNull(), // "month" | "year" | "one_time"
  amountUsdCents: integer("amount_usd_cents").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    // mirrors Stripe: active | trialing | past_due | canceled | incomplete | unpaid
    status: text("status").notNull(),
    planInterval: text("plan_interval"), // month | year — denormalized from Stripe price
    currentPeriodEnd: timestamp("current_period_end", {
      withTimezone: true,
    }).notNull(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("subscriptions_stripe_sub_idx").on(t.stripeSubscriptionId),
    index("subscriptions_user_idx").on(t.userId),
    index("subscriptions_customer_idx").on(t.stripeCustomerId),
  ],
);

/**
 * Entitlements are the single source of truth for client access.
 * The client API reads this table — never Stripe directly.
 */
export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("stripe"), // stripe | manual
    status: text("status").notNull(), // active | expired | revoked
    planInterval: text("plan_interval"), // month | year | null (manual)
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    reason: text("reason"),
  },
  (t) => [index("entitlements_user_idx").on(t.userId)],
);

export const termsAcceptances = pgTable(
  "terms_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    termsVersion: text("terms_version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ip: text("ip"),
  },
  (t) => [index("terms_user_idx").on(t.userId)],
);

/** Opaque API tokens issued to the desktop client (stored sha256-hashed). */
export const licenseTokens = pgTable(
  "license_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    deviceId: uuid("device_id").references(() => clientDevices.id),
    familyId: uuid("family_id"),
    label: text("label").notNull().default("client"),
    /**
     * Device seat binding — a sha256 fingerprint of the machine's hardware ID,
     * claimed on the first client API call that carries X-Device-Id.
     * Seat-management identifier, not a cryptographic credential.
     */
    deviceFingerprint: text("device_fingerprint"),
    deviceName: text("device_name"),
    boundAt: timestamp("bound_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("license_tokens_hash_idx").on(t.tokenHash),
    index("license_tokens_user_idx").on(t.userId),
  ],
);

/** Short-lived codes linking a desktop client to a browser auth session. */
export const clientPairings = pgTable(
  "client_pairings",
  {
    code: text("code").primaryKey(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    status: text("status").notNull().default("pending"), // pending | complete | expired
    licenseTokenId: uuid("license_token_id"),
    /** Raw client token, delivered once to the poller then cleared. */
    pendingToken: text("pending_token"), // legacy: scrubbed by migration, never written by v2
    secretHash: text("secret_hash"),
    publicKey: jsonb("public_key").$type<Record<string, string>>(),
    deviceName: text("device_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("client_pairings_status_idx").on(t.status)],
);

export const plugins = pgTable("plugins", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull(),
  category: text("category").notNull().default("general"),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  published: boolean("published").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // bug | feature
    title: text("title").notNull(),
    body: text("body").notNull(),
    steps: text("steps"), // steps to reproduce (bugs)
    extra: text("extra"), // other info / evidence notes
    imageUrl: text("image_url"), // uploaded screenshot
    status: text("status").notNull().default("open"), // open | in_progress | resolved | closed
    discordMessageId: text("discord_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("tickets_user_idx").on(t.userId)],
);

/** Downloadable client builds uploaded by admins to Vercel Blob. */
export const releases = pgTable("releases", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: text("version").notNull(),
  /** windows-x64 | macos-arm64 | universal — which OS build this artifact is. */
  platform: text("platform").notNull().default("universal"),
  /** bundle (installer zip) | jar (bare jar for in-app auto-update). */
  artifactType: text("artifact_type").notNull().default("bundle"),
  blobUrl: text("blob_url").notNull(),
  blobPathname: text("blob_pathname").notNull(),
  fileName: text("file_name").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id"),
    action: text("action").notNull(),
    target: text("target"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt)],
);

/** Registered installations are distinct from access tokens and running game sessions. */
export const clientDevices = pgTable(
  "client_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    keyThumbprint: text("key_thumbprint").notNull(),
    publicKey: jsonb("public_key").$type<Record<string, string>>().notNull(),
    name: text("name").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("client_device_user_key_idx").on(t.userId, t.keyThumbprint),
  ],
);
export const licensePolicies = pgTable("license_policies", {
  plan: text("plan").primaryKey(),
  deviceLimit: integer("device_limit").notNull(),
  concurrentLimit: integer("concurrent_limit").notNull(),
});
export const clientRefreshTokens = pgTable(
  "client_refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => clientDevices.id),
    familyId: uuid("family_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("refresh_hash_idx").on(t.tokenHash),
    index("refresh_family_idx").on(t.familyId),
  ],
);
export const clientSessions = pgTable(
  "client_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => clientDevices.id),
    familyId: uuid("family_id").notNull(),
    instanceId: uuid("instance_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("client_session_user_idx").on(t.userId)],
);
export const clientProofs = pgTable(
  "client_proofs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => clientDevices.id),
    proofId: text("proof_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("client_proof_replay_idx").on(t.deviceId, t.proofId)],
);
export const webSessions = pgTable("web_sessions", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const oauthAttempts = pgTable("oauth_attempts", {
  id: uuid("id").primaryKey(),
  nonceHash: text("nonce_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const authRateLimits = pgTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetsAt: timestamp("resets_at", { withTimezone: true }).notNull(),
});
