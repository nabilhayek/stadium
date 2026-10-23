import { boxCorners, centroid, normalizeAngle, pointInPolygon, toDeg, type Point } from "@/lib/seatmap/geometry";
import { decorationWidth, type Scene } from "@/lib/seatmap/engine/scene";

/** What can sit against a section edge without becoming part of the section. */
export const ATTACH_OPTIONS = [
  { id: "stairs", label: "Stairs" },
  { id: "wall", label: "Wall" },
  { id: "entrance", label: "Entrance" },
  { id: "exit", label: "Exit" },
  { id: "column", label: "Pillar" },
] as const;

export type AttachKind = (typeof ATTACH_OPTIONS)[number]["id"];

/** The shape the slot sits against. A wall or a gate can grow the same way a section can. */
export type AttachHost =
  | { kind: "section"; id: string; index: number }
  | { kind: "decoration"; id: string }
  | { kind: "poi"; id: string };

export function sameHost(a: AttachHost | null, b: AttachHost | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.id === b.id;
}

/** A straight side, and the slot just outside it. */
export type AttachSlot = {
  host: AttachHost;
  side: number;
  x: number;
  y: number;
  /** Length along the section edge. */
  span: number;
  /** How far the slot sticks out from the edge. */
  thick: number;
  rotation: number;
  nx: number;
  ny: number;
  ux: number;
  uy: number;
  /** `n · p = c` is the section edge the slot sits on. */
  c: number;
};

const MIN_SPAN = 8;
const STRAIGHT = 12;
const SLOT_DEPTH = 16;
/** World units. An edge this close to the section side counts as line to line. */
const FLUSH = 2.5;
/** How much of the side an object must cover before the slot is taken. */
const MIN_OVERLAP = 8;
const TURN = (12 * Math.PI) / 180;

const cache = new WeakMap<Scene, AttachSlot[]>();

/** Open slots beside every grouped section and beside the objects that can sit against one. Curved sides are skipped. */
export function attachSlots(scene: Scene): AttachSlot[] {
  const hit = cache.get(scene);
  if (hit) return hit;
  const slots: AttachSlot[] = [];
  const add = (points: readonly Point[], host: AttachHost) => {
    for (const slot of slotsOf(points, host)) if (!occupied(scene, slot)) slots.push(slot);
  };
  scene.sections.forEach((section, index) => {
    if (section.loose || section.display === "round-table" || section.display === "rect-table" || section.points.length < 3) return;
    add(section.points, { kind: "section", id: section.id, index });
  });
  for (const decoration of scene.decorations) {
    if (decoration.kind !== "wall" && decoration.kind !== "column") continue;
    add(boxCorners(decoration.x, decoration.y, decorationWidth(decoration), decoration.h, decoration.rotation), { kind: "decoration", id: decoration.id });
  }
  for (const poi of scene.pois) {
    if (poi.w <= 0 || poi.h <= 0 || (poi.kind !== "stairs" && poi.kind !== "entrance" && poi.kind !== "exit")) continue;
    add(boxCorners(poi.x, poi.y, poi.w, poi.h, poi.rotation), { kind: "poi", id: poi.id });
  }
  cache.set(scene, slots);
  return slots;
}

/** Grows a thin slot until the plus is easy to hit, outward only, so the inner edge stays on the shape. */
export function presentSlot(slot: AttachSlot, scale: number): AttachSlot {
  const safe = Math.max(scale, 0.05);
  const thick = Math.max(slot.thick, 22 / safe);
  const span = Math.max(slot.span, 28 / safe);
  const grow = thick - slot.thick;
  if (grow <= 0 && span === slot.span) return slot;
  return { ...slot, thick, span, x: slot.x + slot.nx * grow * 0.5, y: slot.y + slot.ny * grow * 0.5 };
}

/** True when the pointer is on the shape itself, so the slot beside it does not steal the click. */
export function hostContains(scene: Scene, host: AttachHost, x: number, y: number): boolean {
  if (host.kind === "section") {
    const section = scene.sections[host.index];
    return !!section && section.id === host.id && pointInPolygon(x, y, section.points);
  }
  if (host.kind === "decoration") {
    const decoration = scene.decorations.find((item) => item.id === host.id);
    return !!decoration && insideBox(decoration.x, decoration.y, decorationWidth(decoration), decoration.h, decoration.rotation, x, y, decoration.kind === "column");
  }
  const poi = scene.pois.find((item) => item.id === host.id);
  return !!poi && insideBox(poi.x, poi.y, poi.w, poi.h, poi.rotation, x, y, false);
}

export function inAttachSlot(slot: AttachSlot, x: number, y: number): boolean {
  const dx = x - slot.x;
  const dy = y - slot.y;
  const rad = (slot.rotation * Math.PI) / 180;
  const co = Math.cos(rad);
  const si = Math.sin(rad);
  const lx = dx * co + dy * si;
  const ly = -dx * si + dy * co;
  return Math.abs(lx) <= slot.span / 2 && Math.abs(ly) <= slot.thick / 2;
}

type Chain = { pts: Point[]; len: number; nx: number; ny: number };

function insideBox(cx: number, cy: number, w: number, h: number, rotation: number, x: number, y: number, ellipse: boolean): boolean {
  const rad = (-rotation * Math.PI) / 180;
  const co = Math.cos(rad);
  const si = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  const lx = dx * co - dy * si;
  const ly = dx * si + dy * co;
  if (ellipse) return w > 0 && h > 0 && (lx * lx) / ((w / 2) * (w / 2)) + (ly * ly) / ((h / 2) * (h / 2)) <= 1;
  return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
}

function slotsOf(points: readonly Point[], host: AttachHost): AttachSlot[] {
  const at = centroid(points);
  const chains = chainsOf(points, at);
  if (!chains.length) return [];
  let longest = chains[0];
  for (const chain of chains) if (chain.len > longest.len) longest = chain;
  const base = Math.atan2(longest.ny, longest.nx);
  const bins: Chain[][] = [[], [], [], []];
  for (const chain of chains) {
    const rel = Math.atan2(Math.sin(Math.atan2(chain.ny, chain.nx) - base), Math.cos(Math.atan2(chain.ny, chain.nx) - base));
    const bin = ((Math.round(rel / (Math.PI / 2)) % 4) + 4) % 4;
    bins[bin].push(chain);
  }
  const out: AttachSlot[] = [];
  bins.forEach((members, side) => {
    if (!members.length) return;
    const main = members.reduce((a, b) => (b.len > a.len ? b : a));
    const rest = members.reduce((sum, chain) => sum + (chain === main ? 0 : chain.len), 0);
    if (main.len < MIN_SPAN || rest > main.len * 0.35) return;
    const slot = slotFrom(main, host, side);
    if (slot) out.push(slot);
  });
  return out;
}

function slotFrom(chain: Chain, host: AttachHost, side: number): AttachSlot | null {
  const line = fitLine(chain.pts);
  if (!line) return null;
  let { nx, ny, c } = line;
  if (nx * chain.nx + ny * chain.ny < 0) {
    nx = -nx;
    ny = -ny;
    c = -c;
  }
  let deviation = 0;
  for (const [x, y] of chain.pts) deviation = Math.max(deviation, Math.abs(nx * x + ny * y - c));
  if (deviation > STRAIGHT) return null;
  const ux = -ny;
  const uy = nx;
  const ox = nx * c;
  const oy = ny * c;
  let lo = Infinity;
  let hi = -Infinity;
  for (const [x, y] of chain.pts) {
    const t = (x - ox) * ux + (y - oy) * uy;
    if (t < lo) lo = t;
    if (t > hi) hi = t;
  }
  const span = hi - lo;
  if (span < MIN_SPAN) return null;
  const mid = (lo + hi) / 2;
  const ex = ox + ux * mid;
  const ey = oy + uy * mid;
  return {
    host,
    side,
    x: ex + nx * (SLOT_DEPTH / 2),
    y: ey + ny * (SLOT_DEPTH / 2),
    span,
    thick: SLOT_DEPTH,
    rotation: normalizeAngle(toDeg(Math.atan2(uy, ux))),
    nx,
    ny,
    ux,
    uy,
    c,
  };
}

function chainsOf(points: readonly Point[], at: Point): Chain[] {
  const n = points.length;
  const edges = points.map((a, i) => {
    const b = points[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return { len: Math.hypot(dx, dy), ang: Math.atan2(dy, dx) };
  });
  const aligned = (i: number, j: number) => {
    if (edges[i].len < 0.5 || edges[j].len < 0.5) return true;
    const d = Math.atan2(Math.sin(edges[i].ang - edges[j].ang), Math.cos(edges[i].ang - edges[j].ang));
    return Math.abs(d) <= TURN;
  };
  const groups: number[][] = [];
  let cur: number[] = [];
  for (let i = 0; i < n; i++) {
    if (cur.length && !aligned(cur[cur.length - 1], i)) {
      groups.push(cur);
      cur = [];
    }
    cur.push(i);
  }
  if (cur.length) groups.push(cur);
  if (groups.length > 1 && aligned(groups[groups.length - 1][groups[groups.length - 1].length - 1], groups[0][0])) {
    const last = groups.pop();
    if (last) groups[0] = [...last, ...groups[0]];
  }
  return groups.flatMap((idxs) => {
    const pts: Point[] = [points[idxs[0]]];
    let len = 0;
    for (const i of idxs) {
      pts.push(points[(i + 1) % n]);
      len += edges[i].len;
    }
    if (len < 1) return [];
    const a = pts[0];
    const b = pts[pts.length - 1];
    let nx = -(b[1] - a[1]);
    let ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if (nx * (mx - at[0]) + ny * (my - at[1]) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return [{ pts, len, nx, ny }];
  });
}

function fitLine(pts: readonly Point[]): { nx: number; ny: number; c: number } | null {
  if (pts.length < 2) return null;
  let mx = 0;
  let my = 0;
  for (const [x, y] of pts) {
    mx += x;
    my += y;
  }
  mx /= pts.length;
  my /= pts.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    const dx = x - mx;
    const dy = y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx + syy < 1e-4) return null;
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);
  return { nx, ny, c: nx * mx + ny * my };
}

function occupied(scene: Scene, slot: AttachSlot): boolean {
  const shapes: Point[][] = [];
  for (const decoration of scene.decorations) {
    if (decoration.kind === "text") continue;
    if (slot.host.kind === "decoration" && decoration.id === slot.host.id) continue;
    shapes.push(boxCorners(decoration.x, decoration.y, decorationWidth(decoration), decoration.h, decoration.rotation));
  }
  for (const poi of scene.pois) {
    if (poi.w <= 0 || poi.h <= 0) continue;
    if (slot.host.kind === "poi" && poi.id === slot.host.id) continue;
    shapes.push(boxCorners(poi.x, poi.y, poi.w, poi.h, poi.rotation));
  }
  for (const section of scene.sections) {
    if (section.loose || section.points.length < 3) continue;
    if (slot.host.kind === "section" && section.id === slot.host.id) continue;
    shapes.push(section.points);
  }
  const ex = slot.x - slot.nx * (slot.thick / 2);
  const ey = slot.y - slot.ny * (slot.thick / 2);
  return shapes.some((corners) => flushWith(slot, corners, ex, ey));
}

function flushWith(slot: AttachSlot, corners: Point[], ex: number, ey: number): boolean {
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    if (Math.abs(dx * slot.ux + dy * slot.uy) / len < Math.cos((12 * Math.PI) / 180)) continue;
    const d1 = slot.nx * a[0] + slot.ny * a[1] - slot.c;
    const d2 = slot.nx * b[0] + slot.ny * b[1] - slot.c;
    if (Math.abs(d1) > FLUSH || Math.abs(d2) > FLUSH) continue;
    const t1 = (a[0] - ex) * slot.ux + (a[1] - ey) * slot.uy;
    const t2 = (b[0] - ex) * slot.ux + (b[1] - ey) * slot.uy;
    const overlap = Math.min(Math.max(t1, t2), slot.span / 2) - Math.max(Math.min(t1, t2), -slot.span / 2);
    if (overlap >= Math.min(MIN_OVERLAP, slot.span * 0.45)) return true;
  }
  return false;
}
