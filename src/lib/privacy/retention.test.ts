import { describe, expect, it } from "vitest";
import { retentionDays, stripFanDetails } from "./policy";

describe("retention", () => {
  it("defaults to a year and treats zero as off", () => {
    expect(retentionDays(undefined)).toBe(365);
    expect(retentionDays("")).toBe(365);
    expect(retentionDays("0")).toBe(0);
    expect(retentionDays("90")).toBe(90);
    expect(retentionDays("nope")).toBe(365);
  });

  it("removes seat, email and notes and keeps the money", () => {
    const stripped = stripFanDetails({
      orderNumber: "A-1",
      email: "fan@example.com",
      token: "secret",
      deviceId: "phone",
      seat: { sectionCode: "N", row: "1", number: "2" },
      runnerNote: "blue jacket",
      totalCents: 500,
      lines: [{ name: "Cola", note: "no ice", qty: 1 }],
    }) as { email?: string; seat: null; runnerNote: string; totalCents: number; lines: { note?: string }[] };

    expect(stripped.email).toBeUndefined();
    expect(stripped.seat).toBeNull();
    expect(stripped.runnerNote).toBe("");
    expect(stripped.totalCents).toBe(500);
    expect(stripped.lines[0].note).toBeUndefined();
  });
});
