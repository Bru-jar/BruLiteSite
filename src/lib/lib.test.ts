import { describe, it, expect } from "vitest";
import { generateToken, hashToken, generatePairCode } from "./tokens";

describe("tokens", () => {
  it("generates unique opaque tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it("hashes tokens deterministically (sha256)", () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(t)).not.toContain(t);
  });

  it("generates unique pair codes", () => {
    expect(generatePairCode()).not.toBe(generatePairCode());
  });
});
