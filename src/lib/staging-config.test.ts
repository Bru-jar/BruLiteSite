import { describe, it, expect } from "vitest";
import { validateStagingConfig } from "./staging-config";
const production = {
  DATABASE_URL: "postgres://user:secret@ep-live-pooler.example/neondb",
  AUTH_SECRET: "production-secret-32-characters-long",
  NEXT_PUBLIC_APP_URL: "https://live.example",
};
const staging = {
  BRULITE_ENV: "staging",
  DATABASE_URL: "postgres://user:secret@ep-stage.example/brulite_auth_staging",
  AUTH_SECRET: "different-staging-secret-32-characters-long",
  NEXT_PUBLIC_APP_URL: "https://stage.example",
};
describe("staging migration guard", () => {
  it("accepts isolated staging without returning or printing production credentials", () => {
    expect(validateStagingConfig(staging, production)).toBe(staging);
  });
  it("rejects production endpoints, including pooler aliases", () => {
    expect(() =>
      validateStagingConfig(
        {
          ...staging,
          DATABASE_URL:
            "postgres://user:secret@ep-live.example/brulite_auth_staging",
        },
        production,
      ),
    ).toThrow("different Neon endpoint");
  });
  it("rejects reused secrets, the production origin and a non-staging database", () => {
    expect(() =>
      validateStagingConfig(
        { ...staging, AUTH_SECRET: production.AUTH_SECRET },
        production,
      ),
    ).toThrow("AUTH_SECRET");
    expect(() =>
      validateStagingConfig(
        { ...staging, NEXT_PUBLIC_APP_URL: production.NEXT_PUBLIC_APP_URL },
        production,
      ),
    ).toThrow("separate staging");
    expect(() =>
      validateStagingConfig(
        { ...staging, DATABASE_URL: production.DATABASE_URL },
        production,
      ),
    ).toThrow("blank brulite_auth_staging");
  });
});
