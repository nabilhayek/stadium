import { describe, expect, it, beforeAll } from "vitest";
import { makeRow, makeSection } from "@/lib/seatmap/geometry";
import { buildScene } from "@/lib/seatmap/engine/scene";
import { emptySeatMap } from "@/lib/seatmap/schema";
import { formatLength, objectAnchors, snapBox, snapMove, snapPoint, snapSegmentEnd } from "./guides";

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

function twoSectionScene() {
  const doc = emptySeatMap();
  const a = makeSection(
    doc,
    [
      [0, 0],
      [40, 0],
      [40, 20],
      [0, 20],
    ],
    "lower",
  );
  const b = makeSection(
    doc,
    [
      [60, 0],
      [100, 0],
      [100, 20],
      [60, 20],
    ],
    "lower",
  );
  a.rows = [makeRow({ x: 20, y: 10, seats: 4 })];
  b.rows = [makeRow({ x: 80, y: 10, seats: 4 })];
  return buildScene({ ...doc, sections: [a, b] });
}

describe("formatLength", () => {
  it("formats centimetres and metres", () => {
    expect(formatLength(5)).toMatch(/m/);
    expect(formatLength(0.5)).toMatch(/cm/);
  });
});

describe("objectAnchors", () => {
  it("collects anchors from static sections", () => {
    const scene = twoSectionScene();
    const anchors = objectAnchors(scene, new Set(), false);
    expect(anchors.xs.length).toBeGreaterThan(0);
    expect(anchors.ys.length).toBeGreaterThan(0);
  });
});

describe("snap helpers", () => {
  it("snapPoint prefers nearby anchors over grid", () => {
    const anchors = { xs: [{ at: 100, lo: 0, hi: 50 }], ys: [{ at: 200, lo: 0, hi: 50 }] };
    const { x, y, guides } = snapPoint(100.2, 200.1, anchors, 1, 5);
    expect(x).toBe(100);
    expect(y).toBe(200);
    expect(guides.length).toBeGreaterThan(0);
  });

  it("snapMove aligns selection bounds to anchors", () => {
    const bounds = { minX: 3, minY: 10, maxX: 23, maxY: 30 };
    const anchors = { xs: [{ at: 0, lo: 0, hi: 100 }], ys: [] };
    const { dx, guides } = snapMove(bounds, 0, 0, anchors, 5, 5);
    expect(dx).toBe(-3);
    expect(guides.some((g) => g.axis === "x")).toBe(true);
  });

  it("snapBox snaps a moving corner", () => {
    const anchors = { xs: [{ at: 50, lo: 0, hi: 100 }], ys: [] };
    const { x } = snapBox(0, 0, 48, 10, anchors, 3, 5);
    expect(x).toBe(50);
  });

  it("snapSegmentEnd quantizes angle and length", () => {
    const [x, y] = snapSegmentEnd(0, 0, 10, 1, 45, 5);
    expect(Math.hypot(x, y)).toBeGreaterThan(0);
  });
});
