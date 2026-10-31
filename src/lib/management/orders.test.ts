import { describe, expect, it } from "vitest";
import { RANGES, toRange } from "./orders";

describe("toRange", () => {
  it("defaults to 12h", () => {
    expect(toRange(undefined)).toBe("12h");
    expect(toRange(["24h"])).toBe("12h");
    expect(toRange("nope")).toBe("12h");
  });

  it("accepts known keys", () => {
    expect(toRange("7d")).toBe("7d");
    expect(toRange("24h")).toBe("24h");
  });
});

describe("RANGES", () => {
  it("has expected span metadata", () => {
    expect(RANGES["12h"].buckets).toBe(12);
    expect(RANGES["7d"].spanMs).toBe(7 * 86_400_000);
  });
});
