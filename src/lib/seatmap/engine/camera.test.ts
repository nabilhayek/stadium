import { describe, expect, it } from "vitest";
import { Camera, DEFAULT_SCALE, zoomFloor } from "./camera";

describe("Camera", () => {
  it("converts between screen and world", () => {
    const cam = new Camera();
    cam.scale = 2;
    cam.tx = 10;
    cam.ty = 20;
    expect(cam.toWorld(30, 40)).toEqual([10, 10]);
    expect(cam.toScreen(10, 10)).toEqual([30, 40]);
  });

  it("zoomAt keeps the point under the cursor fixed", () => {
    const cam = new Camera();
    cam.scale = 1;
    cam.tx = 0;
    cam.ty = 0;
    const sx = 100;
    const sy = 50;
    const [wx, wy] = cam.toWorld(sx, sy);
    cam.zoomAt(sx, sy, 2);
    const [sx2, sy2] = cam.toScreen(wx, wy);
    expect(sx2).toBeCloseTo(sx, 5);
    expect(sy2).toBeCloseTo(sy, 5);
  });

  it("fit centres bounds in the viewport", () => {
    const cam = new Camera();
    cam.fit({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 200, 200, 0);
    const [cx, cy] = cam.toWorld(100, 100);
    expect(cx).toBeCloseTo(50, 1);
    expect(cy).toBeCloseTo(50, 1);
  });

  it("view returns world bounds for the viewport", () => {
    const cam = new Camera();
    cam.scale = DEFAULT_SCALE;
    cam.tx = 0;
    cam.ty = 0;
    const v = cam.view(100, 100);
    expect(v.maxX).toBeGreaterThan(v.minX);
    expect(v.maxY).toBeGreaterThan(v.minY);
  });
});

describe("zoomFloor", () => {
  it("never exceeds fitted scale and respects venue minimum", () => {
    expect(zoomFloor(0.2)).toBeLessThanOrEqual(0.2 * 0.85);
    expect(zoomFloor(0.001)).toBeLessThanOrEqual(0.08);
  });
});
