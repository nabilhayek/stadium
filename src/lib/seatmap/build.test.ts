import { describe, expect, it } from "vitest";
import { emptySeatMap } from "./schema";
import { addBlock, addShape, checkMap, clearMap, describeMap, ringOf, ringSections, sectionTargets, selectSections, setField, shareOut } from "./build";

describe("shareOut", () => {
  it("splits integers summing exactly to total", () => {
    expect(shareOut(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(shareOut(7, [2, 1]).reduce((a, b) => a + b, 0)).toBe(7);
  });
});

describe("sectionTargets", () => {
  it("returns per-section counts or an error string", () => {
    expect(sectionTargets(3, 30)).toEqual([10, 10, 10]);
    const patterned = sectionTargets(4, 100, { every: 2, start: 2, delta: -10 });
    expect(Array.isArray(patterned)).toBe(true);
    if (Array.isArray(patterned)) expect(patterned.reduce((a, b) => a + b, 0)).toBe(100);
    expect(typeof sectionTargets(2, 1)).toBe("string");
  });
});

describe("ringOf and selectSections", () => {
  it("parses ring numbers from numeric codes", () => {
    expect(ringOf("101")).toBe(1);
    expect(ringOf("2204")).toBe(22);
    expect(ringOf("N1")).toBeNull();
  });

  it("selectSections requires a filter", () => {
    const doc = emptySeatMap();
    expect(selectSections(doc, {})).toMatchObject({ error: expect.stringContaining("Say which sections") });
  });
});

describe("clearMap and setField", () => {
  it("clearMap keeps categories and numbering", () => {
    const doc = emptySeatMap();
    const withField = setField(doc, { kind: "football" });
    expect(withField.ok).toBe(true);
    if (!withField.ok) return;
    const cleared = clearMap(withField.doc);
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.doc.sections).toEqual([]);
    expect(cleared.doc.decorations).toEqual([]);
    expect(cleared.doc.pois).toEqual([]);
    expect(cleared.doc.categories).toEqual(doc.categories);
    expect(cleared.doc.numbering).toEqual(doc.numbering);
  });

  it("setField rejects impossible dimensions", () => {
    const fail = setField(emptySeatMap(), { kind: "football", length: 10, width: 10 });
    expect(fail.ok).toBe(false);
  });
});

describe("addShape and addBlock", () => {
  it("addShape adds a decoration", () => {
    const doc = emptySeatMap();
    setField(doc, { kind: "football" });
    const res = addShape(doc, { kind: "stage", w: 200, h: 100, anchor: "north" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.doc.decorations.some((d) => d.kind === "stage")).toBe(true);
  });

  it("addBlock places a straight block", () => {
    const field = setField(emptySeatMap(), { kind: "football" });
    expect(field.ok).toBe(true);
    if (!field.ok) return;
    const res = addBlock(field.doc, { x: 0, y: 300, facing: 0, rows: 3, perRow: 10 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.doc.sections).toHaveLength(1);
    expect(res.doc.sections[0].rows).toHaveLength(3);
  });
});

describe("describeMap and checkMap", () => {
  it("describeMap mentions field and seat totals", () => {
    const built = setField(emptySeatMap(), { kind: "football" });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const text = describeMap(built.doc);
    expect(text).toMatch(/Field|Football/i);
    expect(text).toMatch(/0 seats/);
  });

  it("checkMap reports no issues on empty valid map", () => {
    expect(checkMap(emptySeatMap())).toBe("No issues.");
  });

  it("ringSections filters by ring", () => {
    const block = addBlock(emptySeatMap(), { x: 0, y: 0, facing: 0, rows: 1, perRow: 5, code: "101" });
    expect(block.ok).toBe(true);
    if (!block.ok) return;
    expect(ringSections(block.doc, 1).map((s) => s.code)).toContain("101");
  });
});
