import { boundsOf, boxCorners, centroid, placeRow, seatId, seatNumber, unionBounds, venuesOf, warpSeats, type Bounds, type Point } from "../geometry";
import { SEAT_RADIUS, type SeatMapDecoration, type SeatMapDoc, type SeatMapPoi } from "../schema";

export type SceneSection = {
  id: string;
  index: number;
  code: string;
  name: string;
  categoryLabel: string;
  /** Index into `scene.colors`. */
  color: number;
  points: Point[];
  path: Path2D;
  stripes: Path2D;
  bounds: Bounds;
  label: { text: string; x: number; y: number; size: number; rotation: number; visible: boolean };
  display: "seats" | "block" | "round-table" | "rect-table";
  /** Seats drawn before they belong to a stand. The outline stays hidden. */
  loose: boolean;
  rowStart: number;
  rowEnd: number;
  seatStart: number;
  seatEnd: number;
};

export type SceneRow = {
  id: string;
  label: string;
  section: number;
  seatStart: number;
  seatEnd: number;
  stripe: Path2D;
  bounds: Bounds;
};

export type SceneColor = {
  base: string;
  fill: string;
  soft: string;
  stripe: string;
  stroke: string;
  label: string;
  /** Seat disc: the category colour pulled darker, so the number sits on it. */
  disc: string;
  /** Seat rim: the category colour itself, lighter than the disc. */
  rim: string;
};

export type Grid = { minX: number; minY: number; cell: number; cols: number; rows: number; start: Int32Array; items: Int32Array };

export type Scene = {
  doc: SeatMapDoc;
  sections: SceneSection[];
  rows: SceneRow[];
  seatCount: number;
  seatX: Float32Array;
  seatY: Float32Array;
  seatRow: Int32Array;
  seatNumber: Int32Array;
  /** 0 when that slot was removed and should not be drawn or hit. */
  seatLive: Uint8Array;
  /** 1 when that seat is marked wheelchair-accessible. */
  seatWheelchair: Uint8Array;
  grid: Grid;
  bounds: Bounds;
  colors: SceneColor[];
  decorations: SeatMapDecoration[];
  pois: SeatMapPoi[];
  sectionIndex: Map<string, number>;
  rowIndex: Map<string, number>;
};

export const NO_CATEGORY = "#a3a3a3";
const GRID_CELL = 48;

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba([r, g, b]: [number, number, number], a: number) {
  return `rgba(${r},${g},${b},${a})`;
}

function shade([r, g, b]: [number, number, number], k: number): [number, number, number] {
  return k < 0
    ? [Math.round(r * (1 + k)), Math.round(g * (1 + k)), Math.round(b * (1 + k))]
    : [Math.round(r + (255 - r) * k), Math.round(g + (255 - g) * k), Math.round(b + (255 - b) * k)];
}

export function sceneColor(hex: string): SceneColor {
  const rgb = hexToRgb(hex);
  const disc = rgba(shade(rgb, -0.3), 1);
  return {
    base: hex,
    fill: rgba(shade(rgb, 0.55), 0.85),
    soft: rgba(shade(rgb, 0.8), 0.7),
    stripe: rgba(shade(rgb, -0.05), 0.75),
    stroke: disc,
    label: rgba(shade(rgb, -0.35), 1),
    disc,
    rim: hex,
  };
}

export function polygonPath(points: readonly Point[]): Path2D {
  const path = new Path2D();
  points.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
  path.closePath();
  return path;
}

/** Turns the document into flat arrays and cached paths. Rebuilt on every document change. */
export function buildScene(doc: SeatMapDoc): Scene {
  const colors: SceneColor[] = doc.categories.map((c) => sceneColor(c.color));
  const categoryIndex = new Map(doc.categories.map((c, i) => [c.id, i]));
  const noCategory = colors.length;
  colors.push(sceneColor(NO_CATEGORY));

  let total = 0;
  for (const s of doc.sections) for (const r of s.rows) total += r.seats;

  const seatX = new Float32Array(total);
  const seatY = new Float32Array(total);
  const seatRow = new Int32Array(total);
  const seatNum = new Int32Array(total);
  const seatLive = new Uint8Array(total);
  const seatWheelchair = new Uint8Array(total);
  const sections: SceneSection[] = [];
  const rows: SceneRow[] = [];
  const sectionIndex = new Map<string, number>();
  const rowIndex = new Map<string, number>();
  let bounds: Bounds | null = null;
  let at = 0;
  const venues = venuesOf(doc);

  doc.sections.forEach((s, si) => {
    const cat = s.categoryId ? categoryIndex.get(s.categoryId) : undefined;
    const rowStart = rows.length;
    const seatStart = at;
    const stripes = new Path2D();
    const counts: number[] = [];
    let end = at;
    for (const r of s.rows) {
      const n = placeRow(r, seatX, seatY, end);
      counts.push(n);
      end += n;
    }
    warpSeats(s, venues, seatX, seatY, at, end);
    let k = 0;
    for (const r of s.rows) {
      const n = counts[k++];
      const ri = rows.length;
      const gone = new Set(r.removed);
      let rb: Bounds | null = null;
      const live: number[] = [];
      for (let i = 0; i < n; i++) {
        seatRow[at + i] = ri;
        seatNum[at + i] = seatNumber(r, i);
        const on = !gone.has(i);
        seatLive[at + i] = on ? 1 : 0;
        if (!on) continue;
        live.push(i);
        if (r.wheelchair.includes(seatNum[at + i])) seatWheelchair[at + i] = 1;
        const x = seatX[at + i];
        const y = seatY[at + i];
        rb = unionBounds(rb, { minX: x - SEAT_RADIUS, minY: y - SEAT_RADIUS, maxX: x + SEAT_RADIUS, maxY: y + SEAT_RADIUS });
      }
      const stripe = new Path2D();
      if (live.length) {
        const step = Math.max(1, Math.floor(live.length / 12));
        stripe.moveTo(seatX[at + live[0]], seatY[at + live[0]]);
        for (let k = step; k < live.length - 1; k += step) stripe.lineTo(seatX[at + live[k]], seatY[at + live[k]]);
        stripe.lineTo(seatX[at + live[live.length - 1]], seatY[at + live[live.length - 1]]);
      }
      stripes.addPath(stripe);
      rows.push({
        id: r.id,
        label: r.label,
        section: si,
        seatStart: at,
        seatEnd: at + n,
        stripe,
        bounds: rb ?? { minX: r.x, minY: r.y, maxX: r.x, maxY: r.y },
      });
      rowIndex.set(r.id, ri);
      at += n;
    }
    const sb = boundsOf(s.points);
    const [cx, cy] = centroid(s.points);
    sections.push({
      id: s.id,
      index: si,
      code: s.code,
      name: s.name,
      categoryLabel: (cat !== undefined && doc.categories[cat]?.label) || "",
      color: cat ?? noCategory,
      points: s.points as Point[],
      path: polygonPath(s.points as Point[]),
      stripes,
      bounds: sb,
      label: { text: s.label.text || s.code, x: cx + s.label.dx, y: cy + s.label.dy, size: s.label.size, rotation: s.label.rotation, visible: s.label.visible },
      display: s.display,
      loose: s.loose,
      rowStart,
      rowEnd: rows.length,
      seatStart,
      seatEnd: at,
    });
    sectionIndex.set(s.id, si);
    bounds = unionBounds(bounds, sb);
    for (let ri = rowStart; ri < rows.length; ri++) bounds = unionBounds(bounds, rows[ri].bounds);
  });

  for (const d of doc.decorations) bounds = unionBounds(bounds, boundsOf(boxCorners(d.x, d.y, decorationWidth(d), d.h, d.rotation)));
  for (const p of doc.pois) {
    bounds =
      p.w > 0 && p.h > 0
        ? unionBounds(bounds, boundsOf(boxCorners(p.x, p.y, p.w, p.h, p.rotation)))
        : unionBounds(bounds, { minX: p.x - 10, minY: p.y - 10, maxX: p.x + 10, maxY: p.y + 10 });
  }

  const finalBounds = bounds ?? { minX: -500, minY: -400, maxX: 500, maxY: 400 };
  return {
    doc,
    sections,
    rows,
    seatCount: total,
    seatX,
    seatY,
    seatRow,
    seatNumber: seatNum,
    seatLive,
    seatWheelchair,
    grid: buildGrid(seatX, seatY, total, finalBounds),
    bounds: finalBounds,
    colors,
    decorations: doc.decorations,
    pois: doc.pois,
    sectionIndex,
    rowIndex,
  };
}

/** Text decorations size by their label; `w` is ignored for them. */
export function decorationWidth(d: SeatMapDecoration): number {
  return d.kind === "text" ? Math.max(d.h, d.label.length * d.h * 0.58) : d.w;
}

/** Counting sort of seats into fixed cells: two passes, no per-cell arrays. */
function buildGrid(xs: Float32Array, ys: Float32Array, n: number, b: Bounds): Grid {
  const cell = GRID_CELL;
  const minX = b.minX - cell;
  const minY = b.minY - cell;
  const cols = Math.max(1, Math.ceil((b.maxX - minX) / cell) + 1);
  const rows = Math.max(1, Math.ceil((b.maxY - minY) / cell) + 1);
  const counts = new Int32Array(cols * rows + 1);
  const cellOf = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor((xs[i] - minX) / cell)));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor((ys[i] - minY) / cell)));
    const c = cy * cols + cx;
    cellOf[i] = c;
    counts[c + 1]++;
  }
  for (let c = 1; c < counts.length; c++) counts[c] += counts[c - 1];
  const start = counts.slice();
  const fill = counts.slice(0, -1);
  const items = new Int32Array(n);
  for (let i = 0; i < n; i++) items[fill[cellOf[i]]++] = i;
  return { minX, minY, cell, cols, rows, start, items };
}

/** Calls `fn` for every seat whose cell overlaps `view`. Seats near the edge may be slightly outside. */
export function forEachSeatIn(scene: Scene, view: Bounds, fn: (seat: number) => void) {
  const g = scene.grid;
  const c0 = Math.max(0, Math.floor((view.minX - g.minX) / g.cell));
  const c1 = Math.min(g.cols - 1, Math.floor((view.maxX - g.minX) / g.cell));
  const r0 = Math.max(0, Math.floor((view.minY - g.minY) / g.cell));
  const r1 = Math.min(g.rows - 1, Math.floor((view.maxY - g.minY) / g.cell));
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const cellIndex = r * g.cols + c;
      for (let k = g.start[cellIndex], end = g.start[cellIndex + 1]; k < end; k++) fn(g.items[k]);
    }
  }
}

export function seatIdAt(scene: Scene, seat: number): string {
  const row = scene.rows[scene.seatRow[seat]];
  return seatId(scene.sections[row.section].code, row.label, scene.seatNumber[seat]);
}

export const SEAT_FREE = 0;
export const SEAT_SOLD = 1;
export const SEAT_HELD = 2;
export type SeatStatus = "sold" | "held";

/** Per-seat status array for the renderer, from a map keyed by seat id (`101-4-12`). */
export function seatStatusArray(scene: Scene, status: ReadonlyMap<string, SeatStatus> | undefined): Uint8Array | null {
  if (!status?.size) return null;
  const out = new Uint8Array(scene.seatCount);
  for (let i = 0; i < scene.seatCount; i++) {
    const s = status.get(seatIdAt(scene, i));
    if (s) out[i] = s === "sold" ? SEAT_SOLD : SEAT_HELD;
  }
  return out;
}
