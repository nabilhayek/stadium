import {
  boundsIntersect,
  boundsOf,
  makeRow,
  moveSection,
  normalizeAngle,
  outlineOfSeats,
  placeSection,
  pointInPolygon,
  rowLabels,
  seatDefaults,
  toDeg,
  venuePath,
  venuesOf,
  type VenuePath,
} from "./geometry";
import {
  DEFAULT_ROW_PITCH,
  DEFAULT_SEAT_PITCH,
  MAX_SEATS_PER_ROW,
  SEAT_RADIUS,
  newId,
  type SeatMapDecoration,
  type SeatMapDoc,
  type SeatMapPoi,
  type SeatMapRow,
  type SeatMapSection,
} from "./schema";

/**
 * Seating laid out along the venue shape, the same way the designer's "follow the
 * venue" sections work: each section is a straight block of rows with an exact
 * seat count per row, and the engine wraps it along the rim. Callers describe
 * where things go (a stretch of the rim, a distance out from it) and never
 * compute coordinates, so rows cannot spill out of their section or cross.
 */

/** Section outline padding, seat edge to outline. */
export const PAD = 3;
/** Seat centre to outline. */
export const EDGE = SEAT_RADIUS + PAD;
export const MAX_TIER_ROWS = 100;

export type BowlShape = "rounded" | "oval" | "square";
const SHAPE_RADIUS: Record<BowlShape, number> = { rounded: 0.32, oval: 0.5, square: 0.08 };

const DEFAULT_FIELD = { w: 1050, h: 680 };

/** The venue shape seating is built around: the one nearest the field, else the first. */
export function mainVenue(doc: SeatMapDoc): SeatMapDecoration | null {
  const venues = venuesOf(doc);
  if (!venues.length) return null;
  const field = doc.decorations.find((d) => d.kind === "field") ?? doc.decorations.find((d) => d.kind === "stage");
  if (!field) return venues[0];
  return venues.reduce((best, v) => (Math.hypot(v.x - field.x, v.y - field.y) < Math.hypot(best.x - field.x, best.y - field.y) ? v : best));
}

/** A venue shape `apron` outside the field (or the default pitch when there is none). */
export function venueAround(doc: SeatMapDoc, shape: BowlShape, apron: number): SeatMapDecoration {
  const field = doc.decorations.find((d) => d.kind === "field") ?? doc.decorations.find((d) => d.kind === "stage");
  const turned = field ? Math.abs(Math.sin((field.rotation * Math.PI) / 180)) > 0.7 : false;
  const fw = field ? (turned ? field.h : field.w) : DEFAULT_FIELD.w;
  const fh = field ? (turned ? field.w : field.h) : DEFAULT_FIELD.h;
  const w = Math.round(fw + apron * 2);
  const h = Math.round(fh + apron * 2);
  return {
    id: newId("d"),
    kind: "venue",
    x: field?.x ?? 0,
    y: field?.y ?? 0,
    w,
    h,
    rotation: 0,
    label: "",
    color: "#f0a77a",
    radius: Math.round(Math.min(w, h) * SHAPE_RADIUS[shape]),
  };
}

/** The venue path, adding a venue shape around the field first when the map has none. */
export function ensureBowl(doc: SeatMapDoc): { doc: SeatMapDoc; path: VenuePath; created: boolean } {
  const venue = mainVenue(doc);
  if (venue) return { doc, path: venuePath(venue), created: false };
  const made = venueAround(doc, "rounded", 70);
  return { doc: { ...doc, decorations: [...doc.decorations, made] }, path: venuePath(made), created: true };
}

/* ---------- reading what is there ---------- */

const wrap = (t: number, total: number) => ((t % total) + total) % total;
/** Signed shortest difference b - a on a loop. */
const diff = (a: number, b: number, total: number) => {
  const d = wrap(b - a, total);
  return d > total / 2 ? d - total : d;
};

export type Span = {
  section: SeatMapSection;
  /** Distance from the core of the front and back seat centres. */
  front: number;
  back: number;
  /** Arc length of the first and last seat on the path at `at`, clockwise; t1 may pass the loop length. */
  t0: number;
  t1: number;
  at: number;
};

/** Where a section's seats sit along the venue path, measured on the path `at` from the core. */
export function spanOf(path: VenuePath, section: SeatMapSection, venues: readonly SeatMapDecoration[], at?: number): Span | null {
  const placed = placeSection(section, venues);
  const n = placed.xs.length;
  if (!n) return null;
  let front = Infinity;
  let back = -Infinity;
  for (let i = 0; i < n; i++) {
    const d = path.distance(placed.xs[i], placed.ys[i]);
    if (d < front) front = d;
    if (d > back) back = d;
  }
  const ref = at ?? front;
  const total = path.length(ref);
  // Circular mean, then the furthest seats either side of it.
  let sx = 0;
  let sy = 0;
  const ts = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = wrap(path.project(placed.xs[i], placed.ys[i], ref), total);
    ts[i] = t;
    const a = (t / total) * Math.PI * 2;
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  const mean = wrap((Math.atan2(sy, sx) / (Math.PI * 2)) * total, total);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    const d = diff(mean, ts[i], total);
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  const t0 = wrap(mean + lo, total);
  return { section, front, back, t0, t1: t0 + (hi - lo), at: ref };
}

/** Bearings (degrees clockwise from the top) covered from `from` to `to`, clockwise. */
export function inBearings(bearing: number, from: number, to: number): boolean {
  const span = wrap(to - from, 360) || 360;
  return wrap(bearing - from, 360) <= span;
}

/**
 * Furthest point of anything already built between two bearings, as a distance
 * from the core. Seats and section outlines inside the venue (floor seating) do
 * not count, so the result is never less than the rim.
 */
export function reachBetween(doc: SeatMapDoc, path: VenuePath, from: number, to: number, ignore?: ReadonlySet<string>): number {
  const venues = venuesOf(doc);
  let out = path.rim;
  for (const s of doc.sections) {
    if (ignore?.has(s.id) || s.loose) continue;
    for (const [x, y] of s.points) {
      if (!inBearings(path.bearing(x, y), from, to)) continue;
      const d = path.distance(x, y);
      if (d > out) out = d;
    }
    if (s.display !== "seats") continue;
    const placed = placeSection(s, venues);
    for (let i = 0; i < placed.xs.length; i++) {
      const x = placed.xs[i];
      const y = placed.ys[i];
      if (!inBearings(path.bearing(x, y), from, to)) continue;
      const d = path.distance(x, y) + EDGE;
      if (d > out) out = d;
    }
  }
  return out;
}

/* ---------- laying out sections ---------- */

/** Seats per row, front to back, as even as possible; any extra seat goes to the back rows. */
export function evenRows(seats: number, rows: number): number[] {
  const base = Math.floor(seats / rows);
  const extra = seats - base * rows;
  return Array.from({ length: rows }, (_, i) => base + (i >= rows - extra ? 1 : 0));
}

/** Most seats a row can hold in `frontage` of rim, outline padding included. */
export function seatsInFrontage(frontage: number): number {
  return Math.min(MAX_SEATS_PER_ROW, Math.max(0, Math.floor((frontage - EDGE * 2) / DEFAULT_SEAT_PITCH) + 1));
}

/** Rim needed for a row of this many seats, outline padding included. */
export function frontageFor(perRow: number): number {
  return (perRow - 1) * DEFAULT_SEAT_PITCH + EDGE * 2;
}

export type BlockSpec = {
  code: string;
  name: string;
  categoryId: string | null;
  /** Arc length of the middle of the front row, on the path at `front`. */
  mid: number;
  /** Distance of the front row's seat centres from the core. */
  front: number;
  perRow: number[];
};

/**
 * One following section: a straight block of rows standing on the path at `mid`,
 * seat 1 on the left as seen from the field, rows running outward.
 */
export function blockOnPath(doc: SeatMapDoc, path: VenuePath, spec: BlockSpec): SeatMapSection {
  const p = path.at(spec.mid, spec.front);
  // Along the rows: anticlockwise, so seat 1 is on the spectator's left.
  const ux = -p.tx;
  const uy = -p.ty;
  const rotation = normalizeAngle(toDeg(Math.atan2(uy, ux)));
  const labels = rowLabels(doc.numbering, spec.perRow.length);
  const defaults = seatDefaults(doc.numbering);
  const rows: SeatMapRow[] = spec.perRow.map((seats, k) =>
    makeRow({
      ...defaults,
      label: labels[k],
      seats,
      x: round(p.x + p.nx * k * DEFAULT_ROW_PITCH),
      y: round(p.y + p.ny * k * DEFAULT_ROW_PITCH),
      rotation,
      pitch: DEFAULT_SEAT_PITCH,
    }),
  );
  const section: SeatMapSection = {
    id: newId("s"),
    code: spec.code,
    name: spec.name.slice(0, 60),
    categoryId: spec.categoryId,
    points: [],
    label: { text: "", size: 20, dx: 0, dy: 0, rotation: 0, visible: true },
    entrance: "",
    display: "seats",
    loose: false,
    rows,
    bend: 0,
    follow: "on",
    face: "front",
    outline: "auto",
    padding: [PAD, PAD, PAD, PAD],
  };
  return withOutline(doc, section);
}

/** Recomputes the outline from the seats, as the designer does for auto outlines. */
export function withOutline(doc: SeatMapDoc, section: SeatMapSection): SeatMapSection {
  const points = outlineOfSeats(section, venuesOf(doc));
  if (points.length < 3) return section;
  const b = boundsOf(points);
  const size = Math.round(Math.max(10, Math.min(36, Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.3)));
  return { ...section, points, label: { ...section.label, size } };
}

export type TierPlan = {
  /** Clockwise arc length where the first section's frontage starts, at `front`. */
  start: number;
  /** Rim covered, including the aisles. */
  length: number;
  front: number;
  /** Target seats per section, or null to fill `rows` full rows. */
  targets: number[] | null;
  count: number;
  rows?: number;
  aisle: number;
};

export type TierLayout = { mids: number[]; perRow: number[][]; rows: number; perRowMax: number };

/** Splits a stretch of rim into equal frontages and solves rows so every section gets its exact seats. */
export function planTier(plan: TierPlan): TierLayout | string {
  const slot = plan.length / plan.count;
  const perRowMax = seatsInFrontage(slot - plan.aisle);
  if (perRowMax < 1) return `Sections are too narrow for a seat (${(slot / 10).toFixed(1)} m each). Use fewer sections or a wider stretch.`;
  let rows = plan.rows;
  if (rows === undefined) {
    if (!plan.targets) return "Give seats or rows.";
    rows = Math.max(...plan.targets.map((t) => Math.ceil(t / perRowMax)));
  }
  if (rows > MAX_TIER_ROWS)
    return `That needs ${rows} rows (at most ${perRowMax} seats fit in a row here). Use more sections, a longer stretch, or split it into two tiers.`;
  const targets = plan.targets ?? Array(plan.count).fill(rows * perRowMax);
  const perRow: number[][] = [];
  for (const t of targets) {
    if (t < rows) return `${t} seats cannot fill ${rows} rows; use fewer rows.`;
    if (t > rows * perRowMax) return `${t} seats need more than ${rows} rows of ${perRowMax}; leave rows out or lower the seats.`;
    perRow.push(evenRows(t, rows));
  }
  const mids = Array.from({ length: plan.count }, (_, j) => plan.start + slot * (j + 0.5));
  return { mids, perRow, rows, perRowMax };
}

/** Front-row distance for a tier `gap` outside `reach` (an outer edge, outline included). */
export const frontAfter = (reach: number, gap: number) => reach + gap + EDGE;

/* ---------- moving following sections ---------- */

/** The front row's middle, where a following section stands on its path. */
function poseOf(path: VenuePath, section: SeatMapSection) {
  const rows = section.rows.filter((r) => r.layout === "line");
  if (!rows.length) return null;
  let best = rows[0];
  let bestD = path.distance(best.x, best.y);
  for (const r of rows) {
    const d = path.distance(r.x, r.y);
    if (d < bestD) {
      best = r;
      bestD = d;
    }
  }
  return { x: best.x, y: best.y, d: bestD, t: path.project(best.x, best.y, bestD), rotation: best.rotation };
}

/** Stands the section's front row on the path at `t`, `d` from the core, turned to match. */
export function reposeSection(doc: SeatMapDoc, path: VenuePath, section: SeatMapSection, t: number, d: number): SeatMapSection {
  const pose = poseOf(path, section);
  if (!pose) return section;
  const p = path.at(t, d);
  const angle = normalizeAngle(toDeg(Math.atan2(-p.ty, -p.tx)) - pose.rotation);
  const moved = moveSection(section, { angle, px: pose.x, py: pose.y, dx: p.x - pose.x, dy: p.y - pose.y });
  return section.outline === "auto" ? withOutline(doc, moved) : moved;
}

/** Slides along the rim (clockwise metres in world units) and/or moves away from the field. */
export function shiftOnPath(doc: SeatMapDoc, path: VenuePath, section: SeatMapSection, along: number, out: number): SeatMapSection {
  const pose = poseOf(path, section);
  if (!pose) return section;
  const d = Math.max(path.rim + EDGE, pose.d + out);
  // Slide on the front path, then carry the position out radially.
  const p = path.at(pose.t + along, pose.d);
  return reposeSection(doc, path, section, path.project(p.x, p.y, d), d);
}

/**
 * Moves everything whose front lies at or beyond `from` (distance from the core)
 * `by` further out: sections, points and stairs. Used when an inner tier grows.
 */
export function pushOut(doc: SeatMapDoc, path: VenuePath, from: number, by: number, skip: ReadonlySet<string>): SeatMapDoc {
  if (by <= 0) return doc;
  const venues = venuesOf(doc);
  const sections = doc.sections.map((s) => {
    if (skip.has(s.id)) return s;
    const span = spanOf(path, s, venues);
    if (!span || span.front < from - 1) return s;
    if (s.follow !== "off") return shiftOnPath(doc, path, s, 0, by);
    const p = path.at(path.project((s.points[0]?.[0] ?? 0), (s.points[0]?.[1] ?? 0), span.front), span.front);
    return moveSection(s, { angle: 0, px: 0, py: 0, dx: p.nx * by, dy: p.ny * by });
  });
  const pois = doc.pois.map((p) => {
    const d = path.distance(p.x, p.y);
    if (d < from - 1) return p;
    const at = path.at(path.project(p.x, p.y, d), d + by);
    return { ...p, x: round(at.x), y: round(at.y) };
  });
  return { ...doc, sections, pois };
}

/* ---------- checks ---------- */

/** Codes of other sections the given ones would overlap. */
export function overlapsWith(doc: SeatMapDoc, made: readonly SeatMapSection[], ignore: ReadonlySet<string> = new Set()): string[] {
  const venues = venuesOf(doc);
  const mine = new Set(made.map((s) => s.id));
  const hits = new Set<string>();
  for (const s of made) {
    if (s.points.length < 3) continue;
    const sb = boundsOf(s.points);
    const seats = placeSection(s, venues);
    for (const o of doc.sections) {
      if (mine.has(o.id) || ignore.has(o.id) || o.loose || o.points.length < 3) continue;
      if (!boundsIntersect(sb, boundsOf(o.points))) continue;
      const step = Math.max(1, Math.floor(seats.xs.length / 400));
      let hit = false;
      for (let i = 0; i < seats.xs.length && !hit; i += step) hit = pointInPolygon(seats.xs[i], seats.ys[i], o.points);
      if (!hit && o.display === "seats") {
        const theirs = placeSection(o, venues);
        const step2 = Math.max(1, Math.floor(theirs.xs.length / 400));
        for (let i = 0; i < theirs.xs.length && !hit; i += step2) hit = pointInPolygon(theirs.xs[i], theirs.ys[i], s.points);
      }
      if (hit) hits.add(o.code);
    }
  }
  return [...hits].sort();
}

/* ---------- stairs ---------- */

/** Stairs in every aisle between neighbouring sections of each tier, front row to back row. */
export function stairsOnPath(doc: SeatMapDoc, path: VenuePath, sections: readonly SeatMapSection[]): SeatMapPoi[] {
  const venues = venuesOf(doc);
  const spans = sections.map((s) => spanOf(path, s, venues)).filter((s): s is Span => s !== null);
  // Tiers: sections whose fronts sit within 1.5 m of each other.
  spans.sort((a, b) => a.front - b.front);
  const tiers: Span[][] = [];
  for (const s of spans) {
    const tier = tiers.find((t) => Math.abs(t[0].front - s.front) < 15);
    if (tier) tier.push(s);
    else tiers.push([s]);
  }
  const existing = doc.pois.filter((p) => p.kind === "stairs");
  const out: SeatMapPoi[] = [];
  for (const tier of tiers) {
    if (tier.length < 2) continue;
    const ref = Math.min(...tier.map((s) => s.front));
    const total = path.length(ref);
    const on = tier.map((s) => spanOf(path, s.section, venues, ref)!).sort((a, b) => a.t0 - b.t0);
    for (let i = 0; i < on.length; i++) {
      const a = on[i];
      const b = on[(i + 1) % on.length];
      const gap = wrap(b.t0 - a.t1, total);
      // Seat centre to seat centre: an aisle is a few metres; a larger gap is the open end of an arc.
      if (gap < SEAT_RADIUS * 2 + 4 || gap > 60) continue;
      const tc = a.t1 + gap / 2;
      const front = Math.min(a.front, b.front);
      const back = Math.max(a.back, b.back);
      const mid = (front + back) / 2;
      const base = path.at(tc, ref);
      const p = path.at(path.project(base.x, base.y, mid), mid);
      const w = Math.max(6, Math.min(16, gap - EDGE * 2 - 1));
      if (existing.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < w) || out.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < w)) continue;
      out.push({
        id: newId("p"),
        kind: "stairs",
        x: round(p.x),
        y: round(p.y),
        label: "",
        w: round(w),
        h: round(back - front + DEFAULT_ROW_PITCH),
        rotation: normalizeAngle(toDeg(Math.atan2(p.nx, -p.ny))),
      });
    }
  }
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;
