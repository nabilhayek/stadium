import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  auth: { $context: Promise.resolve({ secret: "test-secret" }) },
}));

const { kitchenStreamToken, verifyKitchenStreamToken } = await import("./token");

describe("kitchenStreamToken / verifyKitchenStreamToken", () => {
  const stadium = "arena";
  const userId = "user-42";
  const now = 12 * 60 * 60 * 1000 * 5 + 1234;

  it("mints a token that verifies for the same stadium", async () => {
    const token = await kitchenStreamToken(stadium, userId, now);
    expect(token.split(".")).toHaveLength(4);
    expect(await verifyKitchenStreamToken(token, stadium, now)).toBe(true);
  });

  it("rejects wrong stadium, tampered token, and expiry", async () => {
    const token = await kitchenStreamToken(stadium, userId, now);
    expect(await verifyKitchenStreamToken(token, "other", now)).toBe(false);
    expect(await verifyKitchenStreamToken(token.replace(/.$/, "x"), stadium, now)).toBe(false);
    expect(await verifyKitchenStreamToken(null, stadium, now)).toBe(false);
    const farFuture = now + 12 * 60 * 60 * 1000 * 10;
    expect(await verifyKitchenStreamToken(token, stadium, farFuture)).toBe(false);
  });

  it("stable within the same 12h window", async () => {
    const a = await kitchenStreamToken(stadium, userId, now);
    const b = await kitchenStreamToken(stadium, userId, now + 1000);
    expect(a).toBe(b);
  });
});
