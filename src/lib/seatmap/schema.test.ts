import { describe, expect, it, vi } from "vitest";
import { CATEGORY_PALETTE, DEFAULT_NUMBERING, SEATMAP_VERSION, emptySeatMap, newId, parseSeatMap, seatMapSchema } from "./schema";

describe("emptySeatMap", () => {
  it("returns version 1 with default categories and numbering", () => {
    const doc = emptySeatMap();
    expect(doc.version).toBe(SEATMAP_VERSION);
    expect(doc.categories).toHaveLength(3);
    expect(doc.categories.map((c) => c.id)).toEqual(["lower", "middle", "upper"]);
    expect(doc.categories[0].color).toBe(CATEGORY_PALETTE[3]);
    expect(doc.sections).toEqual([]);
    expect(doc.decorations).toEqual([]);
    expect(doc.pois).toEqual([]);
    expect(doc.numbering).toEqual(DEFAULT_NUMBERING);
  });
});

describe("parseSeatMap", () => {
  it("round-trips a valid document", () => {
    const doc = emptySeatMap();
    expect(parseSeatMap(doc)).toEqual(doc);
  });

  it("returns null for invalid input", () => {
    expect(parseSeatMap(null)).toBeNull();
    expect(parseSeatMap({})).toBeNull();
    expect(parseSeatMap({ version: 2, categories: [], sections: [], decorations: [], pois: [] })).toBeNull();
  });

  it("lifts legacy field decorations into venue football pitch", () => {
    const raw = {
      version: SEATMAP_VERSION,
      categories: emptySeatMap().categories,
      sections: [],
      pois: [],
      numbering: DEFAULT_NUMBERING,
      decorations: [
        {
          id: "d1",
          kind: "field",
          x: 0,
          y: 0,
          w: 1050,
          h: 680,
          rotation: 0,
          label: "",
          color: "#86efac",
          radius: 0,
          field: "none",
        },
      ],
    };
    const parsed = parseSeatMap(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.decorations.some((d) => d.kind === "field")).toBe(false);
    const venue = parsed!.decorations.find((d) => d.kind === "venue");
    expect(venue?.field).toBe("football");
    expect(venue!.w).toBeGreaterThan(1050);
  });

  it("matches seatMapSchema for empty map", () => {
    expect(seatMapSchema.safeParse(emptySeatMap()).success).toBe(true);
  });
});

describe("newId", () => {
  it("prefixes a short hex id", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "abcd1234-5678-90ab-cdef-111122223333" });
    expect(newId("r")).toBe("rabcd123456");
    expect(newId()).toMatch(/^[a-f0-9]{10}$/);
    vi.unstubAllGlobals();
  });
});
