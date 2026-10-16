import { validateStagingConfig } from "./staging-config";

const authKeys = [
  "BRULITE_ENV",
  "DATABASE_URL",
  "AUTH_SECRET",
  "CRON_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_BOT_TOKEN",
  "DISCORD_GUILD_ID",
  "DISCORD_CUSTOMER_ROLE_ID",
  "DISCORD_ADMIN_ROLE_IDS",
  "TERMS_VERSION",
  "MIN_CLIENT_VERSION",
];
const discordKeys = [
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_BOT_TOKEN",
  "DISCORD_GUILD_ID",
  "DISCORD_CUSTOMER_ROLE_ID",
  "DISCORD_ADMIN_ROLE_IDS",
];

/** Blank all other environment-file values before Next can load production defaults. */
export function stagingRuntimeEnv(
  staging: Record<string, string>,
  production: Record<string, string>,
  envFiles: Record<string, string>[],
  inherited: Record<string, string | undefined>,
): Record<string, string | undefined> & { NODE_ENV: "development" } {
  validateStagingConfig(staging, production);
  if (staging.NEXT_PUBLIC_APP_URL !== "http://localhost:3001")
    throw new Error("Local staging requires http://localhost:3001");
  for (const key of discordKeys) {
    if (!staging[key] || staging[key] === production[key])
      throw new Error(`Set a separate staging ${key}`);
  }
  const result: Record<string, string | undefined> & {
    NODE_ENV: "development";
  } = { ...inherited, NODE_ENV: "development" };
  const keys = new Set([
    ...authKeys,
    ...envFiles.flatMap((file) => Object.keys(file)),
    ...Object.keys(inherited).filter((key) =>
      /^(STRIPE_|DISCORD_|BLOB_|NEXT_PUBLIC_|VERCEL_)/.test(key),
    ),
  ]);
  for (const key of keys) result[key] = "";
  for (const key of authKeys) result[key] = staging[key] ?? "";
  result.NODE_ENV = "development";
  result.NEXT_TELEMETRY_DISABLED = "1";
  return result;
}
