import { describe, expect, it } from "vitest";
import { stagingRuntimeEnv } from "./staging-runtime";
const production = {
  DATABASE_URL: "postgres://user:secret@ep-live.example/neondb",
  AUTH_SECRET: "production-secret-at-least-32-characters",
  NEXT_PUBLIC_APP_URL: "https://live.example",
  DISCORD_CLIENT_ID: "live-app",
  DISCORD_BOT_TOKEN: "live-token",
  DISCORD_GUILD_ID: "live-guild",
};
const staging = {
  BRULITE_ENV: "staging",
  DATABASE_URL: "postgres://user:secret@ep-stage.example/brulite_auth_staging",
  AUTH_SECRET: "independent-staging-secret-at-least-32-characters",
  NEXT_PUBLIC_APP_URL: "http://localhost:3001",
  DISCORD_CLIENT_ID: "stage-app",
  DISCORD_CLIENT_SECRET: "stage-secret",
  DISCORD_BOT_TOKEN: "stage-token",
  DISCORD_GUILD_ID: "stage-guild",
  DISCORD_CUSTOMER_ROLE_ID: "customer",
  DISCORD_ADMIN_ROLE_IDS: "admin",
};
describe("local staging runtime isolation", () => {
  it("blanks production defaults and inherited service credentials, only overlays auth settings", () => {
    const inherited = {
      PATH: "system-path",
      STRIPE_SECRET_KEY: "live-stripe",
      BLOB_READ_WRITE_TOKEN: "live-blob",
      DISCORD_TICKETS_WEBHOOK_URL: "live-webhook",
    };
    const files = [
      {
        ...production,
        UNLISTED_INTEGRATION_SECRET: "live-extra",
        NEXT_PUBLIC_OTHER: "live-public",
      },
    ];
    const result = stagingRuntimeEnv(
      { ...staging, STRIPE_SECRET_KEY: "accidentally-copied" },
      production,
      files,
      inherited,
    );
    expect(result.DATABASE_URL).toBe(staging.DATABASE_URL);
    expect(result.DISCORD_BOT_TOKEN).toBe(staging.DISCORD_BOT_TOKEN);
    for (const key of [
      "STRIPE_SECRET_KEY",
      "BLOB_READ_WRITE_TOKEN",
      "DISCORD_TICKETS_WEBHOOK_URL",
      "UNLISTED_INTEGRATION_SECRET",
      "NEXT_PUBLIC_OTHER",
    ])
      expect(result[key]).toBe("");
    expect(result.PATH).toBe("system-path");
    expect(inherited.STRIPE_SECRET_KEY).toBe("live-stripe");
  });
  it("rejects missing credentials or shared live Discord resources", () => {
    expect(() =>
      stagingRuntimeEnv(
        { ...staging, DISCORD_CLIENT_SECRET: "" },
        production,
        [],
        {},
      ),
    ).toThrow("DISCORD_CLIENT_SECRET");
    expect(() =>
      stagingRuntimeEnv(
        { ...staging, DISCORD_GUILD_ID: production.DISCORD_GUILD_ID },
        production,
        [],
        {},
      ),
    ).toThrow("DISCORD_GUILD_ID");
  });
  it("rejects a mismatched local OAuth origin", () => {
    expect(() =>
      stagingRuntimeEnv(
        { ...staging, NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
        production,
        [],
        {},
      ),
    ).toThrow("localhost:3001");
  });
});
