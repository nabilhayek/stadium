import {
  EDGE,
  blockOnPath,
  ensureBowl,
  evenRows,
  frontAfter,
  frontageFor,
  mainVenue,
  MAX_TIER_ROWS,
  overlapsWith,
  planTier,
  pushOut,
  reachBetween,
  seatsInFrontage,
  shiftOnPath,
  spanOf,
  stairsOnPath,
  venueAround,
  withOutline,
  type BowlShape,
} from "./bowl";
import {
  applySeatCount,
  boundsOf,
  boxCorners,
  distanceToOutline,
  makeRow,
  moveSection,
  nextRowLabel,
  nextSectionCode,
  normalizeAngle,
  rotation as rotationAbout,
  rowLabels,
  round2,
  seatCount,
  seatDefaults,
  seatsOfSection,
  sectionSeatCount,
  toDeg,
  toRad,
  translation,
  venuePath,
  venuesOf,
  type Point,
  type VenuePath,
} from "./geometry";
import {
  CATEGORY_PALETTE,
  DEFAULT_ROW_PITCH,
  DEFAULT_SEAT_PITCH,
  MAX_ROWS_PER_SECTION,
  MAX_SECTIONS,
  MAX_SEATS_PER_ROW,
  MAX_TOTAL_SEATS,
  SEAT_RADIUS,
  newId,
  seatMapSchema,
  type PoiKind,
  type SeatMapCategory,
  type SeatMapDecoration,
  type SeatMapDoc,
  type SeatMapPoi,
  type SeatMapRow,
  type SeatMapSection,
} from "./schema";
import { validateSeatMap } from "./validate";

/**
 * High-level venue building blocks: tiers around the venue shape, stands, single
 * sections, floor seating, stairs and gates. Every operation is pure, takes world
 * units (decimetres) and returns a new document or a readable error. Seating is
 * built on the venue shape (see `bowl.ts`), so callers say where, never x/y.
 * Rings are numbered by section code: ring 2 holds sections 201, 202, …
 */

export type BuildResult = { ok: true; doc: SeatMapDoc; note: string } | { ok: false; error: string };

const fail = (error: string): BuildResult => ({ ok: false, error });
const fmt = (n: number) => n.toLocaleString("en-US");
const metres = (dm: number) => `${(dm / 10).toFixed(1)} m`;

/* ---------- venue frame ---------- */

export type VenueFrame = { cx: number; cy: number; a: number; b: number; kind: "field" | "stage" | "default" };

const DEFAULT_FIELD = { w: 1050, h: 680 };
/** Walkway between tiers. */
const CONCOURSE = 45;
/** First tier's front, outside the venue rim. */
const FIRST_GAP = 5;
const AISLE = 14;

export function venueFrame(doc: SeatMapDoc): VenueFrame {
  const centre = doc.decorations.find((d) => d.kind === "field") ?? doc.decorations.find((d) => d.kind === "stage");
  if (!centre) return { cx: 0, cy: 0, a: DEFAULT_FIELD.w / 2, b: DEFAULT_FIELD.h / 2, kind: "default" };
  const turned = Math.abs(Math.sin(toRad(centre.rotation))) > 0.7;
  const w = turned ? centre.h : centre.w;
  const h = turned ? centre.w : centre.h;
  return { cx: centre.x, cy: centre.y, a: w / 2, b: h / 2, kind: centre.kind === "field" ? "field" : "stage" };
}

export const bearingOf = (f: VenueFrame, x: number, y: number) => normalizeAngle(toDeg(Math.atan2(x - f.cx, -(y - f.cy))));

/** The venue path for placing things, without adding a venue shape when there is none. */
function pathFor(doc: SeatMapDoc): VenuePath {
  const venue = mainVenue(doc);
  return venuePath(venue ?? venueAround(doc, "rounded", 70));
}

/* ---------- rings and section selection ---------- */

export function ringOf(code: string): number | null {
  return /^\d{3,4}$/.test(code) ? Math.floor(Number(code) / 100) : null;
}

export function ringSections(doc: SeatMapDoc, ring: number): SeatMapSection[] {
  return doc.sections.filter((s) => ringOf(s.code) === ring).sort((a, b) => Number(a.code) - Number(b.code));
}

export function ringNumbers(doc: SeatMapDoc): number[] {
  const set = new Set<number>();
  for (const s of doc.sections) {
    const r = ringOf(s.code);
    if (r !== null) set.add(r);
  }
  return [...set].sort((a, b) => a - b);
}

export type Target = {
  ring?: number;
  codes?: string[];
  category?: string;
  /** Keep every n-th section of the selection, counted from `start` (1-based). */
  every?: number;
  start?: number;
};

function expandCodes(codes: string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of codes) {
    const c = raw.trim().toUpperCase();
    const range = /^(\d+)\s*[-–]\s*(\d+)$/.exec(c);
    const lettered = /^([A-Z]+)(\d+)\s*[-–]\s*\1?(\d+)$/.exec(c);
    if (range) {
      const [lo, hi] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b);
      for (let i = lo; i <= Math.min(hi, lo + 999); i++) out.add(String(i));
    } else if (lettered) {
      const [lo, hi] = [Number(lettered[2]), Number(lettered[3])].sort((a, b) => a - b);
      for (let i = lo; i <= Math.min(hi, lo + 999); i++) out.add(`${lettered[1]}${i}`);
    } else if (c) out.add(c);
  }
  return out;
}

export function findCategory(doc: SeatMapDoc, name: string): SeatMapCategory | undefined {
  const key = name.trim().toLowerCase();
  return doc.categories.find((c) => c.id.toLowerCase() === key) ?? doc.categories.find((c) => c.label.toLowerCase() === key);
}

const byCode = (a: SeatMapSection, b: SeatMapSection) => (Number(a.code) || 0) - (Number(b.code) || 0) || a.code.localeCompare(b.code, "en", { numeric: true });

export function selectSections(doc: SeatMapDoc, t: Target): { sections: SeatMapSection[] } | { error: string } {
  let list = [...doc.sections];
  if (t.ring !== undefined) {
    list = list.filter((s) => ringOf(s.code) === t.ring);
    if (!list.length) return { error: `No ring ${t.ring}. Rings: ${ringNumbers(doc).join(", ") || "none"}.` };
  }
  if (t.codes?.length) {
    const want = expandCodes(t.codes);
    list = list.filter((s) => want.has(s.code));
    if (!list.length) return { error: `No sections match ${t.codes.join(", ")}.` };
  }
  if (t.category) {
    const cat = findCategory(doc, t.category);
    if (!cat) return { error: `No category "${t.category}". Categories: ${doc.categories.map((c) => c.label).join(", ")}.` };
    list = list.filter((s) => s.categoryId === cat.id);
  }
  list.sort(byCode);
  if (t.every && t.every > 1) {
    const start = Math.max(1, t.start ?? 1) - 1;
    list = list.filter((_, i) => i >= start && (i - start) % t.every! === 0);
  }
  if (t.ring === undefined && !t.codes?.length && !t.category) return { error: "Say which sections: ring, codes or category." };
  if (!list.length) return { error: "That selection is empty." };
  return { sections: list };
}

/* ---------- seat count helpers ---------- */

/** Integers summing exactly to `total`, as close to `weights` as possible. */
export function shareOut(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]]++;
  return out;
}

/** Per-section targets: a total split evenly, with an optional every-n-th adjustment. */
export function sectionTargets(count: number, total: number, pattern?: { every: number; start?: number; delta: number }): number[] | string {
  const deltas = Array.from({ length: count }, (_, j) => {
    if (!pattern || pattern.every < 1) return 0;
    const s = Math.max(1, pattern.start ?? 1) - 1;
    return j >= s && (j - s) % pattern.every === 0 ? pattern.delta : 0;
  });
  const base = (total - deltas.reduce((a, b) => a + b, 0)) / count;
  if (base + Math.min(0, ...deltas) < 1) return "Those numbers leave a section with no seats.";
  const exact = deltas.map((d) => base + d);
  const floor = exact.map(Math.floor);
  let left = total - floor.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length, left--) floor[order[k][1]]++;
  return floor;
}

/** A row with a new seat count on the same circle: the arc angle scales with the length. */
function resizeArc(row: SeatMapRow, seats: number): SeatMapRow {
  const next = applySeatCount(row, seats, "packed");
  if (!row.curve || row.seats < 2) return next;
  const curve = (row.curve * Math.max(0, next.seats - 1)) / (row.seats - 1);
  return { ...next, curve: Math.round(curve * 100) / 100 };
}

/** Shrinks rows evenly so the section holds exactly `target` seats. Rows never grow. */
function trimRows(rows: SeatMapRow[], target: number): SeatMapRow[] {
  const cap = rows.reduce((n, r) => n + r.seats, 0);
  if (target >= cap) return rows;
  const counts = shareOut(target, rows.map((r) => r.seats)).map((c, i) => Math.max(1, Math.min(rows[i].seats, c)));
  let diff = counts.reduce((a, b) => a + b, 0) - target;
  for (let i = counts.length - 1; diff > 0 && i >= 0; i--) {
    const take = Math.min(diff, counts[i] - 1);
    counts[i] -= take;
    diff -= take;
  }
  return rows.map((r, i) => (counts[i] === r.seats ? r : resizeArc(r, counts[i])));
}

function labelSize(points: Point[]) {
  const b = boundsOf(points);
  return Math.round(Math.max(10, Math.min(36, Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.3)));
}

function sectionShell(code: string, name: string, categoryId: string | null, points: Point[], rows: SeatMapRow[]): SeatMapSection {
  return {
    id: newId("s"),
    code,
    name: name.slice(0, 60),
    categoryId,
    points,
    label: { text: "", size: labelSize(points), dx: 0, dy: 0, rotation: 0, visible: true },
    entrance: "",
    display: "seats",
    loose: false,
    rows,
    bend: 0,
    follow: "off",
    face: "auto",
    outline: "drawn",
    padding: [3, 3, 3, 3],
  };
}

function defaultCategory(doc: SeatMapDoc, ring: number): string | null {
  const tier = ["lower", "middle", "upper"][Math.min(2, ring - 1)];
  if (doc.categories.some((c) => c.id === tier)) return tier;
  return doc.categories[0]?.id ?? null;
}

function resolveCategory(doc: SeatMapDoc, name: string | undefined, fallback: string | null): { id: string | null } | { error: string } {
  if (!name) return { id: fallback };
  const cat = findCategory(doc, name);
  if (!cat) return { error: `No category "${name}". Use set_category to create it. Categories: ${doc.categories.map((c) => c.label).join(", ")}.` };
  return { id: cat.id };
}

function freeCode(doc: SeatMapDoc, prefix: string, taken: Set<string>): string {
  for (let i = 1; ; i++) {
    const code = `${prefix}${i}`;
    if (!taken.has(code) && !doc.sections.some((s) => s.code === code)) {
      taken.add(code);
      return code;
    }
  }
}

function nextRing(doc: SeatMapDoc): number {
  const used = ringNumbers(doc);
  return used.length ? used[used.length - 1] + 1 : 1;
}

/* ---------- tiers on the venue shape: rings, arcs and stands ---------- */

export type Side = "north" | "south" | "east" | "west";
const SIDE_BEARING: Record<Side, number> = { north: 0, east: 90, south: 180, west: 270 };

/** The straight side of the path `d` from the core, as a stretch of arc length. */
function sideStretch(path: VenuePath, side: Side, d: number) {
  const q = (d * Math.PI) / 2;
  const { ax, by } = path;
  const start = { north: 0, east: 2 * ax + q, south: 2 * ax + 2 * q + 2 * by, west: 4 * ax + 3 * q + 2 * by }[side];
  const length = side === "north" || side === "south" ? 2 * ax : 2 * by;
  return { start, length };
}

function sideBearings(path: VenuePath, side: Side) {
  const s = sideStretch(path, side, path.rim);
  const a = path.at(s.start, path.rim);
  const b = path.at(s.start + s.length, path.rim);
  return { from: path.bearing(a.x, a.y), to: path.bearing(b.x, b.y) };
}

export type RingInput = {
  sections?: number;
  seats?: number;
  rows?: number;
  sectionSeats?: number[];
  pattern?: { every: number; start?: number; delta: number };
  /** Bearings in degrees, clockwise from the top of the map. Omit for a closed ring. */
  arc?: { from: number; to: number };
  gap?: number;
  aisle?: number;
  category?: string;
  name?: string;
  stairs?: boolean;
  /** Rebuild this ring in place instead of adding a new one outside. */
  replace?: number;
};

export type StandInput = {
  side: Side;
  sections?: number;
  seats?: number;
  rows?: number;
  sectionSeats?: number[];
  pattern?: { every: number; start?: number; delta: number };
  length?: number;
  gap?: number;
  aisle?: number;
  category?: string;
  name?: string;
  stairs?: boolean;
};

type TierInput = RingInput & { side?: Side; length?: number };

export function addRing(doc: SeatMapDoc, input: RingInput): BuildResult {
  return buildTier(doc, input, "ring");
}

/** A straight grandstand along one side of the venue shape, behind anything already on that side. */
export function addStand(doc: SeatMapDoc, input: StandInput): BuildResult {
  return buildTier(doc, input, "stand");
}

function buildTier(source: SeatMapDoc, input: TierInput, mode: "ring" | "stand"): BuildResult {
  const bowl = ensureBowl(source);
  let doc = bowl.doc;
  const path = bowl.path;
  const notes: string[] = bowl.created ? ["Added a venue shape around the field; the seating follows it."] : [];
  const aisle = Math.max(4, Math.min(60, input.aisle ?? AISLE));
  const venues = venuesOf(doc);

  // Rebuilding a ring: drop it (and its stairs) and build in the same place.
  let ringNo = 0;
  let oldFront: number | undefined;
  let hadStairs = false;
  if (mode === "ring") {
    if (input.replace !== undefined) {
      const old = ringSections(doc, input.replace);
      if (!old.length) return fail(`No ring ${input.replace} to replace.`);
      ringNo = input.replace;
      const spans = old.map((s) => spanOf(path, s, venues)).filter((s) => s !== null);
      oldFront = spans.length ? Math.min(...spans.map((s) => s.front)) : undefined;
      const ids = new Set(old.map((s) => s.id));
      const stairsOfRing = new Set(doc.pois.filter((p) => p.kind === "stairs" && nearestSection(doc, p)?.id && ids.has(nearestSection(doc, p)!.id)).map((p) => p.id));
      hadStairs = stairsOfRing.size > 0;
      doc = { ...doc, sections: doc.sections.filter((s) => !ids.has(s.id)), pois: doc.pois.filter((p) => !stairsOfRing.has(p.id)) };
    } else {
      ringNo = nextRing(doc);
      if (ringNo > 99) return fail("No ring numbers left.");
    }
  }

  // Which bearings the tier covers, so it stacks behind what is already there.
  const side = input.side ?? "north";
  const range = mode === "stand" ? sideBearings(path, side) : input.arc ? { from: input.arc.from, to: input.arc.to } : { from: 0, to: 360 };
  let front: number;
  if (oldFront !== undefined && input.gap === undefined) front = oldFront;
  else {
    const inner = oldFront !== undefined ? { ...doc, sections: doc.sections.filter((s) => (spanOf(path, s, venues)?.back ?? 0) < oldFront!) } : doc;
    const reach = reachBetween(inner, path, range.from, range.to);
    front = frontAfter(reach, input.gap ?? (reach > path.rim + 1 ? CONCOURSE : FIRST_GAP));
  }

  // The stretch of rim at that distance.
  const total = path.length(front);
  let start: number;
  let length: number;
  if (mode === "stand") {
    const s = sideStretch(path, side, front);
    if (s.length < 40) return fail(`The ${side} side of the venue shape is only ${metres(s.length)} straight. Use add_ring with an arc instead.`);
    length = input.length ? Math.min(input.length, s.length) : s.length;
    start = s.start + (s.length - length) / 2;
  } else if (input.arc) {
    const a = path.atBearing(input.arc.from, front);
    const b = path.atBearing(input.arc.to, front);
    length = (((b - a) % total) + total) % total || total;
    start = a;
    if (length < 20) return fail("That arc is too short.");
  } else {
    length = total;
    start = 0;
  }

  const count = Math.round(
    input.sections ??
      input.sectionSeats?.length ??
      (mode === "stand"
        ? Math.max(1, Math.min(12, Math.round(length / 250)))
        : Math.max(input.arc ? 2 : 4, Math.min(24, Math.round((input.seats ?? 6000) / 700), Math.ceil((24 * length) / total)))),
  );
  if (!(count >= 1 && count <= 99)) return fail("A tier holds 1–99 sections.");
  if (doc.sections.length + count > MAX_SECTIONS) return fail(`A map holds at most ${MAX_SECTIONS} sections.`);
  // A closed ring starts half a section before the top, so section 1 is centred there.
  if (mode === "ring" && !input.arc) start = path.atBearing(0, front) - length / (2 * count);

  let targets: number[] | null = null;
  if (input.sectionSeats?.length) {
    if (input.sectionSeats.length !== count) return fail(`section_seats has ${input.sectionSeats.length} numbers for ${count} sections.`);
    if (input.sectionSeats.some((v) => !(v >= 1))) return fail("Every section needs at least one seat.");
    targets = input.sectionSeats.map(Math.round);
  } else if (input.seats !== undefined) {
    const t = sectionTargets(count, Math.round(input.seats), input.pattern);
    if (typeof t === "string") return fail(t);
    targets = t;
  } else if (input.rows === undefined) return fail("Give seats (total), section_seats or rows.");
  if (input.rows !== undefined && !(input.rows >= 1 && input.rows <= MAX_TIER_ROWS)) return fail(`Rows must be 1–${MAX_TIER_ROWS}.`);
  const plan = planTier({ start, length, front, targets, count, rows: input.rows, aisle });
  if (typeof plan === "string") return fail(plan);
  const planned = plan.perRow.reduce((a, rows) => a + rows.reduce((x, y) => x + y, 0), 0);
  if (seatCount(doc) + planned > MAX_TOTAL_SEATS) return fail(`A map holds at most ${fmt(MAX_TOTAL_SEATS)} seats.`);

  const cat = resolveCategory(doc, input.category, mode === "ring" ? defaultCategory(doc, ringNo) : (doc.categories[0]?.id ?? null));
  if ("error" in cat) return fail(cat.error);
  const catLabel = doc.categories.find((c) => c.id === cat.id)?.label;
  const name = input.name?.trim() || (mode === "stand" ? `${side[0].toUpperCase()}${side.slice(1)} stand` : catLabel || `Ring ${ringNo}`);
  const taken = new Set<string>();
  const prefix = side[0].toUpperCase();
  const sections = plan.mids.map((mid, j) => {
    const code = mode === "ring" ? String(ringNo * 100 + j + 1) : freeCode(doc, prefix, taken);
    return blockOnPath(doc, path, { code, name: `${name} ${code}`, categoryId: cat.id, mid, front, perRow: plan.perRow[j] });
  });
  const made = new Set(sections.map((s) => s.id));
  let next: SeatMapDoc = { ...doc, sections: [...doc.sections, ...sections] };

  let hits = overlapsWith(next, sections);
  if (hits.length && oldFront !== undefined) {
    // The rebuilt ring is deeper: move everything outside it out to make room.
    const back = front + (plan.rows - 1) * DEFAULT_ROW_PITCH + EDGE;
    const outer = next.sections
      .filter((s) => !made.has(s.id))
      .map((s) => spanOf(path, s, venues))
      .filter((s) => s !== null && s.front > front + EDGE * 2);
    const nearest = outer.length ? Math.min(...outer.map((s) => s!.front - EDGE)) : back;
    const by = back + CONCOURSE - nearest;
    next = pushOut(next, path, front + EDGE * 2, by, made);
    notes.push(`Moved everything outside it ${metres(by)} out to make room.`);
    hits = overlapsWith(next, sections);
  }
  if (hits.length) return fail(`That would overlap ${hits.slice(0, 8).join(", ")}. Give gap_m to move it out, use fewer rows, or remove those sections first.`);

  if (input.stairs ?? hadStairs) {
    const stairs = stairsOnPath(next, path, sections);
    next = { ...next, pois: [...next.pois, ...stairs] };
    notes.push(stairs.length ? `Added ${stairs.length} stairs.` : "No stairs: no aisles between these sections.");
  }

  const counts = sections.map(sectionSeatCount);
  const seats = counts.reduce((a, b) => a + b, 0);
  const label = mode === "stand" ? name : `Ring ${ringNo}${input.replace !== undefined ? " rebuilt" : ""}`;
  let note = `${label}: sections ${sections[0].code}–${sections[sections.length - 1].code}, ${fmt(seats)} seats, ${plan.rows} rows (${metres(plan.rows * DEFAULT_ROW_PITCH)} deep)${mode === "ring" && catLabel ? `, ${catLabel}` : ""}.`;
  if (new Set(counts).size > 1) note += ` Seats per section: ${counts.join(", ")}.`;
  if (notes.length) note += ` ${notes.join(" ")}`;
  return { ok: true, doc: next, note };
}

function nearestSection(doc: SeatMapDoc, p: { x: number; y: number }): SeatMapSection | null {
  let best: SeatMapSection | null = null;
  let bestD = Infinity;
  for (const s of doc.sections) {
    if (s.points.length < 3) continue;
    const d = distanceToOutline(p.x, p.y, s.points);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/* ---------- one section on the venue shape ---------- */

export type SectionInput = {
  seats: number;
  rows?: number;
  /** Rim the section takes, outline included. */
  width?: number;
  bearing?: number;
  side?: Side;
  /** Same tier, beside this section. */
  nextTo?: string;
  direction?: "clockwise" | "anticlockwise";
  /** A tier further out, behind this section. */
  behind?: string;
  gap?: number;
  aisle?: number;
  code?: string;
  category?: string;
  name?: string;
};

/** One section placed by where it goes, with exactly `seats` spread evenly over its rows. */
export function addSection(source: SeatMapDoc, input: SectionInput): BuildResult {
  const seats = Math.round(input.seats);
  if (!(seats >= 1 && seats <= MAX_ROWS_PER_SECTION * MAX_SEATS_PER_ROW)) return fail("Seats must be at least 1.");
  const bowl = ensureBowl(source);
  const doc = bowl.doc;
  const path = bowl.path;
  const venues = venuesOf(doc);
  const aisle = Math.max(4, Math.min(60, input.aisle ?? AISLE));
  const findCode = (code: string) => doc.sections.find((s) => s.code === code.trim().toUpperCase());

  let rows = input.rows !== undefined ? Math.round(input.rows) : undefined;
  if (rows !== undefined && !(rows >= 1 && rows <= MAX_TIER_ROWS)) return fail(`Rows must be 1–${MAX_TIER_ROWS}.`);
  let front: number;
  let mid: number;
  let perRowMax: number | undefined = input.width !== undefined ? seatsInFrontage(input.width) : undefined;
  let codeHint: CodeHint = null;

  const ref = input.nextTo ?? input.behind;
  if (ref) {
    const base = findCode(ref);
    if (!base) return fail(`No section ${ref}.`);
    const span = spanOf(path, base, venues);
    if (!span) return fail(`Section ${base.code} has no seats to line up with.`);
    const ring = ringOf(base.code);
    const letters = /^[A-Z]+/.exec(base.code)?.[0];
    codeHint = ring !== null ? { ring: input.nextTo ? ring : ring + 1 } : letters ? { prefix: letters } : null;
    if (input.nextTo) {
      front = span.front;
      rows ??= base.rows.length || undefined;
      // Frontage is only known once rows are; solve below, then place beside the neighbour.
      const solved = solve(seats, rows, perRowMax);
      if (typeof solved === "string") return fail(solved);
      const width = frontageFor(Math.max(...solved));
      mid = input.direction === "anticlockwise" ? span.t0 - EDGE - aisle - width / 2 : span.t1 + EDGE + aisle + width / 2;
      return placeOne(doc, path, { ...input, seats }, front, mid, solved, codeHint, bowl.created);
    }
    front = frontAfter(span.back + EDGE, input.gap ?? CONCOURSE);
    const centre = path.at((span.t0 + span.t1) / 2, span.front);
    mid = path.project(centre.x, centre.y, front);
    perRowMax ??= seatsInFrontage(span.t1 - span.t0 + EDGE * 2);
  } else {
    const bearing = input.bearing ?? SIDE_BEARING[input.side ?? "north"];
    const reach = reachBetween(doc, path, bearing - 12, bearing + 12);
    front = frontAfter(reach, input.gap ?? (reach > path.rim + 1 ? CONCOURSE : FIRST_GAP));
    mid = path.atBearing(bearing, front);
    if (ringNumbers(doc).length) {
      const level = doc.sections.find((s) => ringOf(s.code) !== null && Math.abs((spanOf(path, s, venues)?.front ?? -1e9) - front) < 15);
      codeHint = { ring: level ? ringOf(level.code)! : nextRing(doc) };
    }
  }
  const solved = solve(seats, rows, perRowMax);
  if (typeof solved === "string") return fail(solved);
  return placeOne(doc, path, { ...input, seats }, front, mid, solved, codeHint, bowl.created);
}

/** Even rows for `seats`: from a fixed row count, a row width, or a sensible default shape. */
function solve(seats: number, rows: number | undefined, perRowMax: number | undefined): number[] | string {
  let n = rows;
  if (n === undefined) n = perRowMax ? Math.ceil(seats / perRowMax) : Math.max(1, Math.min(40, Math.round(Math.sqrt(seats / 2.5))));
  if (n > MAX_TIER_ROWS) return `That needs ${n} rows; give a wider section (width_m) or fewer seats.`;
  if (seats < n) return `${seats} seats cannot fill ${n} rows.`;
  const perRow = evenRows(seats, n);
  const widest = perRow[perRow.length - 1];
  if (perRowMax !== undefined && widest > perRowMax) return `${seats} seats in ${n} rows need ${widest} per row, but only ${perRowMax} fit. Leave rows out or widen the section.`;
  if (widest > MAX_SEATS_PER_ROW) return `${widest} seats in a row is over the ${MAX_SEATS_PER_ROW} limit; add rows.`;
  return perRow;
}

/** Which numbering a single section joins: a ring's hundred, or a stand's letter prefix. */
type CodeHint = { ring: number } | { prefix: string } | null;

function placeOne(doc: SeatMapDoc, path: VenuePath, input: SectionInput, front: number, mid: number, perRow: number[], codeHint: CodeHint, created: boolean): BuildResult {
  let code = input.code?.trim().toUpperCase();
  if (code && !/^[A-Z0-9][A-Z0-9-]{0,11}$/.test(code)) return fail("Codes use 1–12 capital letters, digits or dashes.");
  if (code && doc.sections.some((s) => s.code === code)) return fail(`Section ${code} already exists.`);
  if (!code && codeHint && "prefix" in codeHint) code = freeCode(doc, codeHint.prefix, new Set());
  if (!code && codeHint && "ring" in codeHint) {
    const base = codeHint.ring * 100;
    for (let n = base + 1; n < base + 100; n++) if (!doc.sections.some((s) => s.code === String(n))) {
      code = String(n);
      break;
    }
  }
  code ??= nextSectionCode(doc);
  const ring = ringOf(code);
  const cat = resolveCategory(doc, input.category, ring ? defaultCategory(doc, ring) : (doc.categories[0]?.id ?? null));
  if ("error" in cat) return fail(cat.error);
  const name = input.name?.trim() || doc.categories.find((c) => c.id === cat.id)?.label || "Section";
  const section = blockOnPath(doc, path, { code, name: `${name} ${code}`, categoryId: cat.id, mid, front, perRow });
  const next = { ...doc, sections: [...doc.sections, section] };
  const hits = overlapsWith(next, [section]);
  if (hits.length) return fail(`Section ${code} would overlap ${hits.join(", ")}. Try direction, gap_m, fewer rows, or another place.`);
  const where = path.bearing(section.rows[0].x, section.rows[0].y);
  let note = `Section ${code}: ${fmt(sectionSeatCount(section))} seats in ${perRow.length} rows of ${perRow[0]}${perRow[perRow.length - 1] !== perRow[0] ? `–${perRow[perRow.length - 1]}` : ""}, ${bearingWord(where)} side.`;
  if (created) note += " Added a venue shape around the field; the seating follows it.";
  return { ok: true, doc: next, note };
}

/* ---------- stairs ---------- */

/** Stairs in every aisle between neighbouring sections of the selection, from front row to back row. */
export function addStairs(doc: SeatMapDoc, target: Target): BuildResult {
  const picked = selectSections(doc, target);
  if ("error" in picked) return fail(picked.error);
  const seated = picked.sections.filter((s) => s.display === "seats" && s.rows.length);
  if (seated.length < 2) return fail("Stairs go between sections; pick at least two neighbouring sections with seats.");
  const stairs = mainVenue(doc) ? stairsOnPath(doc, pathFor(doc), seated) : straightStairs(doc, seated);
  if (!stairs.length) return fail("Found no aisles needing stairs (they may already have them).");
  return { ok: true, doc: { ...doc, pois: [...doc.pois, ...stairs] }, note: `Added ${stairs.length} stairs.` };
}

/** Stairs between neighbouring blocks that are not on a venue shape (floor seating, drawn stands). */
function straightStairs(doc: SeatMapDoc, sections: SeatMapSection[]): SeatMapPoi[] {
  const f = venueFrame(doc);
  const venues = venuesOf(doc);
  type Ends = { front: [Point, Point]; back: [Point, Point]; bearing: number };
  const ends: Ends[] = [];
  for (const s of sections) {
    const seats = seatsOfSection(s, venues);
    if (!seats.length) continue;
    const byRow = new Map<string, { x: number; y: number }[]>();
    for (const seat of seats) byRow.set(seat.row, [...(byRow.get(seat.row) ?? []), seat]);
    let front: { d: number; ends: [Point, Point] } | null = null;
    let back: { d: number; ends: [Point, Point] } | null = null;
    let sx = 0;
    let sy = 0;
    for (const list of byRow.values()) {
      const mx = list.reduce((a, p) => a + p.x, 0) / list.length;
      const my = list.reduce((a, p) => a + p.y, 0) / list.length;
      sx += mx;
      sy += my;
      const d = Math.hypot(mx - f.cx, my - f.cy);
      const e: [Point, Point] = [
        [list[0].x, list[0].y],
        [list[list.length - 1].x, list[list.length - 1].y],
      ];
      if (!front || d < front.d) front = { d, ends: e };
      if (!back || d > back.d) back = { d, ends: e };
    }
    ends.push({ front: front!.ends, back: back!.ends, bearing: bearingOf(f, sx / byRow.size, sy / byRow.size) });
  }
  ends.sort((a, b) => a.bearing - b.bearing);
  const closest = (a: [Point, Point], b: [Point, Point]) => {
    let best = { mid: [0, 0] as Point, gap: Infinity };
    for (const p of a)
      for (const q of b) {
        const gap = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (gap < best.gap) best = { mid: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], gap };
      }
    return best;
  };
  const existing = doc.pois.filter((p) => p.kind === "stairs");
  const out: SeatMapPoi[] = [];
  for (let i = 0; i < ends.length; i++) {
    const a = ends[i];
    const b = ends[(i + 1) % ends.length];
    const front = closest(a.front, b.front);
    const back = closest(a.back, b.back);
    if (front.gap > 60 || front.gap < SEAT_RADIUS * 2 + 4) continue;
    const dx = back.mid[0] - front.mid[0];
    const dy = back.mid[1] - front.mid[1];
    const len = Math.hypot(dx, dy);
    const x = (front.mid[0] + back.mid[0]) / 2;
    const y = (front.mid[1] + back.mid[1]) / 2;
    const w = Math.max(6, Math.min(16, Math.min(front.gap, back.gap) - SEAT_RADIUS * 2 - 1));
    if ([...existing, ...out].some((p) => Math.hypot(p.x - x, p.y - y) < w)) continue;
    out.push({
      id: newId("p"),
      kind: "stairs",
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      label: "",
      w: Math.round(w * 100) / 100,
      h: Math.round((len + DEFAULT_ROW_PITCH) * 100) / 100,
      rotation: Math.round(normalizeAngle(toDeg(Math.atan2(len > 1 ? dx / len : 0, len > 1 ? -dy / len : 1))) * 100) / 100,
    });
  }
  return out;
}

/* ---------- straight blocks: floor and free blocks ---------- */

type BlockInput = {
  cx: number;
  cy: number;
  /** Degrees. 0 faces down the map (front row at the bottom). */
  facing: number;
  perRow: number[];
  code: string;
  name: string;
  categoryId: string | null;
  doc: SeatMapDoc;
};

function straightBlock(b: BlockInput): SeatMapSection {
  const rowsN = b.perRow.length;
  const widest = Math.max(...b.perRow);
  const w = (widest - 1) * DEFAULT_SEAT_PITCH + SEAT_RADIUS * 2 + 6;
  const h = (rowsN - 1) * DEFAULT_ROW_PITCH + SEAT_RADIUS * 2 + 6;
  const rot = normalizeAngle(b.facing);
  const labels = rowLabels(b.doc.numbering, rowsN);
  const defaults = seatDefaults(b.doc.numbering);
  const c = Math.cos(toRad(rot));
  const s = Math.sin(toRad(rot));
  const rows = b.perRow.map((seats, i) => {
    const ly = ((rowsN - 1) / 2 - i) * DEFAULT_ROW_PITCH;
    return makeRow({
      ...defaults,
      label: labels[i],
      seats: Math.min(MAX_SEATS_PER_ROW, seats),
      x: Math.round((b.cx - ly * s) * 100) / 100,
      y: Math.round((b.cy + ly * c) * 100) / 100,
      rotation: rot,
      pitch: DEFAULT_SEAT_PITCH,
    });
  });
  const points = boxCorners(b.cx, b.cy, w, h, rot).map(round2);
  return sectionShell(b.code, `${b.name} ${b.code}`, b.categoryId, points, rows);
}

/** Rows of a block holding `target` seats, at most `maxPerRow` wide. */
function blockRows(target: number, maxPerRow: number, rows?: number): number[] | string {
  if (maxPerRow < 1) return "There is no room for a seat.";
  const rowsN = rows ?? Math.ceil(target / maxPerRow);
  if (rowsN > MAX_ROWS_PER_SECTION) return `That needs ${rowsN} rows; the limit is ${MAX_ROWS_PER_SECTION}.`;
  if (target / rowsN > maxPerRow) return `Only ${maxPerRow * rowsN} seats fit in ${rowsN} rows here.`;
  return evenRows(target, rowsN);
}

export type FloorInput = {
  seats: number;
  blocks?: number;
  aisle?: number;
  margin?: number;
  category?: string;
  name?: string;
};

/** Floor seating on the field, split into a grid of blocks facing the stage (or the top of the map). */
export function addFloor(doc: SeatMapDoc, input: FloorInput): BuildResult {
  const f = venueFrame(doc);
  const field = doc.decorations.find((d) => d.kind === "field");
  const stage = doc.decorations.find((d) => d.kind === "stage");
  const margin = input.margin ?? 30;
  let area = field ? { x: field.x, y: field.y, w: field.w, h: field.h } : { x: f.cx, y: f.cy, w: f.a * 2, h: f.b * 2 };
  let facing = 180;
  if (stage && field) {
    // Leave the stage end clear and face it.
    const dx = stage.x - field.x;
    const dy = stage.y - field.y;
    facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 270 : 90) : dy > 0 ? 0 : 180;
    const clear = 40;
    if (Math.abs(dx) > Math.abs(dy)) {
      const edge = dx > 0 ? Math.min(field.x + field.w / 2, stage.x - stage.w / 2 - clear) : Math.max(field.x - field.w / 2, stage.x + stage.w / 2 + clear);
      const lo = dx > 0 ? field.x - field.w / 2 : edge;
      const hi = dx > 0 ? edge : field.x + field.w / 2;
      area = { x: (lo + hi) / 2, y: field.y, w: hi - lo, h: field.h };
    } else {
      const edge = dy > 0 ? Math.min(field.y + field.h / 2, stage.y - stage.h / 2 - clear) : Math.max(field.y - field.h / 2, stage.y + stage.h / 2 + clear);
      const lo = dy > 0 ? field.y - field.h / 2 : edge;
      const hi = dy > 0 ? edge : field.y + field.h / 2;
      area = { x: field.x, y: (lo + hi) / 2, w: field.w, h: hi - lo };
    }
  }
  const w = area.w - margin * 2;
  const h = area.h - margin * 2;
  if (w < 20 || h < 20) return fail("The field is too small for floor seating.");
  const blocks = Math.max(1, Math.min(60, Math.round(input.blocks ?? Math.max(1, Math.round(input.seats / 600)))));
  const aisle = input.aisle ?? 20;
  const sideways = facing === 90 || facing === 270;
  const across = sideways ? h : w;
  const deep = sideways ? w : h;
  let cols = Math.max(1, Math.round(Math.sqrt((blocks * across) / deep)));
  cols = Math.min(blocks, cols);
  const rowsOfBlocks = Math.ceil(blocks / cols);
  const cellW = (across - aisle * (cols - 1)) / cols;
  const cellH = (deep - aisle * (rowsOfBlocks - 1)) / rowsOfBlocks;
  const maxPerRow = Math.min(MAX_SEATS_PER_ROW, Math.floor((cellW - SEAT_RADIUS * 2 - 6) / DEFAULT_SEAT_PITCH) + 1);
  const maxRows = Math.floor((cellH - SEAT_RADIUS * 2 - 6) / DEFAULT_ROW_PITCH) + 1;
  const targets = shareOut(Math.round(input.seats), Array(blocks).fill(1));
  if (Math.max(...targets) > maxPerRow * maxRows) return fail(`Only about ${fmt(maxPerRow * maxRows * blocks)} seats fit on the floor in ${blocks} blocks.`);
  const cat = resolveCategory(doc, input.category, doc.categories[0]?.id ?? null);
  if ("error" in cat) return fail(cat.error);
  const name = input.name?.trim() || "Floor";
  const taken = new Set<string>();
  const sections: SeatMapSection[] = [];
  for (let k = 0; k < blocks; k++) {
    const col = k % cols;
    const line = Math.floor(k / cols);
    const plan = blockRows(targets[k], maxPerRow);
    if (typeof plan === "string") return fail(plan);
    // u runs along the rows, v away from what the seats face (the first line of blocks is nearest).
    const u = -across / 2 + cellW / 2 + col * (cellW + aisle);
    const v = -deep / 2 + cellH / 2 + line * (cellH + aisle);
    const rot = toRad(facing);
    const wx = area.x + Math.cos(rot) * u + Math.sin(rot) * v;
    const wy = area.y + Math.sin(rot) * u - Math.cos(rot) * v;
    sections.push(straightBlock({ cx: wx, cy: wy, facing, perRow: plan, code: freeCode(doc, "F", taken), name, categoryId: cat.id, doc }));
  }
  const next: SeatMapDoc = { ...doc, sections: [...doc.sections, ...sections] };
  const seats = sections.reduce((a, s) => a + sectionSeatCount(s), 0);
  return { ok: true, doc: next, note: `${name}: ${blocks} blocks ${sections[0].code}–${sections[sections.length - 1].code}, ${fmt(seats)} seats.` };
}

export type BlockFreeInput = {
  x: number;
  y: number;
  facing: number;
  rows: number;
  perRow: number;
  seats?: number;
  code?: string;
  category?: string;
  name?: string;
};

export function addBlock(doc: SeatMapDoc, input: BlockFreeInput): BuildResult {
  const rows = Math.round(input.rows);
  const perRow = Math.round(input.perRow);
  if (!(rows >= 1 && rows <= MAX_ROWS_PER_SECTION)) return fail(`Rows must be 1–${MAX_ROWS_PER_SECTION}.`);
  if (!(perRow >= 1 && perRow <= MAX_SEATS_PER_ROW)) return fail(`Seats per row must be 1–${MAX_SEATS_PER_ROW}.`);
  let plan = Array(rows).fill(perRow) as number[];
  if (input.seats !== undefined) {
    if (input.seats > rows * perRow) return fail(`${rows} rows of ${perRow} hold ${rows * perRow} seats.`);
    if (input.seats < rows) return fail(`${input.seats} seats cannot fill ${rows} rows.`);
    plan = evenRows(Math.round(input.seats), rows);
  }
  const code = input.code?.trim().toUpperCase();
  if (code && !/^[A-Z0-9][A-Z0-9-]{0,11}$/.test(code)) return fail("Codes use 1–12 capital letters, digits or dashes.");
  if (code && doc.sections.some((s) => s.code === code)) return fail(`Section ${code} already exists.`);
  const cat = resolveCategory(doc, input.category, doc.categories[0]?.id ?? null);
  if ("error" in cat) return fail(cat.error);
  const f = venueFrame(doc);
  const section = straightBlock({
    cx: f.cx + input.x,
    cy: f.cy + input.y,
    facing: input.facing,
    perRow: plan,
    code: code ?? freeCode(doc, "B", new Set()),
    name: input.name?.trim() || "Block",
    categoryId: cat.id,
    doc,
  });
  const next = { ...doc, sections: [...doc.sections, section] };
  const hits = overlapsWith(next, [section]);
  if (hits.length) return fail(`Block ${section.code} would overlap ${hits.join(", ")}. Move it.`);
  return { ok: true, doc: next, note: `Block ${section.code}: ${sectionSeatCount(section)} seats in ${rows} rows.` };
}

/* ---------- field, venue shape and shapes ---------- */

export const FIELD_PRESETS = {
  football: { w: 1050, h: 680, label: "" },
  rugby: { w: 1000, h: 700, label: "" },
  american_football: { w: 1100, h: 490, label: "" },
  athletics: { w: 1760, h: 920, label: "" },
  ice_hockey: { w: 600, h: 300, label: "" },
  handball: { w: 400, h: 200, label: "" },
  basketball: { w: 280, h: 150, label: "" },
  tennis: { w: 240, h: 110, label: "" },
  concert_floor: { w: 600, h: 400, label: "" },
} as const;
export type FieldKind = keyof typeof FIELD_PRESETS;

export type FieldInput = { kind: FieldKind | "none"; length?: number; width?: number; bowl?: BowlShape; apron?: number };

/**
 * Sets the field and the venue shape around it that seating follows. The venue
 * shape is only redrawn while no seating stands on it.
 */
export function setField(doc: SeatMapDoc, input: FieldInput): BuildResult {
  const rest = doc.decorations.filter((d) => d.kind !== "field");
  if (input.kind === "none") return { ok: true, doc: { ...doc, decorations: rest }, note: "Removed the field." };
  const preset = FIELD_PRESETS[input.kind];
  const old = doc.decorations.find((d) => d.kind === "field");
  const w = input.length ?? preset.w;
  const h = input.width ?? preset.h;
  if (!(w >= 50 && h >= 50 && w <= 5000 && h <= 5000)) return fail("Field sides must be 5–500 m.");
  const kind = input.kind;
  const field: SeatMapDecoration = {
    id: old?.id ?? newId("d"),
    kind: "field",
    x: old?.x ?? 0,
    y: old?.y ?? 0,
    w,
    h,
    rotation: 0,
    label: preset.label,
    color: kind === "ice_hockey" ? "#dbeafe" : kind === "basketball" || kind === "handball" || kind === "tennis" ? "#e7c08f" : kind === "concert_floor" ? "#d4d4d4" : "#7cb36b",
    radius: kind === "ice_hockey" ? 85 : 0,
  };
  let next: SeatMapDoc = { ...doc, decorations: [field, ...rest] };
  let note = `Field set to ${kind.replace("_", " ")}, ${w / 10} × ${h / 10} m.`;
  const venue = mainVenue(next);
  const seated = venue ? next.sections.some((s) => s.follow !== "off") : false;
  if (!venue || (!seated && (input.bowl || input.apron !== undefined || old?.w !== w || old?.h !== h))) {
    const shaped = venueAround(next, input.bowl ?? "rounded", input.apron ?? 70);
    const decorations = venue ? next.decorations.map((d) => (d.id === venue.id ? { ...shaped, id: venue.id } : d)) : [...next.decorations, shaped];
    next = { ...next, decorations };
    note += ` Venue shape ${shaped.w / 10} × ${shaped.h / 10} m (${input.bowl ?? "rounded"}) around it; seating follows it.`;
  } else if (seated && (input.bowl || old?.w !== w || old?.h !== h)) {
    note += " The venue shape has seating on it and was kept; clear the map to change the bowl.";
  }
  return { ok: true, doc: next, note };
}

export type ShapeKind = "stage" | "rect" | "ellipse" | "wall" | "column" | "text" | "venue";
export type Anchor = "center" | "north" | "south" | "east" | "west";

export type ShapeInput = { kind: ShapeKind; w: number; h: number; x?: number; y?: number; anchor?: Anchor; rotation?: number; label?: string };

export function addShape(doc: SeatMapDoc, input: ShapeInput): BuildResult {
  const f = venueFrame(doc);
  let x = f.cx + (input.x ?? 0);
  let y = f.cy + (input.y ?? 0);
  if (input.anchor && input.x === undefined && input.y === undefined) {
    // Sits just inside the field edge on that side.
    if (input.anchor === "north") y = f.cy - f.b + input.h / 2 + 10;
    if (input.anchor === "south") y = f.cy + f.b - input.h / 2 - 10;
    if (input.anchor === "east") x = f.cx + f.a - input.w / 2 - 10;
    if (input.anchor === "west") x = f.cx - f.a + input.w / 2 + 10;
  }
  const color = { stage: "#737373", rect: "#86efac", ellipse: "#86efac", wall: "#d4d4d4", column: "#d4d4d4", text: "#404040", venue: "#f0a77a" }[input.kind];
  const label = input.label ?? (input.kind === "stage" ? "Stage" : input.kind === "text" ? "Label" : "");
  const d: SeatMapDecoration = {
    id: newId("d"),
    kind: input.kind,
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
    w: Math.max(1, input.w),
    h: Math.max(1, input.h),
    rotation: input.rotation ?? 0,
    label: label.slice(0, 60),
    color,
    radius: input.kind === "venue" ? Math.min(input.w, input.h) / 4 : 0,
  };
  return { ok: true, doc: { ...doc, decorations: [...doc.decorations, d] }, note: `Added ${input.kind}${label ? ` "${label}"` : ""}.` };
}

/* ---------- points: entrances, exits, kitchens… ---------- */

export type PointsInput = {
  kind: Exclude<PoiKind, "stairs">;
  count?: number;
  bearings?: number[];
  startBearing?: number;
  /** Concourse just behind this ring. Default: outside everything. */
  ring?: number;
  labels?: string[];
};

export function addPoints(doc: SeatMapDoc, input: PointsInput): BuildResult {
  const path = pathFor(doc);
  const venues = venuesOf(doc);
  const count = Math.max(1, Math.min(48, Math.round(input.count ?? 4)));
  const bearings = input.bearings?.length ? input.bearings.slice(0, 48) : Array.from({ length: count }, (_, i) => (input.startBearing ?? 0) + (360 / count) * i);
  let d: number;
  if (input.ring !== undefined) {
    const secs = ringSections(doc, input.ring);
    if (!secs.length) return fail(`No ring ${input.ring}.`);
    const backs = secs.map((s) => spanOf(path, s, venues)?.back ?? 0);
    d = Math.max(...backs) + EDGE + CONCOURSE / 2;
  } else {
    d = reachBetween(doc, path, 0, 360) + 30;
  }
  const gate = input.kind === "entrance" || input.kind === "exit";
  const used = new Set(doc.pois.map((p) => p.label));
  const nextLetter = () => {
    for (let i = 0; i < 26 * 27; i++) {
      const l = i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + Math.floor(i / 26) - 1)}${String.fromCharCode(65 + (i % 26))}`;
      if (!used.has(l)) {
        used.add(l);
        return l;
      }
    }
    return "";
  };
  const word = { kitchen: "Kitchen", pickup: "Pickup", entrance: "", exit: "" }[input.kind];
  let k = doc.pois.filter((p) => p.kind === input.kind).length;
  const pois = bearings.map((bearing, i) => {
    const p = path.at(path.atBearing(bearing, d), d);
    const out = toDeg(Math.atan2(p.nx, -p.ny));
    const label = (input.labels?.[i] ?? (gate ? nextLetter() : `${word} ${++k}`)).slice(0, 40);
    return {
      id: newId("p"),
      kind: input.kind,
      x: Math.round(p.x * 100) / 100,
      y: Math.round(p.y * 100) / 100,
      label,
      w: gate ? 36 : 0,
      h: gate ? 42 : 0,
      // Entrances point in toward the seats, exits point out.
      rotation: gate ? normalizeAngle(input.kind === "entrance" ? out + 180 : out) : 0,
    } satisfies SeatMapPoi;
  });
  return { ok: true, doc: { ...doc, pois: [...doc.pois, ...pois] }, note: `Added ${pois.length} ${input.kind}${pois.length === 1 ? "" : "s"}: ${pois.map((p) => p.label).join(", ")}.` };
}

/* ---------- edits ---------- */

export type SectionChanges = { category?: string; name?: string; seats?: number; seatsDelta?: number; rows?: number; entrance?: string };

/**
 * Re-lays a following section with `want` seats spread evenly over its rows.
 * The frontage stays; more seats than fit add rows at the back.
 */
function reflow(doc: SeatMapDoc, path: VenuePath, s: SeatMapSection, want: number, rows: number | undefined): SeatMapSection | string {
  const lines = s.rows.filter((r) => r.layout === "line");
  if (!lines.length) return `${s.code} has no rows to re-lay`;
  const front = lines.reduce((best, r) => (path.distance(r.x, r.y) < path.distance(best.x, best.y) ? r : best));
  const perRowMax = Math.max(...lines.map((r) => r.seats));
  let n = rows ?? (want <= lines.length * perRowMax ? lines.length : Math.ceil(want / perRowMax));
  if (want < n) n = want;
  if (n > MAX_TIER_ROWS) return `${s.code} would need ${n} rows`;
  const perRow = evenRows(want, n);
  if (perRow[perRow.length - 1] > perRowMax) return `${s.code}: ${want} seats in ${n} rows need ${perRow[perRow.length - 1]} per row, only ${perRowMax} fit; leave rows out`;
  const ux = Math.cos(toRad(front.rotation));
  const uy = Math.sin(toRad(front.rotation));
  const draft: SeatMapSection = { ...s, rows: [] };
  const built: SeatMapRow[] = [];
  for (let k = 0; k < n; k++) {
    const label = lines[k]?.label ?? nextRowLabel({ ...draft, rows: built }, doc.numbering);
    built.push(
      makeRow({
        start: front.start,
        step: front.step,
        reverse: front.reverse,
        pitch: front.pitch,
        label,
        seats: perRow[k],
        x: Math.round((front.x - uy * k * DEFAULT_ROW_PITCH) * 100) / 100,
        y: Math.round((front.y + ux * k * DEFAULT_ROW_PITCH) * 100) / 100,
        rotation: front.rotation,
        id: lines[k]?.id ?? newId("r"),
      }),
    );
  }
  return withOutline(doc, { ...s, rows: built });
}

export function updateSections(doc: SeatMapDoc, target: Target, set: SectionChanges): BuildResult {
  const picked = selectSections(doc, target);
  if ("error" in picked) return fail(picked.error);
  let catId: string | null | undefined;
  if (set.category !== undefined) {
    const cat = findCategory(doc, set.category);
    if (!cat) return fail(`No category "${set.category}". Use set_category to create it.`);
    catId = cat.id;
  }
  const path = mainVenue(doc) ? pathFor(doc) : null;
  const ids = new Set(picked.sections.map((s) => s.id));
  const problems: string[] = [];
  const changedSeats: SeatMapSection[] = [];
  const sections = doc.sections.map((s) => {
    if (!ids.has(s.id)) return s;
    let next = s;
    if (catId !== undefined) next = { ...next, categoryId: catId };
    if (set.name) next = { ...next, name: `${set.name.trim()} ${s.code}`.slice(0, 60) };
    if (set.entrance !== undefined) next = { ...next, entrance: set.entrance.slice(0, 40) };
    const seatEdit = set.seats !== undefined || set.seatsDelta !== undefined || set.rows !== undefined;
    if (seatEdit && next.display === "seats" && next.rows.length) {
      const now = sectionSeatCount(next);
      const want = Math.round(set.seats ?? now + (set.seatsDelta ?? 0));
      if (want < 1) problems.push(`${s.code} needs at least 1 seat`);
      else if (next.follow !== "off" && path) {
        const re = reflow(doc, path, next, want, set.rows);
        if (typeof re === "string") problems.push(re);
        else {
          next = re;
          changedSeats.push(re);
        }
      } else if (set.rows !== undefined) problems.push(`${s.code} is not on the venue shape, so its rows can't be re-laid; change seats only`);
      else if (want < next.rows.length) problems.push(`${s.code} needs at least ${next.rows.length} seats`);
      else if (want <= now) next = { ...next, rows: trimRows(next.rows.map((r) => ({ ...r, removed: [], numbers: [] })), want) };
      else if (want > now * 1.08 + 2) problems.push(`${s.code} can grow at most 8% (to ${Math.floor(now * 1.08 + 2)}) because it is drawn by hand`);
      else {
        const counts = shareOut(want, next.rows.map((r) => r.seats));
        next = { ...next, rows: next.rows.map((r, i) => resizeArc({ ...r, removed: [], numbers: [] }, counts[i])) };
      }
    }
    return next;
  });
  const next = { ...doc, sections };
  if (changedSeats.length) {
    const hits = overlapsWith(next, changedSeats);
    if (hits.length) return fail(`More rows would run into ${hits.slice(0, 8).join(", ")}. Rebuild the ring with add_ring replace_ring (it moves outer tiers out), or move those sections first.`);
  }
  const total = picked.sections.length;
  const note = `Updated ${total} section${total === 1 ? "" : "s"} (${codeRange(picked.sections.map((s) => s.code))}).${problems.length ? ` Skipped: ${problems.slice(0, 6).join("; ")}.` : ""}`;
  return { ok: true, doc: next, note };
}

export type MoveInput = { dx?: number; dy?: number; turn?: number; along?: number; out?: number };

/** Slides sections along the venue shape and/or away from the field; plain x/y and turns for the rest. */
export function moveSections(doc: SeatMapDoc, target: Target, move: MoveInput): BuildResult {
  const picked = selectSections(doc, target);
  if ("error" in picked) return fail(picked.error);
  const ids = new Set(picked.sections.map((s) => s.id));
  const f = venueFrame(doc);
  const path = pathFor(doc);
  const moved: SeatMapSection[] = [];
  const sections = doc.sections.map((s) => {
    if (!ids.has(s.id)) return s;
    let next = s;
    if (move.along || move.out) {
      if (s.follow !== "off" && mainVenue(doc)) next = shiftOnPath(doc, path, next, move.along ?? 0, move.out ?? 0);
      else {
        const c = boundsOf(s.points);
        const p = path.at(path.project((c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2, path.rim), path.rim);
        next = moveSection(next, translation(p.tx * (move.along ?? 0) + p.nx * (move.out ?? 0), p.ty * (move.along ?? 0) + p.ny * (move.out ?? 0)));
      }
    }
    if (move.turn) next = moveSection(next, rotationAbout(move.turn, f.cx, f.cy));
    if (move.dx || move.dy) next = moveSection(next, translation(move.dx ?? 0, move.dy ?? 0));
    if (next !== s) moved.push(next);
    return next;
  });
  const next = { ...doc, sections };
  const hits = overlapsWith(next, moved);
  if (hits.length) return fail(`That would overlap ${hits.slice(0, 8).join(", ")}. Move less, or move those first.`);
  return { ok: true, doc: next, note: `Moved ${ids.size} section${ids.size === 1 ? "" : "s"}.` };
}

export type RemoveInput = { target?: Target; points?: (PoiKind | "all")[]; shapes?: (SeatMapDecoration["kind"] | "all")[] };

export function removeItems(doc: SeatMapDoc, input: RemoveInput): BuildResult {
  let next = doc;
  const parts: string[] = [];
  if (input.target) {
    const picked = selectSections(doc, input.target);
    if ("error" in picked) return fail(picked.error);
    const ids = new Set(picked.sections.map((s) => s.id));
    next = { ...next, sections: next.sections.filter((s) => !ids.has(s.id)) };
    parts.push(`${ids.size} sections`);
  }
  if (input.points?.length) {
    const all = input.points.includes("all");
    const kinds = new Set(input.points);
    const kept = next.pois.filter((p) => !all && !kinds.has(p.kind));
    parts.push(`${next.pois.length - kept.length} points`);
    next = { ...next, pois: kept };
  }
  if (input.shapes?.length) {
    const all = input.shapes.includes("all");
    const kinds = new Set(input.shapes);
    const kept = next.decorations.filter((d) => !all && !kinds.has(d.kind));
    parts.push(`${next.decorations.length - kept.length} shapes`);
    next = { ...next, decorations: kept };
  }
  if (!parts.length) return fail("Nothing to remove: give target, points or shapes.");
  return { ok: true, doc: next, note: `Removed ${parts.join(", ")}.` };
}

export function clearMap(doc: SeatMapDoc): BuildResult {
  return { ok: true, doc: { ...doc, sections: [], decorations: [], pois: [] }, note: "Cleared the map. Categories and numbering are kept." };
}

export function setCategory(doc: SeatMapDoc, input: { name: string; color?: string; renameTo?: string; assign?: Target }): BuildResult {
  const color = input.color?.toLowerCase();
  if (color && !/^#[0-9a-f]{6}$/.test(color)) return fail("Colours are hex like #4e79a7.");
  let cat = findCategory(doc, input.name);
  let categories = doc.categories;
  let note: string;
  if (cat) {
    const updated = { ...cat, label: (input.renameTo?.trim() || cat.label).slice(0, 40), color: color ?? cat.color };
    categories = categories.map((c) => (c.id === cat!.id ? updated : c));
    cat = updated;
    note = `Updated category ${updated.label}.`;
  } else {
    if (categories.length >= 20) return fail("A map holds at most 20 categories.");
    const label = input.name.trim().slice(0, 40);
    if (!label) return fail("Give the category a name.");
    const usedColors = new Set(categories.map((c) => c.color.toLowerCase()));
    const pick = color ?? CATEGORY_PALETTE.find((c) => !usedColors.has(c)) ?? CATEGORY_PALETTE[categories.length % CATEGORY_PALETTE.length];
    cat = { id: newId("c"), label, color: pick };
    categories = [...categories, cat];
    note = `Created category ${label} (${pick}).`;
  }
  let next = { ...doc, categories };
  if (input.assign) {
    const res = updateSections(next, input.assign, { category: cat.id });
    if (!res.ok) return res;
    next = res.doc;
    note += ` ${res.note}`;
  }
  return { ok: true, doc: next, note };
}

/* ---------- reading ---------- */

function codeRange(codes: string[]): string {
  if (codes.length <= 3) return codes.join(", ");
  return `${codes[0]}–${codes[codes.length - 1]}`;
}

/** A compact, model-friendly description of the map. */
export function describeMap(doc: SeatMapDoc, detail: "summary" | "sections" = "summary", ring?: number): string {
  const f = venueFrame(doc);
  const lines: string[] = [];
  const field = doc.decorations.find((d) => d.kind === "field");
  const stage = doc.decorations.find((d) => d.kind === "stage");
  const venue = mainVenue(doc);
  lines.push(field ? `Field ${field.w / 10} × ${field.h / 10} m at the centre.` : stage ? `No field; stage ${stage.w / 10} × ${stage.h / 10} m.` : "No field yet.");
  lines.push(venue ? `Venue shape ${venue.w / 10} × ${venue.h / 10} m, corner radius ${venue.radius / 10} m: seating follows it.` : "No venue shape yet (building seating adds one around the field).");
  const total = seatCount(doc);
  lines.push(`${fmt(total)} seats in ${doc.sections.length} sections.`);
  const catName = (id: string | null) => doc.categories.find((c) => c.id === id)?.label ?? "none";
  const byCat = new Map<string | null, number>();
  for (const s of doc.sections) byCat.set(s.categoryId, (byCat.get(s.categoryId) ?? 0) + sectionSeatCount(s));
  lines.push(`Categories: ${doc.categories.map((c) => `${c.label} ${c.color} (${fmt(byCat.get(c.id) ?? 0)} seats)`).join("; ") || "none"}.`);

  for (const r of ringNumbers(doc)) {
    if (ring !== undefined && r !== ring) continue;
    const secs = ringSections(doc, r);
    const counts = secs.map(sectionSeatCount);
    const rows = Math.max(...secs.map((s) => s.rows.length));
    const cats = [...new Set(secs.map((s) => catName(s.categoryId)))].join("/");
    lines.push(`Ring ${r}: ${secs.length} section${secs.length === 1 ? "" : "s"} ${codeRange(secs.map((s) => s.code))}, ${fmt(counts.reduce((a, b) => a + b, 0))} seats, ${rows} rows, ${cats}.`);
    if (detail === "sections") lines.push(`  ${secs.map((s, i) => `${s.code}:${counts[i]}${s.categoryId !== secs[0].categoryId ? `(${catName(s.categoryId)})` : ""}`).join(" ")}`);
  }
  const loose = doc.sections.filter((s) => ringOf(s.code) === null).sort(byCode);
  if (loose.length && ring === undefined) {
    const shown = loose.slice(0, detail === "sections" ? 60 : 12);
    lines.push(
      `Other sections: ${shown
        .map((s) => {
          const c = centroidOf(s);
          return `${s.code}(${sectionSeatCount(s)} seats, ${s.display === "seats" ? `${s.rows.length} rows` : s.display}, ${bearingWord(bearingOf(f, c[0], c[1]))})`;
        })
        .join(", ")}${loose.length > shown.length ? `, +${loose.length - shown.length} more` : ""}.`,
    );
  }
  const poiCount = (k: PoiKind) => doc.pois.filter((p) => p.kind === k);
  const pts = (["entrance", "exit", "stairs", "kitchen", "pickup"] as const)
    .map((k) => {
      const list = poiCount(k);
      if (!list.length) return null;
      const labels = k === "entrance" || k === "exit" ? ` (${list.map((p) => p.label).join(",")})` : "";
      return `${list.length} ${k}${labels}`;
    })
    .filter(Boolean);
  if (pts.length) lines.push(`Points: ${pts.join(", ")}.`);
  const shapes = doc.decorations.filter((d) => d.kind !== "field" && d.kind !== "venue");
  if (shapes.length) lines.push(`Shapes: ${shapes.map((d) => d.kind + (d.label ? ` "${d.label}"` : "")).join(", ")}.`);
  const issues = validateSeatMap(doc);
  const errors = issues.filter((i) => i.level === "error");
  if (issues.length) lines.push(`Issues: ${errors.length} errors, ${issues.length - errors.length} warnings${errors.length ? `: ${errors.slice(0, 3).map((i) => i.message).join(" | ")}` : ""}.`);
  return lines.join("\n");
}

function centroidOf(s: SeatMapSection): Point {
  let x = 0;
  let y = 0;
  for (const p of s.points) {
    x += p[0];
    y += p[1];
  }
  return [x / s.points.length, y / s.points.length];
}

function bearingWord(b: number) {
  return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(((normalizeAngle(b) % 360) + 360) % 360 / 45) % 8];
}

export function checkMap(doc: SeatMapDoc): string {
  const issues = validateSeatMap(doc);
  // Overlaps are not a publishing rule, but they are always a mistake in a generated map.
  const overlaps: string[] = [];
  for (let i = 0; i < doc.sections.length && overlaps.length < 6; i++) {
    const s = doc.sections[i];
    if (s.display !== "seats" || s.points.length < 3) continue;
    const hits = overlapsWith({ ...doc, sections: doc.sections.slice(i + 1) }, [s]).filter((c) => c !== s.code);
    if (hits.length) overlaps.push(`${s.code} overlaps ${hits.join(", ")}`);
  }
  const lines = [...issues.slice(0, 10).map((i) => `${i.level}: ${i.message}`), ...overlaps.map((o) => `warning: ${o}`)];
  if (!lines.length) return "No issues.";
  return lines.join("\n").concat(issues.length > 10 ? `\n…and ${issues.length - 10} more.` : "");
}

/** Last line of defence before a change reaches the client. */
export function acceptDoc(next: SeatMapDoc): { ok: true; doc: SeatMapDoc } | { ok: false; error: string } {
  const parsed = seatMapSchema.safeParse(next);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `The result broke a map rule (${issue.path.join(".")}: ${issue.message}). Nothing was changed.` };
  }
  if (seatCount(parsed.data) > MAX_TOTAL_SEATS) return { ok: false, error: `A map holds at most ${fmt(MAX_TOTAL_SEATS)} seats. Nothing was changed.` };
  return { ok: true, doc: parsed.data };
}
