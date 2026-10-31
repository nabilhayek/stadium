import { describe, expect, it } from "vitest";
import { makeRow, makeSection } from "./geometry";
import { emptySeatMap } from "./schema";
import { validateSeatMap } from "./validate";

function baseDoc() {
  return emptySeatMap();
}

function sectionWithRow(doc: ReturnType<typeof emptySeatMap>, opts?: { loose?: boolean; categoryId?: string | null; code?: string; rowLabel?: string; rowPos?: { x: number; y: number } }) {
  const points: [number, number][] = [
    [-40, -15],
    [40, -15],
    [40, 15],
    [-40, 15],
  ];
  const categoryId = opts && "categoryId" in opts ? opts.categoryId! : "lower";
  const section = makeSection(doc, points, categoryId);
  section.code = opts?.code ?? section.code;
  section.loose = opts?.loose ?? false;
  const row = makeRow({ x: opts?.rowPos?.x ?? 0, y: opts?.rowPos?.y ?? 0, label: opts?.rowLabel ?? "1", seats: 8 });
  return { ...doc, sections: [...doc.sections, { ...section, rows: [row] }] };
}

describe("validateSeatMap", () => {
  it("returns no issues for a minimal valid section", () => {
    const doc = sectionWithRow(baseDoc());
    expect(validateSeatMap(doc)).toEqual([]);
  });

  it("errors on duplicate section codes", () => {
    let doc = baseDoc();
    doc = sectionWithRow(doc, { code: "101" });
    doc = sectionWithRow(doc, { code: "101" });
    const issues = validateSeatMap(doc);
    expect(issues.some((i) => i.level === "error" && i.message.includes("101") && i.message.includes("more than once"))).toBe(true);
  });

  it("errors when section uses a deleted category", () => {
    const doc = sectionWithRow(baseDoc(), { categoryId: "gone" });
    const issues = validateSeatMap(doc);
    expect(issues.some((i) => i.level === "error" && i.message.includes("deleted category"))).toBe(true);
  });

  it("errors on duplicate row labels within a section", () => {
    let doc = baseDoc();
    const points: [number, number][] = [
      [-40, -15],
      [40, -15],
      [40, 15],
      [-40, 15],
    ];
    const section = makeSection(doc, points, "lower");
    const r1 = makeRow({ x: 0, y: -5, label: "A", seats: 4 });
    const r2 = makeRow({ x: 0, y: 5, label: "A", seats: 4 });
    doc = { ...doc, sections: [{ ...section, rows: [r1, r2] }] };
    const issues = validateSeatMap(doc);
    expect(issues.some((i) => i.level === "error" && i.message.includes("two rows labelled A"))).toBe(true);
  });

  it("warns when a section has no category", () => {
    const doc = sectionWithRow(baseDoc(), { categoryId: null });
    expect(validateSeatMap(doc).some((i) => i.level === "warning" && i.message.includes("no category"))).toBe(true);
  });

  it("warns when a non-block section has no rows", () => {
    let doc = baseDoc();
    const section = makeSection(doc, [
      [0, 0],
      [10, 0],
      [10, 10],
    ], "lower");
    doc = { ...doc, sections: [section] };
    expect(validateSeatMap(doc).some((i) => i.level === "warning" && i.message.includes("no seats"))).toBe(true);
  });

  it("warns for loose unassigned seats", () => {
    const doc = sectionWithRow(baseDoc(), { loose: true });
    expect(validateSeatMap(doc).some((i) => i.level === "warning" && i.message.includes("not in a section yet"))).toBe(true);
  });

  it("warns when a row runs outside the section polygon", () => {
    const doc = sectionWithRow(baseDoc(), { rowPos: { x: 200, y: 0 } });
    expect(validateSeatMap(doc).some((i) => i.level === "warning" && i.message.includes("runs outside"))).toBe(true);
  });
});
