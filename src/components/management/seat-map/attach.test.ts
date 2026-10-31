import { describe, expect, it, beforeAll } from "vitest";
import { makeRow, makeSection } from "@/lib/seatmap/geometry";
import { buildScene } from "@/lib/seatmap/engine/scene";
import { emptySeatMap } from "@/lib/seatmap/schema";
import { attachSlots, hostContains, inAttachSlot, presentSlot, sameHost } from "./attach";

beforeAll(() => {
  if (typeof Path2D === "undefined") {
    class MockPath2D {
      moveTo() {}
      lineTo() {}
      closePath() {}
      addPath() {}
    }
    // @ts-expect-error test shim
    globalThis.Path2D = MockPath2D;
  }
});

describe("sameHost", () => {
  it("compares host identity", () => {
    const a = { kind: "section" as const, id: "s1", index: 0 };
    expect(sameHost(a, a)).toBe(true);
    expect(sameHost(a, { kind: "section", id: "s2", index: 1 })).toBe(false);
    expect(sameHost(null, a)).toBe(false);
  });
});

describe("attachSlots", () => {
  it("offers slots beside a rectangular section", () => {
    const doc = emptySeatMap();
    const section = makeSection(
      doc,
      [
        [0, 0],
        [80, 0],
        [80, 30],
        [0, 30],
      ],
      "lower",
    );
    section.rows = [makeRow({ x: 40, y: 15, seats: 10, rotation: 0 })];
    const scene = buildScene({ ...doc, sections: [section] });
    const slots = attachSlots(scene);
    expect(slots.length).toBeGreaterThan(0);
    const slot = presentSlot(slots[0], 1);
    expect(inAttachSlot(slot, slot.x, slot.y)).toBe(true);
    expect(hostContains(scene, slot.host, 40, 15)).toBe(true);
  });
});
