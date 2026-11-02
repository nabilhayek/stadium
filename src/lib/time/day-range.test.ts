import { describe, expect, it } from "vitest";
import { dayRange } from "./day-range";

describe("dayRange", () => {
  it("uses the venue timezone, not UTC", () => {
    const { start, end } = dayRange("2026-11-01", "Europe/Stockholm");
    expect(start.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-01T23:00:00.000Z");
  });
});
