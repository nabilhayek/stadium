import { describe, expect, it } from "vitest";
import {
  applyRigid,
  makeRow,
  normalizeAngle,
  placeRow,
  pointInPolygon,
  rotation,
  seatNumber,
  seatsOfRow,
  snap,
  translation,
} from "./geometry";

describe("placeRow and seatNumber", () => {
  it("places seats along a straight row", () => {
    const row = makeRow({ x: 0, y: 0, seats: 5, pitch: 5.5, rotation: 0 });
    const { x, y } = seatsOfRow(row);
    expect(x).toHaveLength(5);
    expect(y.every((v) => Math.abs(v) < 1e-6)).toBe(true);
    expect(x[0]).toBeLessThan(x[4]);
  });

  it("keeps printed seat numbers unique along a row", () => {
    for (let trial = 0; trial < 20; trial++) {
      const seats = 3 + Math.floor(Math.random() * 40);
      const start = Math.floor(Math.random() * 50);
      const step = 1 + Math.floor(Math.random() * 3);
      const row = makeRow({ x: 10, y: 20, seats, start, step, reverse: Math.random() > 0.5 });
      const numbers = Array.from({ length: seats }, (_, i) => seatNumber(row, i));
      expect(new Set(numbers).size).toBe(seats);
    }
  });
});

describe("applyRigid", () => {
  it("rotation 90° then -90° about the same pivot is approximately identity", () => {
    const pivot = { px: 12, py: -8 };
    const t90 = rotation(90, pivot.px, pivot.py);
    const tBack = rotation(-90, pivot.px, pivot.py);
    for (let trial = 0; trial < 15; trial++) {
      const x0 = (Math.random() - 0.5) * 200;
      const y0 = (Math.random() - 0.5) * 200;
      const [x1, y1] = applyRigid(t90, x0, y0);
      const [x2, y2] = applyRigid(tBack, x1, y1);
      expect(x2).toBeCloseTo(x0, 5);
      expect(y2).toBeCloseTo(y0, 5);
    }
  });

  it("translation adds offset", () => {
    const [x, y] = applyRigid(translation(3, -4), 1, 2);
    expect(x).toBe(4);
    expect(y).toBe(-2);
  });
});

describe("polygon and utilities", () => {
  it("pointInPolygon detects inside a square", () => {
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    expect(pointInPolygon(5, 5, square)).toBe(true);
    expect(pointInPolygon(15, 5, square)).toBe(false);
  });

  it("normalizeAngle wraps to (-180, 180]", () => {
    expect(normalizeAngle(370)).toBe(10);
    expect(normalizeAngle(-190)).toBe(170);
  });

  it("snap rounds to grid", () => {
    expect(snap(10.4, 5)).toBe(10);
    expect(snap(12.6, 5)).toBe(15);
  });
});

describe("placeRow count", () => {
  it("writes one coordinate per seat slot", () => {
    const row = makeRow({ x: 0, y: 0, seats: 12 });
    const xs: number[] = [];
    const ys: number[] = [];
    expect(placeRow(row, xs, ys)).toBe(12);
    expect(xs).toHaveLength(12);
  });
});
