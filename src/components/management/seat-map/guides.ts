import { boundsOf, boxCorners, snap, toDeg, toRad, type Bounds } from "@/lib/seatmap/geometry";
import { decorationWidth, type Scene } from "@/lib/seatmap/engine/scene";
import { splitSelection, type Selection } from "./ops";

/** A Photoshop-style alignment line, in world units. `lo`/`hi` run perpendicular to the line. */
export type Guide = {
  axis: "x" | "y";
  at: number;
  lo: number;
  hi: number;
  /** Midpoint of the clear gap between the two shapes, along the line. */
  mark?: number;
  /** That gap, in decimetres. Absent when the shapes overlap on this line. */
  gap?: number;
};

type Anchor = { at: number; lo: number; hi: number };
export type Anchors = { xs: Anchor[]; ys: Anchor[] };

const EMPTY: Anchors = { xs: [], ys: [] };

/**
 * Edges, corners and centres of everything that is not being dragged.
 * Rows (the seat objects) are included only while drawing seats. Anything
 * else would sprout a guide for every row in a full bowl.
 */
export function objectAnchors(scene: Scene, skip: Selection, includeRows: boolean): Anchors {
  const parts = splitSelection(skip);
  const xs: Anchor[] = [];
  const ys: Anchor[] = [];

  const add = (b: Bounds) => {
    if (!Number.isFinite(b.minX) || b.maxX - b.minX > 100_000) return;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    xs.push({ at: b.minX, lo: b.minY, hi: b.maxY }, { at: cx, lo: b.minY, hi: b.maxY }, { at: b.maxX, lo: b.minY, hi: b.maxY });
    ys.push({ at: b.minY, lo: b.minX, hi: b.maxX }, { at: cy, lo: b.minX, hi: b.maxX }, { at: b.maxY, lo: b.minX, hi: b.maxX });
  };

  for (const s of scene.sections) {
    if (parts.sections.has(s.id) || s.loose) continue;
    add(s.bounds);
  }
  if (includeRows) {
    for (const row of scene.rows) {
      const section = scene.sections[row.section];
      if (parts.sections.has(section.id) || parts.rows.has(row.id)) continue;
      add(row.bounds);
    }
  }
  for (const d of scene.decorations) {
    if (parts.decorations.has(d.id)) continue;
    add(boundsOf(boxCorners(d.x, d.y, decorationWidth(d), d.h, d.rotation)));
  }
  for (const p of scene.pois) {
    if (parts.pois.has(p.id)) continue;
    add(p.w > 0 && p.h > 0 ? boundsOf(boxCorners(p.x, p.y, p.w, p.h, p.rotation)) : { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y });
  }
  return xs.length || ys.length ? { xs, ys } : EMPTY;
}

function closest(proposed: number, anchors: Anchor[], threshold: number): { anchor: Anchor; value: number } | null {
  let best: { anchor: Anchor; value: number; dist: number } | null = null;
  for (const anchor of anchors) {
    const dist = Math.abs(anchor.at - proposed);
    if (dist <= threshold && (!best || dist < best.dist)) best = { anchor, value: anchor.at, dist };
  }
  return best;
}

/** Close enough to count as the same line after the position has already snapped. */
const COINCIDENT = 0.05;

/**
 * Every edge, corner or centre that lands on the snapped shape. Two identical
 * shapes side by side therefore get a top line, a centre line and a bottom line,
 * not only the single closest one. The gap is labelled once, on the line nearest
 * the middle, so the three rulers don't each repeat the measurement.
 */
function aligned(axis: "x" | "y", moveLo: number, moveHi: number, probes: number[], anchors: Anchor[]): Guide[] {
  const guides: Guide[] = [];
  for (const anchor of anchors) {
    if (!probes.some((probe) => Math.abs(probe - anchor.at) <= COINCIDENT)) continue;
    guides.push(guide(axis, anchor.at, anchor, moveLo, moveHi));
  }
  const axisCenter = probes.length > 1 ? probes[1] : probes[0];
  let labeled: Guide | undefined;
  for (const item of guides) {
    if (item.gap == null) continue;
    if (!labeled || Math.abs(item.at - axisCenter) < Math.abs(labeled.at - axisCenter)) labeled = item;
  }
  for (const item of guides) {
    if (item !== labeled) {
      delete item.gap;
      delete item.mark;
    }
  }
  return guides;
}

/** World length as a short label: centimetres under a metre, metres from there up. */
export function formatLength(dm: number): string {
  const cm = Math.abs(dm) * 10;
  if (cm < 100) return `${Math.round(cm).toLocaleString("en")} cm`;
  const metres = cm / 100;
  const digits = metres >= 10 ? 0 : 1;
  return `${metres.toLocaleString("en", { maximumFractionDigits: digits, minimumFractionDigits: digits })} m`;
}

/** Alignment line through both shapes, plus the clear gap between them when they don't overlap. */
function guide(axis: "x" | "y", at: number, anchor: Anchor, moveLo: number, moveHi: number): Guide {
  const a0 = Math.min(anchor.lo, anchor.hi);
  const a1 = Math.max(anchor.lo, anchor.hi);
  const m0 = Math.min(moveLo, moveHi);
  const m1 = Math.max(moveLo, moveHi);
  const out: Guide = { axis, at, lo: Math.min(a0, m0), hi: Math.max(a1, m1) };
  let from = 0;
  let to = 0;
  if (m1 <= a0) {
    from = m1;
    to = a0;
  } else if (a1 <= m0) {
    from = a1;
    to = m0;
  } else return out;
  const dist = to - from;
  if (dist < 0.4) return out;
  out.mark = (from + to) / 2;
  out.gap = dist;
  return out;
}

/** Snap one corner. An object edge or centre within the threshold wins over the grid. */
export function snapPoint(x: number, y: number, anchors: Anchors, threshold: number, grid: number): { x: number; y: number; guides: Guide[] } {
  const guides: Guide[] = [];
  const hitX = closest(x, anchors.xs, threshold);
  const hitY = closest(y, anchors.ys, threshold);
  const sx = hitX ? hitX.value : snap(x, grid);
  const sy = hitY ? hitY.value : snap(y, grid);
  if (hitX) guides.push(...aligned("x", sy, sy, [sx], anchors.xs));
  if (hitY) guides.push(...aligned("y", sx, sx, [sy], anchors.ys));
  return { x: sx, y: sy, guides };
}

/**
 * Snap the moving corner of a box dragged from (x0, y0). The corner and the
 * box centre can each catch an edge or a centre of something else.
 */
export function snapBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  anchors: Anchors,
  threshold: number,
  grid: number,
): { x: number; y: number; guides: Guide[] } {
  const x = snapMoving(x0, x1, anchors.xs, threshold, grid);
  const y = snapMoving(y0, y1, anchors.ys, threshold, grid);
  const xLo = Math.min(x0, x.value);
  const xHi = Math.max(x0, x.value);
  const yLo = Math.min(y0, y.value);
  const yHi = Math.max(y0, y.value);
  return {
    x: x.value,
    y: y.value,
    guides: [
      ...aligned("x", yLo, yHi, [xLo, (xLo + xHi) / 2, xHi], anchors.xs),
      ...aligned("y", xLo, xHi, [yLo, (yLo + yHi) / 2, yHi], anchors.ys),
    ],
  };
}

function snapMoving(origin: number, moving: number, anchors: Anchor[], threshold: number, grid: number): { value: number; hit: Anchor | null } {
  let best: { anchor: Anchor; value: number; dist: number } | null = null;
  for (const anchor of anchors) {
    const edge = Math.abs(anchor.at - moving);
    const center = Math.abs(2 * anchor.at - origin - moving);
    const dist = Math.min(edge, center);
    const value = edge <= center ? anchor.at : 2 * anchor.at - origin;
    if (dist <= threshold && (!best || dist < best.dist)) best = { anchor, value, dist };
  }
  return best ? { value: best.value, hit: best.anchor } : { value: snap(moving, grid), hit: null };
}

/** Snap a dragged selection by its left, centre or right, and the same on the vertical. */
export function snapMove(bounds: Bounds, dx: number, dy: number, anchors: Anchors, threshold: number, grid: number): { dx: number; dy: number; guides: Guide[] } {
  const x = snapShift(bounds.minX, bounds.maxX, dx, anchors.xs, threshold, grid);
  const y = snapShift(bounds.minY, bounds.maxY, dy, anchors.ys, threshold, grid);
  const minX = bounds.minX + x.delta;
  const maxX = bounds.maxX + x.delta;
  const minY = bounds.minY + y.delta;
  const maxY = bounds.maxY + y.delta;
  return {
    dx: x.delta,
    dy: y.delta,
    guides: [
      ...aligned("x", minY, maxY, [minX, (minX + maxX) / 2, maxX], anchors.xs),
      ...aligned("y", minX, maxX, [minY, (minY + maxY) / 2, maxY], anchors.ys),
    ],
  };
}

function snapShift(min: number, max: number, delta: number, anchors: Anchor[], threshold: number, grid: number): { delta: number; hit: Anchor | null } {
  const probes = [min, (min + max) / 2, max];
  let best: { anchor: Anchor; delta: number; dist: number } | null = null;
  for (const anchor of anchors) {
    for (const probe of probes) {
      const dist = Math.abs(probe + delta - anchor.at);
      if (dist <= threshold && (!best || dist < best.dist)) best = { anchor, delta: anchor.at - probe, dist };
    }
  }
  return best ? { delta: best.delta, hit: best.anchor } : { delta: snap(delta, grid), hit: null };
}

/** Aim a segment at the nearest multiple of `angleStep` degrees, keeping a grid-snapped length. */
export function snapSegmentEnd(x0: number, y0: number, x1: number, y1: number, angleStep: number, grid: number): [number, number] {
  if (angleStep <= 0) return [x1, y1];
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1) return [x1, y1];
  const snapped = Math.round(toDeg(Math.atan2(y1 - y0, x1 - x0)) / angleStep) * angleStep;
  const distance = grid > 0 ? Math.max(grid, Math.round(len / grid) * grid) : len;
  const rad = toRad(snapped);
  return [x0 + Math.cos(rad) * distance, y0 + Math.sin(rad) * distance];
}
