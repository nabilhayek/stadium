import { describe, expect, it } from "vitest";
import { makeRow, makeSection, translation } from "@/lib/seatmap/geometry";
import { emptySeatMap } from "@/lib/seatmap/schema";
import { deleteSelection, duplicateSelection, keyOf, seatKey, seatPick, splitSelection, transformSelection } from "./ops";

function docWithSection() {
  const doc = emptySeatMap();
  const section = makeSection(
    doc,
    [
      [-20, -10],
      [20, -10],
      [20, 10],
      [-20, 10],
    ],
    "lower",
  );
  const row = makeRow({ x: 0, y: 0, label: "1", seats: 4 });
  return { doc: { ...doc, sections: [{ ...section, rows: [row] }] }, section, row };
}

describe("selection keys", () => {
  it("parses seat picks and splits selection kinds", () => {
    const { row } = docWithSection();
    const key = seatKey(row.id, 2);
    expect(seatPick(key)).toEqual({ rowId: row.id, index: 2 });
    const sel = new Set([keyOf("s", "s1"), keyOf("r", row.id), key]);
    const parts = splitSelection(sel);
    expect(parts.sections.has("s1")).toBe(true);
    expect(parts.rows.has(row.id)).toBe(true);
    expect(parts.seats).toHaveLength(1);
  });
});

describe("transformSelection", () => {
  it("translates a selected row", () => {
    const { doc, row } = docWithSection();
    const next = transformSelection(doc, new Set([keyOf("r", row.id)]), translation(5, 0));
    const moved = next.sections[0].rows[0];
    expect(moved.x).toBeCloseTo(row.x + 5, 2);
  });
});

describe("deleteSelection", () => {
  it("removes a section and decorations", () => {
    const { doc, section } = docWithSection();
    const withDeco = {
      ...doc,
      decorations: [{ id: "d1", kind: "wall" as const, x: 0, y: 0, w: 10, h: 10, rotation: 0, label: "", color: "#ccc", radius: 0, field: "none" as const }],
    };
    const next = deleteSelection(withDeco, new Set([keyOf("s", section.id), keyOf("d", "d1")]));
    expect(next.sections).toHaveLength(0);
    expect(next.decorations).toHaveLength(0);
  });

  it("omits individual seats via removed slots", () => {
    const { doc, row } = docWithSection();
    const next = deleteSelection(doc, new Set([seatKey(row.id, 1)]));
    expect(next.sections[0].rows[0].removed).toContain(1);
  });
});

describe("duplicateSelection", () => {
  it("copies a section with a new code", () => {
    const { doc, section } = docWithSection();
    const { doc: next, selection } = duplicateSelection(doc, new Set([keyOf("s", section.id)]));
    expect(next.sections).toHaveLength(2);
    expect(next.sections[1].code).not.toBe(section.code);
    expect([...selection][0]).toMatch(/^s:/);
  });
});
