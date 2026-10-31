import { describe, expect, it, beforeAll } from "vitest";
import { makeRow, makeSection } from "../geometry";
import { buildScene } from "./scene";
import { cardHit, hitTest, poiAt, seatAt, seatLabelsVisible, sectionAt } from "./hit";
import { emptySeatMap } from "../schema";

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

function sceneWithSeats() {
  const doc = emptySeatMap();
  const section = makeSection(
    doc,
    [
      [-30, -20],
      [30, -20],
      [30, 20],
      [-30, 20],
    ],
    "lower",
  );
  section.rows = [makeRow({ x: 0, y: 0, seats: 5, rotation: 0, label: "1" })];
  return buildScene({ ...doc, sections: [section] });
}

describe("seatLabelsVisible", () => {
  it("turns on when seat radius on screen is large enough", () => {
    expect(seatLabelsVisible(1)).toBe(false);
    expect(seatLabelsVisible(10)).toBe(true);
  });
});

describe("cardHit", () => {
  it("maps seat hits to section when labels are not visible", () => {
    const hit = { kind: "seat" as const, seat: 0, row: 0, section: 0 };
    expect(cardHit(hit, 1)).toEqual({ kind: "section", section: 0 });
    expect(cardHit(hit, 10)).toEqual(hit);
  });
});

describe("hitTest and helpers", () => {
  it("finds a seat at its world position when zoomed in", () => {
    const scene = sceneWithSeats();
    const x = scene.seatX[0];
    const y = scene.seatY[0];
    expect(seatAt(scene, x, y)).toBe(0);
    const hit = hitTest(scene, x, y, 10, true);
    expect(hit?.kind).toBe("seat");
  });

  it("finds section when zoomed out", () => {
    const scene = sceneWithSeats();
    const hit = hitTest(scene, 0, 0, 0.5, false);
    expect(hit?.kind).toBe("section");
  });

  it("sectionAt returns index inside polygon", () => {
    const scene = sceneWithSeats();
    expect(sectionAt(scene, 0, 0)).toBe(0);
    expect(sectionAt(scene, 500, 500)).toBe(-1);
  });

  it("poiAt finds gate-sized pois", () => {
    const doc = emptySeatMap();
    doc.pois.push({ id: "p1", kind: "entrance", x: 50, y: 50, label: "A", w: 36, h: 42, rotation: 0 });
    const scene = buildScene(doc);
    expect(poiAt(scene, 50, 50, 1)).toBe("p1");
  });
});
