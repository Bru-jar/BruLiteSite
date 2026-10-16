/** Refuse accidental staging migrations against the configured production endpoint. */
export function validateStagingConfig(
  staging: Record<string, string>,
  production: Record<string, string>,
) {
  if (staging.BRULITE_ENV !== "staging")
    throw new Error("Set BRULITE_ENV=staging in .env.staging.local");
  if (!staging.DATABASE_URL)
    throw new Error("Add the staging connection string to .env.staging.local");
  let target: URL;
  let source: URL | undefined;
  try {
    target = new URL(staging.DATABASE_URL);
    source = production.DATABASE_URL
      ? new URL(production.DATABASE_URL)
      : undefined;
  } catch {
    throw new Error("Database connection string is invalid");
  }
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    target.pathname !== "/brulite_auth_staging"
  )
    throw new Error(
      "Choose the blank brulite_auth_staging database on the staging branch",
    );
  const endpoint = (value: URL) => value.hostname.replace(/-pooler(?=\.)/, "");
  if (source && endpoint(source) === endpoint(target))
    throw new Error(
      "Staging must use a different Neon endpoint from production",
    );
  if (
    !staging.AUTH_SECRET ||
    staging.AUTH_SECRET.length < 32 ||
    staging.AUTH_SECRET === production.AUTH_SECRET
  )
    throw new Error(
      "Staging requires its own random AUTH_SECRET of at least 32 characters",
    );
  if (
    !staging.NEXT_PUBLIC_APP_URL ||
    staging.NEXT_PUBLIC_APP_URL === production.NEXT_PUBLIC_APP_URL
  )
    throw new Error("Set a separate staging NEXT_PUBLIC_APP_URL");
  const app = new URL(staging.NEXT_PUBLIC_APP_URL);
  if (
    app.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(app.hostname)
  )
    throw new Error("Staging must use HTTPS or a local test address");
  return staging;
}
