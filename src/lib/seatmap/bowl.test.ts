import { describe, expect, it } from "vitest";
import { setField } from "./build";
import {
  EDGE,
  evenRows,
  frontAfter,
  frontageFor,
  inBearings,
  mainVenue,
  planTier,
  seatsInFrontage,
  venueAround,
} from "./bowl";
import { venuePath } from "./geometry";
import { emptySeatMap } from "./schema";

describe("evenRows and frontage helpers", () => {
  it("evenRows distributes extra seats toward the back", () => {
    expect(evenRows(10, 3)).toEqual([3, 3, 4]);
    expect(evenRows(11, 4).reduce((a, b) => a + b, 0)).toBe(11);
  });

  it("frontageFor and seatsInFrontage are inverse within rounding", () => {
    const perRow = 20;
    const frontage = frontageFor(perRow);
    expect(seatsInFrontage(frontage)).toBeGreaterThanOrEqual(perRow - 1);
    expect(seatsInFrontage(frontage)).toBeLessThanOrEqual(perRow);
  });

  it("frontAfter adds gap and edge padding", () => {
    expect(frontAfter(100, 5)).toBe(100 + 5 + EDGE);
  });
});

describe("inBearings", () => {
  it("checks clockwise span including wrap", () => {
    expect(inBearings(10, 0, 90)).toBe(true);
    expect(inBearings(200, 0, 90)).toBe(false);
    expect(inBearings(350, 300, 30)).toBe(true);
  });
});

describe("planTier", () => {
  it("plans mids and per-row seat counts", () => {
    const layout = planTier({ start: 0, length: 400, front: 80, targets: [100, 100], count: 2, rows: 5, aisle: 14 });
    expect(typeof layout).not.toBe("string");
    if (typeof layout === "string") return;
    expect(layout.mids).toHaveLength(2);
    expect(layout.perRow[0].reduce((a, b) => a + b, 0)).toBe(100);
    expect(layout.rows).toBe(5);
  });

  it("returns a readable error when sections are too narrow", () => {
    const err = planTier({ start: 0, length: 10, front: 50, targets: [50], count: 2, rows: 3, aisle: 14 });
    expect(typeof err).toBe("string");
  });
});

describe("venueAround and mainVenue", () => {
  it("creates a venue decoration around the default field", () => {
    const doc = emptySeatMap();
    const venue = venueAround(doc, "rounded", 70, undefined, true);
    expect(venue.kind).toBe("venue");
    expect(venue.field).toBe("football");
    expect(venue.w).toBeGreaterThan(1050);
  });

  it("mainVenue prefers pitched venue after setField", () => {
    const res = setField(emptySeatMap(), { kind: "football" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const venue = mainVenue(res.doc);
    expect(venue?.kind).toBe("venue");
    expect(venuePath(venue!).length(venuePath(venue!).rim)).toBeGreaterThan(0);
  });
});
