import { describe, expect, it } from "vitest";
import { makeRow, makeSection } from "../geometry";
import { emptySeatMap } from "../schema";
import { applyPatch, diffDoc } from "./patch";

describe("diffDoc and applyPatch", () => {
  it("round-trips section order and partial puts", () => {
    const base = emptySeatMap();
    const s1 = makeSection(base, [
      [0, 0],
      [10, 0],
      [10, 10],
    ], "lower");
    s1.rows = [makeRow({ x: 5, y: 5, seats: 3 })];
    const next = { ...base, sections: [s1], pois: [{ id: "p1", kind: "kitchen" as const, x: 0, y: 0, label: "K", w: 0, h: 0, rotation: 0 }] };
    const patch = diffDoc(base, next);
    expect(patch.order).toEqual([s1.id]);
    expect(patch.put).toHaveLength(1);
    expect(patch.pois).toHaveLength(1);
    const restored = applyPatch(base, patch);
    expect(restored?.sections[0].id).toBe(s1.id);
    expect(restored?.pois).toEqual(next.pois);
  });

  it("returns null when order references unknown section", () => {
    const base = emptySeatMap();
    const patch = diffDoc(base, base);
    const broken = { ...patch, order: ["missing"] };
    expect(applyPatch(base, broken)).toBeNull();
  });
});
