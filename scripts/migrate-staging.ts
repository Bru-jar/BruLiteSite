import { readFileSync, existsSync } from "node:fs";
import { parse } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { validateStagingConfig } from "../src/lib/staging-config";
async function main() {
  if (!existsSync(".env.staging.local"))
    throw new Error(
      "Create .env.staging.local using docs/staging-setup.md. Nothing has been migrated.",
    );
  const config = validateStagingConfig(
    parse(readFileSync(".env.staging.local")),
    existsSync(".env.local") ? parse(readFileSync(".env.local")) : {},
  );
  console.log(
    "Isolated staging configuration verified. Secret values are not displayed.",
  );
  if (process.argv.includes("--check")) return;
  const db = drizzle(neon(config.DATABASE_URL));
  try {
    await migrate(db, { migrationsFolder: "drizzle" });
  } catch {
    throw new Error(
      "Staging migration failed. Check staging connectivity and the migration history; production was not selected.",
    );
  }
  console.log("Staging migrations applied.");
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Staging setup failed",
  );
  process.exitCode = 1;
});
