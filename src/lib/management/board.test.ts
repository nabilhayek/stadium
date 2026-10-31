import { describe, expect, it } from "vitest";
import { DEFAULT_PREP_MINUTES, fromDbStatus, isBoardStatus, previewAccept, toDbStatus } from "./board";

describe("status mappings", () => {
  it("toDbStatus and fromDbStatus round-trip kitchen statuses", () => {
    expect(toDbStatus("accepted")).toBe("ACCEPTED");
    expect(fromDbStatus("READY")).toBe("ready");
    expect(fromDbStatus("unknown")).toBe("new");
  });

  it("isBoardStatus", () => {
    expect(isBoardStatus("new")).toBe(true);
    expect(isBoardStatus("done")).toBe(false);
  });
});

describe("previewAccept", () => {
  const now = 1_000_000;

  it("scheduled orders use scheduledAt", () => {
    expect(previewAccept({ readyAt: now + 999, scheduledAt: now + 5000 }, undefined, now)).toEqual({
      readyAt: now + 5000,
      acceptedAt: now,
    });
  });

  it("uses prepMinutes when provided", () => {
    expect(previewAccept({ readyAt: now + 999, scheduledAt: null }, 20, now)).toEqual({
      readyAt: now + 20 * 60_000,
      acceptedAt: now,
    });
  });

  it("rejects invalid prepMinutes", () => {
    expect(previewAccept({ readyAt: now + 999, scheduledAt: null }, 0, now)).toBeNull();
    expect(previewAccept({ readyAt: now + 999, scheduledAt: null }, 200, now)).toBeNull();
  });

  it("extends past-due ETA with default prep", () => {
    expect(previewAccept({ readyAt: now - 1, scheduledAt: null }, undefined, now)).toEqual({
      readyAt: now + DEFAULT_PREP_MINUTES * 60_000,
      acceptedAt: now,
    });
  });

  it("keeps future readyAt when no prep override", () => {
    const readyAt = now + 30 * 60_000;
    expect(previewAccept({ readyAt, scheduledAt: null }, undefined, now)).toEqual({ readyAt, acceptedAt: now });
  });
});
