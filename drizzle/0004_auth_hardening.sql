CREATE TABLE "auth_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"resets_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"key_thumbprint" text NOT NULL,
	"public_key" jsonb NOT NULL,
	"name" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"proof_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "client_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "license_policies" (
	"plan" text PRIMARY KEY NOT NULL,
	"device_limit" integer NOT NULL,
	"concurrent_limit" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nonce_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_pairings" ADD COLUMN "secret_hash" text;--> statement-breakpoint
ALTER TABLE "client_pairings" ADD COLUMN "public_key" jsonb;--> statement-breakpoint
ALTER TABLE "client_pairings" ADD COLUMN "device_name" text;--> statement-breakpoint
ALTER TABLE "license_tokens" ADD COLUMN "device_id" uuid;--> statement-breakpoint
ALTER TABLE "license_tokens" ADD COLUMN "family_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "device_limit_override" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "concurrent_limit_override" integer;--> statement-breakpoint
ALTER TABLE "client_devices" ADD CONSTRAINT "client_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_proofs" ADD CONSTRAINT "client_proofs_device_id_client_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."client_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_refresh_tokens" ADD CONSTRAINT "client_refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_refresh_tokens" ADD CONSTRAINT "client_refresh_tokens_device_id_client_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."client_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_sessions" ADD CONSTRAINT "client_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_sessions" ADD CONSTRAINT "client_sessions_device_id_client_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."client_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_sessions" ADD CONSTRAINT "web_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_device_user_key_idx" ON "client_devices" USING btree ("user_id","key_thumbprint");--> statement-breakpoint
CREATE UNIQUE INDEX "client_proof_replay_idx" ON "client_proofs" USING btree ("device_id","proof_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_hash_idx" ON "client_refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_family_idx" ON "client_refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "client_session_user_idx" ON "client_sessions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "license_tokens" ADD CONSTRAINT "license_tokens_device_id_client_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."client_devices"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO license_policies (plan,device_limit,concurrent_limit) VALUES ('monthly',2,2),('yearly',2,2),('manual',2,2);
--> statement-breakpoint
UPDATE users SET device_limit_override=device_limit WHERE device_limit<>2;
--> statement-breakpoint
UPDATE client_pairings SET pending_token=NULL,status='expired';
--> statement-breakpoint
UPDATE license_tokens SET revoked_at=now() WHERE device_id IS NULL AND revoked_at IS NULL;
--> statement-breakpoint
ALTER TABLE license_policies ADD CONSTRAINT license_policy_limits_check CHECK (device_limit BETWEEN 1 AND 100 AND concurrent_limit BETWEEN 1 AND 100);
--> statement-breakpoint
ALTER TABLE users ADD CONSTRAINT license_user_limits_check CHECK ((device_limit_override IS NULL OR device_limit_override BETWEEN 1 AND 100) AND (concurrent_limit_override IS NULL OR concurrent_limit_override BETWEEN 1 AND 100));
