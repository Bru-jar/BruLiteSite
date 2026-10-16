import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
describe("security migration", () => {
  it("scrubs raw pairing credentials and retires legacy tokens without losing custom seat limits", async () => {
    const pg = new PGlite();
    try {
      const migrations = readdirSync("drizzle")
        .filter((x) => /^\d+.*\.sql$/.test(x))
        .sort();
      for (const migration of migrations.filter((x) => !x.startsWith("0004")))
        await pg.exec(readFileSync("drizzle/" + migration, "utf8"));
      const id = randomUUID();
      await pg.query(
        "INSERT INTO users (id,discord_id,username,device_limit) VALUES ($1,'legacy','Old member',7)",
        [id],
      );
      await pg.query(
        "INSERT INTO license_tokens (user_id,token_hash,expires_at) VALUES ($1,'old-hash',now()+interval '90 days')",
        [id],
      );
      await pg.query(
        "INSERT INTO client_pairings (code,status,pending_token,expires_at) VALUES ('ABCDEFGH','complete','raw-old-secret',now()+interval '1 hour')",
      );
      await pg.exec(readFileSync("drizzle/0004_auth_hardening.sql", "utf8"));
      expect(
        (
          await pg.query<{ device_limit_override: number }>(
            "SELECT device_limit_override FROM users",
          )
        ).rows[0].device_limit_override,
      ).toBe(7);
      expect(
        (
          await pg.query<{ revoked_at: Date }>(
            "SELECT revoked_at FROM license_tokens",
          )
        ).rows[0].revoked_at,
      ).not.toBeNull();
      expect(
        (
          await pg.query<{ pending_token: string | null; status: string }>(
            "SELECT pending_token,status FROM client_pairings",
          )
        ).rows[0],
      ).toEqual({ pending_token: null, status: "expired" });
      expect(
        (await pg.query("SELECT * FROM license_policies")).rows,
      ).toHaveLength(3);
      await expect(
        pg.exec("UPDATE license_policies SET concurrent_limit=0"),
      ).rejects.toThrow();
    } finally {
      await pg.close();
    }
  });
});
