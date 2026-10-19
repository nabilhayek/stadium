import {
  DEFAULT_ROW_PITCH,
  DEFAULT_SEAT_PITCH,
  MAX_ROWS_PER_SECTION,
  MAX_SEATS_PER_ROW,
  SEAT_RADIUS,
  newId,
  type SeatMapDecoration,
  type SeatMapDoc,
  type SeatMapPoi,
  type SeatMapRow,
  type SeatMapSection,
} from "./schema";

export type Point = [number, number];
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const DEG = Math.PI / 180;

export const toRad = (deg: number) => deg * DEG;
export const toDeg = (rad: number) => rad / DEG;

/** Printed number of the seat at position `i` (0 = the row's first end). */
export function seatNumber(row: SeatMapRow, i: number): number {
  return row.reverse ? row.start + (row.seats - 1 - i) : row.start + i;
}

/** Seat id in the shop's format: `formatSeat` in src/lib/seat/store.ts. */
export function seatId(code: string, rowLabel: string, number: number | string): string {
  return `${code}-${rowLabel}-${number}`;
}

/** Positions along the row in seat pitches, including aisle gaps. */
function slots(row: SeatMapRow): number[] {
  const gaps = row.gaps.length ? new Set(row.gaps) : null;
  const out = new Array<number>(row.seats);
  let at = 0;
  for (let i = 0; i < row.seats; i++) {
    if (i > 0) {
      at += 1;
      if (gaps && gaps.has(Math.min(seatNumber(row, i - 1), seatNumber(row, i)))) at += 1;
    }
    out[i] = at;
  }
  return out;
}

/** Length of the row from first to last seat centre. */
export function rowLength(row: SeatMapRow): number {
  const s = slots(row);
  return (s[s.length - 1] ?? 0) * row.pitch;
}

/**
 * Seat centres in world space. Writes into `xs`/`ys` from `offset` when given,
 * so the scene can fill one flat array without allocating per row.
 */
export function placeRow(row: SeatMapRow, xs: Float32Array | number[], ys: Float32Array | number[], offset = 0): number {
  if (row.layout === "ring") return placeRing(row, xs, ys, offset);
  if (row.layout === "sides") return placeSides(row, xs, ys, offset);
  const s = slots(row);
  const length = (s[s.length - 1] ?? 0) * row.pitch;
  const theta = toRad(row.curve);
  const cos = Math.cos(toRad(row.rotation));
  const sin = Math.sin(toRad(row.rotation));
  const straight = Math.abs(theta) < 1e-4 || length === 0;
  const radius = straight ? 0 : length / theta;
  for (let i = 0; i < s.length; i++) {
    const along = s[i] * row.pitch - length / 2;
    let lx = along;
    let ly = 0;
    if (!straight) {
      const phi = along / radius;
      lx = radius * Math.sin(phi);
      ly = -radius * (1 - Math.cos(phi));
    }
    xs[offset + i] = row.x + lx * cos - ly * sin;
    ys[offset + i] = row.y + lx * sin + ly * cos;
  }
  return s.length;
}

/** Chairs on a circle. `pitch` is the radius. Empty `gaps` entries are open spaces, spread around the ring. */
function placeRing(row: SeatMapRow, xs: Float32Array | number[], ys: Float32Array | number[], offset: number): number {
  const open = Math.min(row.gaps.length, 12);
  const slotsN = row.seats + open;
  const skip = new Set<number>();
  for (let i = 0; i < open; i++) skip.add(Math.round(((i + 0.5) * slotsN) / open) % slotsN);
  const radius = row.boxW > 0 ? row.boxW / 2 + SEAT_RADIUS + 2.2 : Math.max(row.pitch, SEAT_RADIUS * 3);
  const rot = toRad(row.rotation) - Math.PI / 2;
  let seat = 0;
  for (let s = 0; s < slotsN && seat < row.seats; s++) {
    if (skip.has(s)) continue;
    const a = rot + (s / slotsN) * Math.PI * 2;
    xs[offset + seat] = row.x + radius * Math.cos(a);
    ys[offset + seat] = row.y + radius * Math.sin(a);
    seat++;
  }
  return seat;
}

/** Chairs along the left and right of a rectangle. The table itself is `boxW` by `boxH`. */
function placeSides(row: SeatMapRow, xs: Float32Array | number[], ys: Float32Array | number[], offset: number): number {
  const left = Math.ceil(row.seats / 2);
  const right = row.seats - left;
  const cos = Math.cos(toRad(row.rotation));
  const sin = Math.sin(toRad(row.rotation));
  const out = row.boxW / 2 + SEAT_RADIUS + 1.6;
  const place = (i: number, n: number, side: number, at: number) => {
    const t = n <= 1 ? 0.5 : i / (n - 1);
    const lx = side * out;
    const ly = -row.boxH / 2 + t * row.boxH;
    xs[offset + at] = row.x + lx * cos - ly * sin;
    ys[offset + at] = row.y + lx * sin + ly * cos;
  };
  for (let i = 0; i < left; i++) place(i, left, -1, i);
  for (let i = 0; i < right; i++) place(i, right, 1, left + i);
  return row.seats;
}

export function seatsOfRow(row: SeatMapRow): { x: number[]; y: number[]; numbers: number[] } {
  const x: number[] = [];
  const y: number[] = [];
  placeRow(row, x, y);
  return { x, y, numbers: x.map((_, i) => seatNumber(row, i)) };
}

export function seatsOfSection(section: SeatMapSection) {
  return section.rows.flatMap((row) => {
    const seats = seatsOfRow(row);
    return seats.numbers.map((n, i) => ({ id: seatId(section.code, row.label, n), row: row.label, number: n, x: seats.x[i], y: seats.y[i] }));
  });
}

export function seatCount(doc: SeatMapDoc): number {
  let n = 0;
  for (const s of doc.sections) for (const r of s.rows) n += r.seats;
  return n;
}

export function sectionSeatCount(section: SeatMapSection): number {
  return section.rows.reduce((n, r) => n + r.seats, 0);
}

/* ---------- polygons ---------- */

export function boundsOf(points: readonly (readonly [number, number])[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function unionBounds(a: Bounds | null, b: Bounds): Bounds {
  if (!a) return { ...b };
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/** Area centroid; falls back to the vertex average for degenerate shapes. */
export function centroid(points: readonly (readonly [number, number])[]): Point {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [x0, y0] = points[j];
    const [x1, y1] = points[i];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(area) < 1e-6) {
    const n = points.length || 1;
    return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * area), cy / (3 * area)];
}

export function pointInPolygon(x: number, y: number, points: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from a point to the polygon outline. */
export function distanceToOutline(x: number, y: number, points: readonly (readonly [number, number])[]): number {
  let best = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    best = Math.min(best, distanceToSegment(x, y, points[j][0], points[j][1], points[i][0], points[i][1]));
  }
  return best;
}

export function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function labelPosition(section: SeatMapSection): Point {
  const [cx, cy] = centroid(section.points);
  return [cx + section.label.dx, cy + section.label.dy];
}

/* ---------- rigid transforms ---------- */

/** Rotation by `angle` degrees about (px, py), then translation by (dx, dy). */
export type Rigid = { angle: number; px: number; py: number; dx: number; dy: number };

export const translation = (dx: number, dy: number): Rigid => ({ angle: 0, px: 0, py: 0, dx, dy });
export const rotation = (angle: number, px: number, py: number): Rigid => ({ angle, px, py, dx: 0, dy: 0 });

export function applyRigid(t: Rigid, x: number, y: number): Point {
  if (!t.angle) return [x + t.dx, y + t.dy];
  const c = Math.cos(toRad(t.angle));
  const s = Math.sin(toRad(t.angle));
  const rx = x - t.px;
  const ry = y - t.py;
  return [t.px + rx * c - ry * s + t.dx, t.py + rx * s + ry * c + t.dy];
}

/** The same transform as a canvas matrix [a, b, c, d, e, f]. */
export function rigidMatrix(t: Rigid): [number, number, number, number, number, number] {
  const c = Math.cos(toRad(t.angle));
  const s = Math.sin(toRad(t.angle));
  return [c, s, -s, c, t.px - t.px * c + t.py * s + t.dx, t.py - t.px * s - t.py * c + t.dy];
}

export function moveRow(row: SeatMapRow, t: Rigid): SeatMapRow {
  const [x, y] = applyRigid(t, row.x, row.y);
  return { ...row, x, y, rotation: normalizeAngle(row.rotation + t.angle) };
}

export function moveSection(section: SeatMapSection, t: Rigid): SeatMapSection {
  const points = section.points.map(([x, y]) => applyRigid(t, x, y));
  const rotated = t.angle ? applyRigid({ ...t, px: 0, py: 0, dx: 0, dy: 0 }, section.label.dx, section.label.dy) : null;
  return {
    ...section,
    points,
    label: rotated ? { ...section.label, dx: rotated[0], dy: rotated[1] } : section.label,
    rows: section.rows.map((r) => moveRow(r, t)),
  };
}

export function moveDecoration(d: SeatMapDecoration, t: Rigid): SeatMapDecoration {
  const [x, y] = applyRigid(t, d.x, d.y);
  return { ...d, x, y, rotation: normalizeAngle(d.rotation + t.angle) };
}

export function movePoi(p: SeatMapPoi, t: Rigid): SeatMapPoi {
  const [x, y] = applyRigid(t, p.x, p.y);
  return { ...p, x, y, rotation: normalizeAngle(p.rotation + t.angle) };
}

export function normalizeAngle(deg: number): number {
  const a = ((deg % 360) + 360) % 360;
  return Math.round((a > 180 ? a - 360 : a) * 100) / 100;
}

export function snap(value: number, step: number): number {
  return step > 0 ? Math.round(value / step) * step : value;
}

/** Corners of a rotated box, for decorations. */
export function boxCorners(x: number, y: number, w: number, h: number, rotationDeg: number): Point[] {
  const c = Math.cos(toRad(rotationDeg));
  const s = Math.sin(toRad(rotationDeg));
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([lx, ly]) => [x + lx * c - ly * s, y + lx * s + ly * c] as Point);
}

/* ---------- naming ---------- */

export function nextSectionCode(doc: SeatMapDoc): string {
  const taken = new Set(doc.sections.map((s) => s.code));
  for (let n = 101; ; n++) if (!taken.has(String(n))) return String(n);
}

/** Next label in the section's sequence: 1, 2, 3… or A, B, C… */
export function nextRowLabel(section: SeatMapSection): string {
  const labels = section.rows.map((r) => r.label);
  const last = labels[labels.length - 1];
  if (!last) return "1";
  const next = stepLabel(last, 1);
  const taken = new Set(labels);
  let candidate = next;
  for (let i = 0; taken.has(candidate) && i < 1000; i++) candidate = stepLabel(candidate, 1);
  return candidate;
}

export function stepLabel(label: string, by: number): string {
  if (/^\d+$/.test(label)) return String(Math.max(0, Number(label) + by));
  if (/^[A-Z]+$/.test(label)) return fromLetters(Math.max(1, toLetters(label) + by));
  if (/^[a-z]+$/.test(label)) return fromLetters(Math.max(1, toLetters(label.toUpperCase()) + by)).toLowerCase();
  return `${label}${by}`;
}

function toLetters(s: string): number {
  return [...s].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
}

function fromLetters(n: number): string {
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/* ---------- builders ---------- */

export function makeRow(partial: Partial<SeatMapRow> & Pick<SeatMapRow, "x" | "y">): SeatMapRow {
  return {
    id: newId("r"),
    label: "1",
    seats: 10,
    rotation: 0,
    curve: 0,
    pitch: DEFAULT_SEAT_PITCH,
    start: 1,
    reverse: false,
    gaps: [],
    spread: "packed",
    layout: "line",
    boxW: 0,
    boxH: 0,
    wheelchair: [],
    ...partial,
  };
}

export function makeSection(doc: SeatMapDoc, points: Point[], categoryId: string | null): SeatMapSection {
  const code = nextSectionCode(doc);
  const b = boundsOf(points);
  return {
    id: newId("s"),
    code,
    name: `Section ${code}`,
    categoryId,
    points,
    label: { text: "", size: Math.max(8, Math.min(40, Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.22)), dx: 0, dy: 0, rotation: 0, visible: true },
    entrance: "",
    display: "seats",
    rows: [],
  };
}

/** A loge: one labelled block, with no chairs until someone switches it back to seats. */
export function makeLoge(doc: SeatMapDoc, points: Point[], categoryId: string | null): SeatMapSection {
  const section = makeSection(doc, points, categoryId);
  const n = doc.sections.filter((s) => s.display === "block").length + 1;
  const name = `Loge ${n}`;
  const b = boundsOf(points);
  return {
    ...section,
    name,
    display: "block",
    label: { ...section.label, text: name, size: Math.max(12, Math.min(28, Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.28)) },
  };
}

/** A hospitality table. Chairs are a real row, so they publish with the rest of the map. */
export function makeTable(doc: SeatMapDoc, kind: "round" | "rect", cx: number, cy: number, w: number, h: number, categoryId: string | null): SeatMapSection {
  const used = new Set(doc.sections.map((s) => s.label.text));
  let n = 1;
  while (used.has(String(n))) n++;
  const label = String(n);
  const chairs = kind === "round" ? 6 : 6;
  const tableW = Math.max(16, w);
  const tableH = Math.max(16, h);
  const points =
    kind === "round"
      ? circlePoints(cx, cy, tableW / 2 + SEAT_RADIUS + 3, 20)
      : rectPoints(cx, cy, tableW + (SEAT_RADIUS + 2) * 2, tableH + (SEAT_RADIUS + 2) * 2);
  const section = makeSection(doc, points, categoryId);
  const row = makeRow({
    x: cx,
    y: cy,
    label: "1",
    seats: chairs,
    layout: kind === "round" ? "ring" : "sides",
    pitch: DEFAULT_SEAT_PITCH,
    boxW: tableW,
    boxH: kind === "round" ? tableW : tableH,
    gaps: [],
  });
  return {
    ...section,
    name: `Table ${label}`,
    display: kind === "round" ? "round-table" : "rect-table",
    label: { ...section.label, text: label, size: Math.max(10, Math.min(22, tableW * 0.28)), visible: true },
    rows: [row],
  };
}

function circlePoints(cx: number, cy: number, r: number, steps: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    points.push([Math.round((cx + r * Math.cos(a)) * 100) / 100, Math.round((cy + r * Math.sin(a)) * 100) / 100]);
  }
  return points;
}

function rectPoints(cx: number, cy: number, w: number, h: number): Point[] {
  return [
    [cx - w / 2, cy - h / 2],
    [cx + w / 2, cy - h / 2],
    [cx + w / 2, cy + h / 2],
    [cx - w / 2, cy + h / 2],
  ];
}

/**
 * Seats that fit on a straight segment from (x1, y1) to (x2, y2), returned as a
 * row centred on the segment.
 */
export function rowFromSegment(x1: number, y1: number, x2: number, y2: number, pitch = DEFAULT_SEAT_PITCH): Omit<SeatMapRow, "id" | "label"> {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const seats = Math.max(1, Math.floor(length / pitch) + 1);
  return {
    seats,
    x: (x1 + x2) / 2,
    y: (y1 + y2) / 2,
    rotation: normalizeAngle(toDeg(Math.atan2(y2 - y1, x2 - x1))),
    curve: 0,
    pitch,
    start: 1,
    reverse: false,
    gaps: [],
    spread: "packed",
    layout: "line",
    boxW: 0,
    boxH: 0,
    wheelchair: [],
  };
}

/**
 * A curved row through both ends and bulging by `sagitta` (signed, along the
 * left-hand normal of start → end). Seat count follows the arc length.
 */
export function curvedRow(x1: number, y1: number, x2: number, y2: number, sagitta: number, pitch = DEFAULT_SEAT_PITCH): Omit<SeatMapRow, "id" | "label"> {
  const chord = Math.hypot(x2 - x1, y2 - y1);
  const rot = Math.atan2(y2 - y1, x2 - x1);
  if (chord < 1 || Math.abs(sagitta) < 0.5) return rowFromSegment(x1, y1, x2, y2, pitch);
  const theta = 4 * Math.atan((2 * Math.abs(sagitta)) / chord);
  const radius = chord / (2 * Math.sin(theta / 2));
  const arc = radius * theta;
  const seats = Math.max(1, Math.floor(arc / pitch) + 1);
  const length = (seats - 1) * pitch;
  // Normal pointing to local -y: rotate direction by -90°.
  const nx = Math.sin(rot);
  const ny = -Math.cos(rot);
  // Positive sagitta puts the arc's middle on the -y side, so the ends bend to +y: negative curve.
  const mx = (x1 + x2) / 2 + nx * sagitta;
  const my = (y1 + y2) / 2 + ny * sagitta;
  const sign = sagitta > 0 ? -1 : 1;
  return {
    seats,
    x: mx,
    y: my,
    rotation: normalizeAngle(toDeg(rot)),
    curve: Math.round(sign * toDeg(length / radius) * 10) / 10,
    pitch,
    start: 1,
    reverse: false,
    gaps: [],
    spread: "packed",
    layout: "line",
    boxW: 0,
    boxH: 0,
    wheelchair: [],
  };
}

/* ---------- focal point: rows as arcs around one centre ---------- */

const TAU = Math.PI * 2;
const MAX_ARC = toRad(250);

/**
 * One row on the circle around `focal`. `mid` is the centre seat's angle,
 * `seatSpan` is the angle from the first seat to the last. Every seat faces
 * the focal point, and a positive span bends the row around it.
 */
export function rowOnArc(focal: Point, radius: number, mid: number, seatSpan: number, seats: number): Omit<SeatMapRow, "id" | "label"> {
  const span = Math.max(-MAX_ARC, Math.min(MAX_ARC, seatSpan));
  const count = Math.max(1, Math.min(MAX_SEATS_PER_ROW, Math.round(seats)));
  const straight = count <= 1 || Math.abs(span) < 1e-4;
  let pitch = straight ? DEFAULT_SEAT_PITCH : (radius * Math.abs(span)) / (count - 1);
  pitch = Math.min(60, Math.max(SEAT_RADIUS * 2, pitch));
  const curve = straight ? 0 : toDeg(((count - 1) * pitch) / radius) * Math.sign(span || 1);
  return {
    seats: count,
    x: Math.round((focal[0] + radius * Math.cos(mid)) * 100) / 100,
    y: Math.round((focal[1] + radius * Math.sin(mid)) * 100) / 100,
    rotation: normalizeAngle(toDeg(Math.atan2(-Math.cos(mid), Math.sin(mid)))),
    curve: Math.round(Math.max(-270, Math.min(270, curve)) * 10) / 10,
    pitch: Math.round(pitch * 100) / 100,
    start: 1,
    reverse: false,
    gaps: [],
    spread: "packed",
    layout: "line",
    boxW: 0,
    boxH: 0,
    wheelchair: [],
  };
}

/**
 * Change how many seats a row holds.
 * Packed keeps today's gap, so the row grows or shrinks from its middle.
 * Edge to edge keeps the same length and shares it evenly.
 */
export function applySeatCount(row: SeatMapRow, seats: number, spread: "packed" | "edge"): SeatMapRow {
  const count = Math.max(1, Math.min(MAX_SEATS_PER_ROW, Math.round(seats)));
  if (row.layout !== "line") return { ...row, seats: count, spread };
  if (spread === "edge" && count > 1 && row.seats > 1) {
    const pitch = Math.min(60, Math.max(SEAT_RADIUS * 2, rowLength(row) / (count - 1)));
    return { ...row, seats: count, spread, pitch: Math.round(pitch * 100) / 100 };
  }
  return { ...row, seats: count, spread: "packed" };
}

/** Bend an existing row so its seats look at the focal point, keeping its place and spacing. */
export function aimRow(row: SeatMapRow, focal: Point): SeatMapRow {
  const r = Math.hypot(row.x - focal[0], row.y - focal[1]);
  if (r < 8) return row;
  const mid = Math.atan2(row.y - focal[1], row.x - focal[0]);
  const span = row.seats <= 1 ? 0 : Math.min(MAX_ARC, rowLength(row) / r);
  const aimed = rowOnArc(focal, r, mid, span, row.seats);
  return { ...row, x: aimed.x, y: aimed.y, rotation: aimed.rotation, curve: aimed.curve, pitch: aimed.pitch };
}

type Arc = { start: number; span: number };

function circleEdgeAngles(cx: number, cy: number, r: number, ax: number, ay: number, bx: number, by: number, into: number[]) {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-8) return;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return;
  const root = Math.sqrt(disc);
  for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
    if (t < -1e-5 || t > 1 + 1e-5) continue;
    const u = Math.min(1, Math.max(0, t));
    into.push(Math.atan2(ay + dy * u - cy, ax + dx * u - cx));
  }
}

function dedupeAngles(angles: number[]): number[] {
  const sorted = angles
    .map((a) => {
      const x = a % TAU;
      return x < 0 ? x + TAU : x;
    })
    .sort((a, b) => a - b);
  const out: number[] = [];
  for (const a of sorted) if (!out.length || a - out[out.length - 1] > 1e-3) out.push(a);
  if (out.length > 1 && out[0] + TAU - out[out.length - 1] < 1e-3) out.pop();
  return out;
}

/** Pieces of the circle that run through the polygon. Spans are counter-clockwise. */
function arcsInside(focal: Point, radius: number, polygon: readonly (readonly [number, number])[]): Arc[] {
  const [cx, cy] = focal;
  const angles: number[] = [];
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    circleEdgeAngles(cx, cy, radius, polygon[j][0], polygon[j][1], polygon[i][0], polygon[i][1], angles);
  }
  const cuts = dedupeAngles(angles);
  if (cuts.length < 2) return [];
  const arcs: Arc[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const start = cuts[i];
    const next = cuts[(i + 1) % cuts.length];
    let span = next - start;
    if (span <= 0) span += TAU;
    const mid = start + span / 2;
    if (pointInPolygon(cx + radius * Math.cos(mid), cy + radius * Math.sin(mid), polygon)) arcs.push({ start, span });
  }
  if (!arcs.length) return [];
  const merged: Arc[] = [];
  for (const arc of arcs) {
    const prev = merged[merged.length - 1];
    const prevEnd = prev ? (prev.start + prev.span) % TAU : -1;
    if (prev && (Math.abs(prevEnd - arc.start) < 1e-2 || Math.abs(prevEnd - arc.start + TAU) < 1e-2)) prev.span += arc.span;
    else merged.push({ ...arc });
  }
  if (merged.length > 1) {
    const first = merged[0];
    const last = merged[merged.length - 1];
    const lastEnd = (last.start + last.span) % TAU;
    if (Math.abs(lastEnd - first.start) < 1e-2 || Math.abs(lastEnd - first.start + TAU) < 1e-2) {
      last.span += first.span;
      merged.shift();
    }
  }
  return merged.filter((arc) => arc.span < TAU * 0.92);
}

function longestArc(focal: Point, radius: number, polygon: readonly (readonly [number, number])[]): Arc | null {
  const arcs = arcsInside(focal, radius, polygon);
  if (!arcs.length) return null;
  return arcs.reduce((best, arc) => (arc.span > best.span ? arc : best));
}

function radialRange(focal: Point, polygon: readonly (readonly [number, number])[]): { rMin: number; rMax: number } | null {
  const [cx, cy] = focal;
  let rMin = Infinity;
  let rMax = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [x, y] = polygon[i];
    const [x0, y0] = polygon[j];
    const d = Math.hypot(x - cx, y - cy);
    if (d < rMin) rMin = d;
    if (d > rMax) rMax = d;
    const dx = x - x0;
    const dy = y - y0;
    const len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / len)) : 0;
    const edge = Math.hypot(x0 + dx * t - cx, y0 + dy * t - cy);
    if (edge < rMin) rMin = edge;
  }
  return Number.isFinite(rMin) && rMax - rMin >= 4 ? { rMin, rMax } : null;
}

/** A starting guess for the section inspector: one row per 0.8 m of depth, seats at the default pitch. */
export function suggestFill(polygon: readonly (readonly [number, number])[], focal: Point): { rows: number; seats: number } {
  const range = radialRange(focal, polygon);
  if (!range) return { rows: 8, seats: 16 };
  const pad = SEAT_RADIUS + 1.6;
  const depth = Math.max(0, range.rMax - range.rMin - pad * 2);
  const rows = Math.max(1, Math.min(40, Math.round(depth / DEFAULT_ROW_PITCH)));
  const radius = (range.rMin + range.rMax) / 2;
  const arc = longestArc(focal, radius, polygon);
  const span = arc ? Math.max(0, arc.span - (2 * (SEAT_RADIUS + 1.2)) / radius) : 0;
  const seats = Math.max(2, Math.min(60, Math.round((span * radius) / DEFAULT_SEAT_PITCH) || 12));
  return { rows, seats };
}

/**
 * Fills a section with rows that follow its outline and face `focal`.
 * Every row shares the same angle step, so a seat lines up with the seat
 * behind it. Narrower rows get fewer seats; `seats` is the widest row.
 */
export type RowPlan = { seats: number; spread: "packed" | "edge" };

export function fillSection(
  polygon: readonly (readonly [number, number])[],
  focal: Point,
  options: { rows: number; seats: number; plan?: RowPlan[] },
): { rows: Omit<SeatMapRow, "id" | "label">[] } | { error: string } {
  const range = radialRange(focal, polygon);
  if (!range) return { error: "The focal point is too close to this section to curve rows around it." };
  const pad = SEAT_RADIUS + 1.6;
  const inner = range.rMin + pad;
  const outer = range.rMax - pad;
  if (outer - inner < 3) return { error: "This section is too shallow. Draw it deeper, or move the focal point." };

  const count = Math.max(1, Math.min(MAX_ROWS_PER_SECTION, Math.round(options.rows)));
  const wanted = Math.max(1, Math.min(MAX_SEATS_PER_ROW, Math.round(options.seats)));
  const bands: { radius: number; arc: Arc }[] = [];
  for (let i = 0; i < count; i++) {
    const radius = count === 1 ? (inner + outer) / 2 : inner + ((outer - inner) * i) / (count - 1);
    let arc = longestArc(focal, radius, polygon);
    if (!arc) {
      for (const nudge of [0.35, -0.35, 0.7, -0.7]) {
        arc = longestArc(focal, radius + nudge * DEFAULT_ROW_PITCH, polygon);
        if (arc) break;
      }
    }
    if (!arc) continue;
    const endPad = (SEAT_RADIUS + 1.2) / radius;
    const span = Math.min(MAX_ARC, arc.span - endPad * 2);
    if (span < 0.03) continue;
    bands.push({ radius, arc: { start: arc.start + endPad, span } });
  }
  if (!bands.length) return { error: "No row fits inside this section. Check that the focal point sits out on the pitch, not inside the stand." };

  const widest = bands.reduce((m, b) => Math.max(m, b.arc.span), 0);
  const innerRadius = bands.reduce((m, b) => Math.min(m, b.radius), Infinity);
  const seats = Math.max(1, Math.min(wanted, Math.floor((innerRadius * widest) / (SEAT_RADIUS * 2)) + 1));
  const step = seats <= 1 ? 0 : widest / (seats - 1);

  const rows = bands.map(({ radius, arc }, i) => {
    const spec = options.plan?.[i];
    const spread = spec?.spread ?? "packed";
    const want = Math.max(1, Math.min(MAX_SEATS_PER_ROW, Math.round(spec?.seats ?? seats)));
    const mid = arc.start + arc.span / 2;
    if (spread === "edge") {
      const maxFit = Math.max(1, Math.floor((radius * arc.span) / (SEAT_RADIUS * 2)) + 1);
      return { ...rowOnArc(focal, radius, mid, arc.span, Math.min(want, maxFit)), spread: "edge" as const };
    }
    const n = step === 0 ? 1 : Math.max(1, Math.min(want, Math.floor(arc.span / step) + 1));
    const span = (n - 1) * step;
    return rowOnArc(focal, radius, mid, span, n);
  });
  return { rows };
}

/**
 * The row-block tool, once a focal point exists. The dragged line is the first
 * row; further rows step toward the pointer and keep the same angle, so the
 * seats stay on rays from the focal point.
 */
export function blockFacingFocal(
  focal: Point,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  normalX: number,
  normalY: number,
  sign: number,
  count: number,
  rowPitch = DEFAULT_ROW_PITCH,
): Omit<SeatMapRow, "id" | "label">[] | null {
  const [fx, fy] = focal;
  let span = Math.atan2(y1 - fy, x1 - fx) - Math.atan2(y0 - fy, x0 - fx);
  if (span > Math.PI) span -= TAU;
  if (span < -Math.PI) span += TAU;
  if (Math.abs(span) < 0.04) return null;
  const r0 = (Math.hypot(x0 - fx, y0 - fy) + Math.hypot(x1 - fx, y1 - fy)) / 2;
  if (r0 < 20) return null;
  const mid = Math.atan2(y0 - fy, x0 - fx) + span / 2;
  const seats = Math.max(2, Math.min(MAX_SEATS_PER_ROW, Math.floor((Math.abs(span) * r0) / DEFAULT_SEAT_PITCH) + 1));
  const radial = normalX * sign * Math.cos(mid) + normalY * sign * Math.sin(mid);
  const dir = Math.abs(radial) < 0.15 ? (sign >= 0 ? 1 : -1) : Math.sign(radial);
  const rows: Omit<SeatMapRow, "id" | "label">[] = [];
  for (let i = 0; i < count; i++) {
    const radius = r0 + dir * i * rowPitch;
    if (radius < 15) continue;
    rows.push(rowOnArc(focal, radius, mid, Math.abs(span), seats));
  }
  return rows.length ? rows : null;
}

/* ---------- stadium bowl template ---------- */

export type BowlRing = { rows: number; sections: number; categoryId: string | null; name: string };
export type BowlOptions = {
  fieldWidth: number;
  fieldHeight: number;
  /** Space between the pitch and the first row. */
  apron: number;
  /** Walkway between rings. */
  concourse: number;
  /** Aisle between neighbouring sections. */
  aisle: number;
  /** 2 is an ellipse; higher values square the bowl off toward the pitch. */
  squareness: number;
  seatPitch: number;
  rowPitch: number;
  rings: BowlRing[];
};

export const DEFAULT_BOWL: BowlOptions = {
  fieldWidth: 1050,
  fieldHeight: 680,
  apron: 70,
  concourse: 45,
  aisle: 14,
  squareness: 3,
  seatPitch: DEFAULT_SEAT_PITCH,
  rowPitch: DEFAULT_ROW_PITCH,
  rings: [
    { rows: 18, sections: 24, categoryId: "lower", name: "Lower tier" },
    { rows: 22, sections: 28, categoryId: "middle", name: "Middle tier" },
    { rows: 26, sections: 32, categoryId: "upper", name: "Upper tier" },
  ],
};

function superellipse(a: number, b: number, n: number, t: number): Point {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const e = 2 / n;
  return [a * Math.sign(c) * Math.abs(c) ** e, b * Math.sign(s) * Math.abs(s) ** e];
}

/** Maps a fraction of the outline's length to the curve parameter, so sections get equal frontage. */
function lengthTable(a: number, b: number, n: number, samples = 1440) {
  const ts = new Float64Array(samples + 1);
  const ls = new Float64Array(samples + 1);
  let prev = superellipse(a, b, n, -Math.PI / 2);
  let total = 0;
  for (let i = 0; i <= samples; i++) {
    const t = -Math.PI / 2 + (i / samples) * Math.PI * 2;
    const p = superellipse(a, b, n, t);
    total += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    ts[i] = t;
    ls[i] = total;
    prev = p;
  }
  return {
    total,
    at(fraction: number): number {
      const target = ((fraction % 1) + 1) % 1 * total;
      let lo = 0;
      let hi = samples;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (ls[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      if (lo === 0) return ts[0];
      const span = ls[lo] - ls[lo - 1];
      const k = span > 0 ? (target - ls[lo - 1]) / span : 0;
      return ts[lo - 1] + (ts[lo] - ts[lo - 1]) * k;
    },
  };
}

const fitX = new Float32Array(MAX_SEATS_PER_ROW * 2);
const fitY = new Float32Array(MAX_SEATS_PER_ROW * 2);

function rowInside(row: SeatMapRow, polygon: Point[]): boolean {
  const n = placeRow(row, fitX, fitY);
  for (let i = 0; i < n; i++) if (!pointInPolygon(fitX[i], fitY[i], polygon)) return false;
  return true;
}

/** Parameter reached after travelling `distance` along the curve from `t` in direction `dir`. */
function walkAlong(a: number, b: number, n: number, t: number, distance: number, dir: 1 | -1): number {
  const step = 0.0005 * dir;
  let prev = superellipse(a, b, n, t);
  let travelled = 0;
  for (let i = 0; i < 4000 && travelled < distance; i++) {
    t += step;
    const p = superellipse(a, b, n, t);
    travelled += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
  }
  return t;
}

/** Circular-arc row approximating the bowl curve between two parameters at offset `a, b`. */
function bowlRow(a: number, b: number, n: number, t0: number, t1: number, pitch: number): Omit<SeatMapRow, "id" | "label"> | null {
  const p1 = superellipse(a, b, n, t0);
  const p2 = superellipse(a, b, n, t1);
  const chord = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  if (chord < pitch) return null;
  const rot = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
  const cx = (p1[0] + p2[0]) / 2;
  const cy = (p1[1] + p2[1]) / 2;
  // Sagitta = the curve's furthest perpendicular reach from the chord; the parameter midpoint
  // can sit far along the chord where the superellipse parameter bunches up.
  const nx = -Math.sin(rot);
  const ny = Math.cos(rot);
  let reach = 0;
  for (let k = 1; k < 64; k++) {
    const p = superellipse(a, b, n, t0 + ((t1 - t0) * k) / 64);
    const d = (p[0] - cx) * nx + (p[1] - cy) * ny;
    if (Math.abs(d) > Math.abs(reach)) reach = d;
  }
  const pm: Point = [cx + nx * reach, cy + ny * reach];
  const h = Math.abs(reach);
  const theta = 4 * Math.atan((2 * h) / chord);
  const straight = theta < 1e-3;
  const radius = straight ? Infinity : chord / (2 * Math.sin(theta / 2));
  const arc = straight ? chord : radius * theta;
  const seats = Math.floor((arc - SEAT_RADIUS * 2.4) / pitch) + 1;
  if (seats < 1) return null;
  const length = (seats - 1) * pitch;
  // Ends lie toward the chord from the arc's middle. Local +y is the left-hand normal (-sin, cos).
  const dot = (cx - pm[0]) * -Math.sin(rot) + (cy - pm[1]) * Math.cos(rot);
  const sign = dot < 0 ? 1 : -1;
  return {
    seats,
    x: pm[0],
    y: pm[1],
    rotation: normalizeAngle(toDeg(rot)),
    curve: straight ? 0 : Math.round(sign * toDeg(length / radius) * 100) / 100,
    pitch,
    start: 1,
    reverse: false,
    gaps: [],
    spread: "packed",
    layout: "line",
    boxW: 0,
    boxH: 0,
    wheelchair: [],
  };
}

export function bowlTemplate(doc: SeatMapDoc, options: BowlOptions = DEFAULT_BOWL): SeatMapDoc {
  const n = Math.max(2, options.squareness);
  let inner = { a: options.fieldWidth / 2 + options.apron, b: options.fieldHeight / 2 + options.apron };
  const sections: SeatMapSection[] = [];
  const edge = 8;

  options.rings.forEach((ring, ringIndex) => {
    const depth = ring.rows * options.rowPitch;
    const outer = { a: inner.a + depth, b: inner.b + depth };
    const mid = lengthTable(inner.a + depth / 2, inner.b + depth / 2, n);
    const gap = options.aisle / mid.total;
    const count = Math.max(1, ring.sections);
    for (let j = 0; j < count; j++) {
      const f0 = j / count + gap / 2;
      const f1 = (j + 1) / count - gap / 2;
      let t0 = mid.at(f0);
      let t1 = mid.at(f1);
      if (t1 < t0) t1 += Math.PI * 2;
      if (t0 > t1) t0 -= Math.PI * 2;
      const steps = 8;
      const points: Point[] = [];
      for (let k = 0; k <= steps; k++) points.push(round2(superellipse(inner.a, inner.b, n, t0 + ((t1 - t0) * k) / steps)));
      for (let k = steps; k >= 0; k--) points.push(round2(superellipse(outer.a, outer.b, n, t0 + ((t1 - t0) * k) / steps)));

      const code = String((ringIndex + 1) * 100 + j + 1);
      const rows: SeatMapRow[] = [];
      for (let r = 0; r < ring.rows; r++) {
        const off = r * options.rowPitch + options.rowPitch / 2;
        // Same-parameter points at every offset lie on the straight radial edge, so walk in from t0/t1.
        // A circular arc only approximates a squarish curve: trim seats, then nudge the row, until it fits.
        let row: SeatMapRow | null = null;
        fit: for (const push of [0, 1, -1, 2, -2, 3, -3]) {
          const ra = inner.a + off + push;
          const rb = inner.b + off + push;
          for (let pad = edge + SEAT_RADIUS, tries = 0; tries < 6; pad += options.seatPitch, tries++) {
            const r0 = walkAlong(ra, rb, n, t0, pad, 1);
            const r1 = walkAlong(ra, rb, n, t1, pad, -1);
            const arc = r1 > r0 ? bowlRow(ra, rb, n, r0, r1, options.seatPitch) : null;
            if (!arc) break;
            const candidate = { ...arc, id: newId("r"), label: String(r + 1) };
            if (rowInside(candidate, points)) {
              row = candidate;
              break fit;
            }
            row ??= candidate;
          }
        }
        if (row) rows.push(row);
      }
      const b = boundsOf(points);
      sections.push({
        id: newId("s"),
        code,
        name: `${ring.name} ${code}`,
        categoryId: ring.categoryId,
        points,
        label: { text: "", size: Math.round(Math.max(10, Math.min(36, Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.3))), dx: 0, dy: 0, rotation: 0, visible: true },
        entrance: "",
        display: "seats",
        rows,
      });
    }
    inner = { a: outer.a + options.concourse, b: outer.b + options.concourse };
  });

  const field: SeatMapDecoration = {
    id: newId("d"),
    kind: "field",
    x: 0,
    y: 0,
    w: options.fieldWidth,
    h: options.fieldHeight,
    rotation: 0,
    label: "",
    color: "#7cb36b",
  };
  const categoryIds = new Set(doc.categories.map((c) => c.id));
  return {
    ...doc,
    sections: sections.map((s) => (s.categoryId && !categoryIds.has(s.categoryId) ? { ...s, categoryId: null } : s)),
    decorations: [field],
    pois: [],
    focal: { x: 0, y: 0 },
  };
}

const round2 = ([x, y]: Point): Point => [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
