import {
  DEFAULT_NUMBERING,
  DEFAULT_SEAT_PITCH,
  MAX_ROWS_PER_SECTION,
  MAX_SEATS_PER_ROW,
  SEAT_RADIUS,
  newId,
  type SeatMapDecoration,
  type SeatMapDoc,
  type SeatMapNumbering,
  type SeatMapPoi,
  type SeatMapRow,
  type SeatMapSection,
} from "./schema";

export type Point = [number, number];
/** Seat positions: a scene buffer or a plain array. */
export type Coords = Float32Array | Float64Array | number[];
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const DEG = Math.PI / 180;

export const toRad = (deg: number) => deg * DEG;
export const toDeg = (rad: number) => rad / DEG;

/** Number a slot would have before any renumber: start, start + 1, … along the row. */
function slotNumber(row: SeatMapRow, i: number): number {
  return row.start + (row.reverse ? row.seats - 1 - i : i) * row.step;
}

/** Printed number of the seat at position `i` (0 = the row's first end). */
export function seatNumber(row: SeatMapRow, i: number): number {
  if (row.numbers.length === row.seats) return row.numbers[i] ?? slotNumber(row, i);
  return slotNumber(row, i);
}

/** True when a removed seat left a gap in the printed numbers. */
export function rowNeedsRenumber(row: SeatMapRow): boolean {
  if (!row.removed.length || row.layout !== "line") return false;
  const gone = new Set(row.removed);
  const order: number[] = [];
  for (let i = 0; i < row.seats; i++) if (!gone.has(i)) order.push(i);
  if (!order.length) return false;
  if (row.reverse) order.reverse();
  if (row.numbers.length !== row.seats) return true;
  return order.some((i, n) => row.numbers[i] !== row.start + n * row.step);
}

/**
 * Packs the printed numbers of the chairs that are still there.
 * Seat 2 becomes 1 after seat 1 was removed. Positions stay where they are.
 */
export function renumberRow(row: SeatMapRow): SeatMapRow {
  if (!rowNeedsRenumber(row)) return row;
  const gone = new Set(row.removed);
  const order: number[] = [];
  for (let i = 0; i < row.seats; i++) if (!gone.has(i)) order.push(i);
  if (row.reverse) order.reverse();
  const numbers = Array.from({ length: row.seats }, () => 0);
  const remap = new Map<number, number>();
  order.forEach((i, n) => {
    const next = row.start + n * row.step;
    remap.set(seatNumber(row, i), next);
    numbers[i] = next;
  });
  const wheelchair = [...new Set(row.wheelchair.flatMap((n) => (remap.has(n) ? [remap.get(n)!] : [])))];
  return { ...row, numbers, wheelchair };
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
      if (gaps && gaps.has(Math.min(slotNumber(row, i - 1), slotNumber(row, i)))) at += 1;
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
export function placeRow(row: SeatMapRow, xs: Coords, ys: Coords, offset = 0): number {
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
function placeRing(row: SeatMapRow, xs: Coords, ys: Coords, offset: number): number {
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
function placeSides(row: SeatMapRow, xs: Coords, ys: Coords, offset: number): number {
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

export function seatsOfSection(section: SeatMapSection, venues: readonly SeatMapDecoration[] = []) {
  const { xs, ys, starts } = placeSection(section, venues);
  return section.rows.flatMap((row, ri) => {
    const gone = new Set(row.removed);
    const out: { id: string; row: string; number: number; x: number; y: number }[] = [];
    for (let i = 0; i < starts[ri + 1] - starts[ri]; i++) {
      if (gone.has(i)) continue;
      const n = seatNumber(row, i);
      out.push({ id: seatId(section.code, row.label, n), row: row.label, number: n, x: xs[starts[ri] + i], y: ys[starts[ri] + i] });
    }
    return out;
  });
}

/* ---------- section shape: bend and venue path ---------- */

/** Venue shapes in the document. Sections that follow a venue use the nearest one. */
export function venuesOf(doc: SeatMapDoc): SeatMapDecoration[] {
  return doc.decorations.filter((d) => d.kind === "venue");
}

/** Every slot of every row, after the section's bend or venue path. `starts[r]` is row r's first index. */
export function placeSection(section: SeatMapSection, venues: readonly SeatMapDecoration[]) {
  const total = section.rows.reduce((n, r) => n + r.seats, 0);
  const xs = new Float64Array(total);
  const ys = new Float64Array(total);
  const starts = [0];
  let at = 0;
  for (const r of section.rows) {
    at += placeRow(r, xs, ys, at);
    starts.push(at);
  }
  warpSeats(section, venues, xs, ys, 0, at);
  return { xs, ys, starts };
}

type Frame = { ux: number; uy: number; vx: number; vy: number };

function blockFrame(section: SeatMapSection): Frame {
  const base = section.rows.find((r) => r.layout === "line") ?? section.rows[0];
  const ux = Math.cos(toRad(base?.rotation ?? 0));
  const uy = Math.sin(toRad(base?.rotation ?? 0));
  return { ux, uy, vx: -uy, vy: ux };
}

/** A point of the block, from its straight frame (x along the rows, y front to back) to the world. */
type Warp = (x: number, y: number) => Point;

/**
 * The section's bend or venue path as a function of straight-frame coordinates.
 * Null when the rows stay as they are drawn.
 */
function sectionWarp(
  section: SeatMapSection,
  venues: readonly SeatMapDecoration[],
  frame: Frame,
  box: { minX: number; maxX: number; minY: number; maxY: number },
): Warp | null {
  if (section.display !== "seats" || !section.rows.length) return null;
  const { ux, uy, vx, vy } = frame;
  const world = (x: number, y: number): Point => [x * ux + y * vx, x * uy + y * vy];
  if (section.follow !== "off" && venues.length) return venueBinding(section, venues, frame, box)?.warp ?? null;
  const angle = toRad(section.bend);
  const width = box.maxX - box.minX;
  if (Math.abs(angle) < 1e-4 || width < 1e-3) return null;
  // Bent like a sheet over a cylinder: the row nearest the centre keeps its spacing, the others spread out.
  // One seat gap is added to the span so a full 360° closes without the ends meeting.
  const s = angle > 0 ? 1 : -1;
  const pitch = (section.rows.find((r) => r.layout === "line") ?? section.rows[0]).pitch;
  const radius = (width + pitch) / Math.abs(angle);
  const y0 = s > 0 ? box.minY : box.maxY;
  const xc = (box.minX + box.maxX) / 2;
  return (x, y) => {
    const r = radius + s * (y - y0);
    const theta = (x - xc) / radius;
    return world(xc + r * Math.sin(theta), y0 - s * radius + s * r * Math.cos(theta));
  };
}

type VenueBinding = {
  warp: Warp;
  /** Where the straight block's facing edge actually sits. */
  pa: Point;
  /** Where that edge is drawn, on the venue path. */
  anchor: Point;
  t0: number;
  dRef: number;
  /** Closest the facing edge may come. Inside this the block is pushed back out. */
  minD: number;
  ax: number;
  by: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  /** How far the middle of the block sits outside the facing edge. */
  eCenter: number;
  fromFront: boolean;
  /** Middle of the block, and the direction its rows run, both in world space. */
  cx: number;
  cy: number;
  angle: number;
  venue: SeatMapDecoration;
};

/**
 * Rows laid along a rounded rectangle, held by the middle of the side that faces it.
 * The straight block's facing edge is what we project. Keeping that edge on the path
 * (see `moveAlongVenue`) stops the projection flipping between two sides.
 */
function venueBinding(
  section: SeatMapSection,
  venues: readonly SeatMapDecoration[],
  frame: Frame,
  box: { minX: number; maxX: number; minY: number; maxY: number },
): VenueBinding | null {
  if (section.follow === "off" || !venues.length) return null;
  const { ux, uy, vx, vy } = frame;
  const world = (x: number, y: number): Point => [x * ux + y * vx, x * uy + y * vy];
  const mid = (box.minX + box.maxX) / 2;
  const [cx, cy] = world(mid, (box.minY + box.maxY) / 2);
  let venue = venues[0];
  let best = Infinity;
  for (const v of venues) {
    const d = Math.hypot(v.x - cx, v.y - cy);
    if (d < best) {
      best = d;
      venue = v;
    }
  }
  const cos = Math.cos(toRad(venue.rotation));
  const sin = Math.sin(toRad(venue.rotation));
  const toVenue = ([x, y]: Point): Point => {
    const dx = x - venue.x;
    const dy = y - venue.y;
    return [dx * cos + dy * sin, -dx * sin + dy * cos];
  };
  const fromVenue = (x: number, y: number): Point => [venue.x + x * cos - y * sin, venue.y + x * sin + y * cos];
  const hw = venue.w / 2;
  const hh = venue.h / 2;
  const rr = Math.max(0, Math.min(venue.radius, hw, hh));
  const ax = hw - rr;
  const by = hh - rr;
  const frontPt = toVenue(world(mid, box.minY));
  const backPt = toVenue(world(mid, box.maxY));
  const front = coreDistance(frontPt, ax, by);
  const back = coreDistance(backPt, ax, by);
  // How far an edge sits from the path it would be drawn on. The edge already on the
  // rim stays the anchor; around a corner the other edge can be nearer some other wall.
  const pathError = (p: Point, dist: number) => {
    const d = Math.max(dist, 1e-3);
    const at = pathAt(projectCore(p, ax, by, d), ax, by, d);
    return Math.hypot(p[0] - (at.qx + at.nx * d), p[1] - (at.qy + at.ny * d));
  };
  const errF = pathError(frontPt, front);
  const errB = pathError(backPt, back);
  const clearance = rr + SEAT_RADIUS + Math.min(section.padding[0], section.padding[2]);
  // Both edges inside the core: keep the front, as older drafts did.
  // Otherwise the edge already on the rim is the one sitting about `clearance`
  // out. Around a corner the other edge can be nearer a different wall and
  // would steal the anchor.
  // A drag records the edge it started with. Re-deciding here flips the block
  // onto the other side of a fully rounded end, where both edges land near the rim.
  const fromFront =
    section.face === "front"
      ? true
      : section.face === "back"
        ? false
        : front <= 1e-4 && back <= 1e-4
          ? true
          : Math.abs(errF - errB) > 0.5
            ? errF < errB
            : Math.abs(front - clearance) <= Math.abs(back - clearance);
  const yRef = fromFront ? box.minY : box.maxY;
  const xa = mid;
  const pa = world(xa, yRef);
  const local = toVenue(pa);
  // The outline on the side facing the venue is `padding` outside the seat edge.
  // Clear that too, or the filled section is drawn on top of the venue shape.
  const facing = Math.max(0, fromFront ? section.padding[0] : section.padding[2]);
  const minD = rr + facing + SEAT_RADIUS;
  const dRef = Math.max(coreDistance(local, ax, by), minD);
  const t0 = projectCore(local, ax, by, dRef);
  const tangent = pathAt(t0, ax, by, dRef);
  const u = toVenue([ux + venue.x, uy + venue.y]);
  const sigma = u[0] * tangent.tx + u[1] * tangent.ty >= 0 ? 1 : -1;
  const warp: Warp = (x, y) => {
    const e = fromFront ? y - yRef : yRef - y;
    const p = pathAt(t0 + sigma * (x - xa), ax, by, dRef);
    const d = dRef + e;
    return fromVenue(p.qx + p.nx * d, p.qy + p.ny * d);
  };
  const eCenter = Math.abs((box.minY + box.maxY) / 2 - yRef);
  const anchor = warp(xa, yRef);
  const nwx = tangent.nx * cos - tangent.ny * sin;
  const nwy = tangent.nx * sin + tangent.ny * cos;
  const twx = tangent.tx * cos - tangent.ty * sin;
  const twy = tangent.tx * sin + tangent.ty * cos;
  const angle = toDeg(Math.atan2(sigma * twy, sigma * twx));
  return {
    warp,
    pa,
    anchor,
    t0,
    dRef,
    minD,
    ax,
    by,
    tx: tangent.tx,
    ty: tangent.ty,
    nx: tangent.nx,
    ny: tangent.ny,
    eCenter,
    fromFront,
    cx: anchor[0] + nwx * eCenter,
    cy: anchor[1] + nwy * eCenter,
    angle,
    venue,
  };
}

/** Where a following section is drawn, and which way its rows run. Null when it is not on a venue. */
export function sectionFrame(section: SeatMapSection, venues: readonly SeatMapDecoration[]): { x: number; y: number; angle: number } | null {
  const pose = bindingOf(section, venues);
  return pose ? { x: pose.cx, y: pose.cy, angle: pose.angle } : null;
}

function bindingOf(section: SeatMapSection, venues: readonly SeatMapDecoration[]): VenueBinding | null {
  if (section.follow === "off" || section.display !== "seats" || !section.rows.length || !venues.length) return null;
  const frame = blockFrame(section);
  const straight = placeSection({ ...section, bend: 0, follow: "off" }, venues);
  const box = straightBox(frame, straight.xs, straight.ys, 0, straight.xs.length);
  if (!Number.isFinite(box.minX)) return null;
  return venueBinding(section, venues, frame, box);
}

const hundredth = (n: number) => Math.round(n * 100) / 100;

/** Slides the stored rows so the facing edge lies on the point the path already draws. */
function parkOnVenue(section: SeatMapSection, venues: readonly SeatMapDecoration[]): SeatMapSection {
  const pose = bindingOf(section, venues);
  if (!pose) return section;
  return shiftSection(section, pose.anchor[0] - pose.pa[0], pose.anchor[1] - pose.pa[1]);
}

/**
 * Moves a following section along the venue instead of in a straight line.
 * The middle of the block follows the pointer, and the edge that faces the
 * venue stays on the rim. The first aim uses the middle of the straight block,
 * which sits further out than the seats once a corner bends them, so a second
 * aim takes up the difference. One aim against the tangent the drag started
 * with made the block race through one corner and lag through the next.
 */
export function moveAlongVenue(section: SeatMapSection, venues: readonly SeatMapDecoration[], dx: number, dy: number): SeatMapSection {
  const parked = parkOnVenue(section, venues);
  if (Math.hypot(dx, dy) < 1e-9) return parked;
  const pose = bindingOf(parked, venues);
  if (!pose) return parked;
  const cos = Math.cos(toRad(pose.venue.rotation));
  const sin = Math.sin(toRad(pose.venue.rotation));
  const aimAt = (mx: number, my: number) => {
    const nwx = pose.nx * cos - pose.ny * sin;
    const nwy = pose.nx * sin + pose.ny * cos;
    const cx = pose.anchor[0] + nwx * pose.eCenter + mx;
    const cy = pose.anchor[1] + nwy * pose.eCenter + my;
    const ldx = cx - pose.venue.x;
    const ldy = cy - pose.venue.y;
    const local: Point = [ldx * cos + ldy * sin, -ldx * sin + ldy * cos];
    const dCenter = Math.max(pose.minD + pose.eCenter, coreDistance(local, pose.ax, pose.by));
    const at = pathAt(projectCore(local, pose.ax, pose.by, dCenter), pose.ax, pose.by, dCenter);
    const radius = Math.max(pose.minD, dCenter - pose.eCenter);
    const lx = at.qx + at.nx * radius;
    const ly = at.qy + at.ny * radius;
    const x = pose.venue.x + lx * cos - ly * sin;
    const y = pose.venue.y + lx * sin + ly * cos;
    const shifted = shiftSection(parked, x - pose.anchor[0], y - pose.anchor[1]);
    const face: "front" | "back" = pose.fromFront ? "front" : "back";
    return shifted.face === face ? shifted : { ...shifted, face };
  };
  const moved = aimAt(dx, dy);
  const from = seatCentroid(parked, venues);
  const got = from && seatCentroid(moved, venues);
  if (!from || !got) return moved;
  const missX = from[0] + dx - got[0];
  const missY = from[1] + dy - got[1];
  const miss = Math.hypot(missX, missY);
  // A miss this large is the block being pushed back out of the shape, not the
  // corner bending the rows. Chasing it would throw the block to another side.
  if (miss < 0.5 || miss > 40) return moved;
  return aimAt(dx + missX, dy + missY);
}

function seatCentroid(section: SeatMapSection, venues: readonly SeatMapDecoration[]): Point | null {
  const placed = placeSection(section, venues);
  const n = placed.xs.length;
  if (!n) return null;
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += placed.xs[i];
    y += placed.ys[i];
  }
  return [x / n, y / n];
}

/** Degrees of row curve whose middle sits `bulge` off the chord. Zero when the row is straight. */
function arcDegrees(bulge: number, length: number): number {
  if (Math.abs(bulge) < 0.05 || length < 1e-3) return 0;
  const f = (theta: number) => (length / theta) * (1 - Math.cos(theta / 2));
  let lo = bulge > 0 ? 1e-4 : (-270 * Math.PI) / 180;
  let hi = bulge > 0 ? (270 * Math.PI) / 180 : -1e-4;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > bulge) hi = mid;
    else lo = mid;
  }
  return Math.max(-270, Math.min(270, Math.round(toDeg((lo + hi) / 2) * 10) / 10));
}

/**
 * Leaves the seats where they are drawn. Turning the path off used to reveal the
 * straight block, which can sit far from the edge it was wrapped onto.
 */
export function detachVenueFollow(section: SeatMapSection, venues: readonly SeatMapDecoration[]): SeatMapSection {
  if (section.follow === "off") return section;
  const parked = parkOnVenue(section, venues);
  const placed = placeSection(parked, venues);
  const rows = parked.rows.map((row, ri) => {
    if (row.layout !== "line") return row;
    const a = placed.starts[ri];
    const b = placed.starts[ri + 1] - 1;
    if (b < a) return row;
    const x1 = placed.xs[a];
    const y1 = placed.ys[a];
    const x2 = placed.xs[b];
    const y2 = placed.ys[b];
    const rotation = b === a ? row.rotation : normalizeAngle(toDeg(Math.atan2(y2 - y1, x2 - x1)));
    const cos = Math.cos(toRad(rotation));
    const sin = Math.sin(toRad(rotation));
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const mid = a + Math.round((b - a) / 2);
    // How far the middle of the row sits off the chord, in the row's own frame.
    const bulge = -(placed.xs[mid] - mx) * sin + (placed.ys[mid] - my) * cos;
    const curve = arcDegrees(bulge, rowLength(row));
    const ly = -bulge;
    return { ...row, x: hundredth(mx - ly * -sin), y: hundredth(my - ly * cos), rotation, curve };
  });
  return { ...parked, follow: "off", bend: 0, face: "auto", rows };
}

function shiftSection(section: SeatMapSection, dx: number, dy: number): SeatMapSection {
  const x = hundredth(dx);
  const y = hundredth(dy);
  if (Math.abs(x) < 0.01 && Math.abs(y) < 0.01) return section;
  return {
    ...section,
    points: section.points.map(([px, py]) => [hundredth(px + x), hundredth(py + y)] as [number, number]),
    rows: section.rows.map((row) => ({ ...row, x: hundredth(row.x + x), y: hundredth(row.y + y) })),
  };
}

function coreDistance([x, y]: Point, ax: number, by: number): number {
  return Math.hypot(x - Math.max(-ax, Math.min(ax, x)), y - Math.max(-by, Math.min(by, y)));
}

/** Arc-length lengths of the eight pieces of a rounded rectangle `d` away from its core, clockwise from the top. */
function pathPieces(ax: number, by: number, d: number) {
  const q = (d * Math.PI) / 2;
  return [2 * ax, q, 2 * by, q, 2 * ax, q, 2 * by, q];
}

/** Point on the core and outward normal at arc length `t` of the path `d` away from the core. */
function pathAt(t: number, ax: number, by: number, d: number) {
  const pieces = pathPieces(ax, by, d);
  const total = pieces.reduce((a, b) => a + b, 0) || 1;
  let s = ((t % total) + total) % total;
  let k = 0;
  while (k < 7 && s > pieces[k]) s -= pieces[k++];
  const corner = (cx: number, cy: number, phi0: number) => {
    const phi = phi0 + (d > 0 ? s / d : 0);
    const nx = Math.cos(phi);
    const ny = Math.sin(phi);
    return { qx: cx, qy: cy, nx, ny, tx: -ny, ty: nx };
  };
  switch (k) {
    case 0:
      return { qx: -ax + s, qy: -by, nx: 0, ny: -1, tx: 1, ty: 0 };
    case 1:
      return corner(ax, -by, -Math.PI / 2);
    case 2:
      return { qx: ax, qy: -by + s, nx: 1, ny: 0, tx: 0, ty: 1 };
    case 3:
      return corner(ax, by, 0);
    case 4:
      return { qx: ax - s, qy: by, nx: 0, ny: 1, tx: -1, ty: 0 };
    case 5:
      return corner(-ax, by, Math.PI / 2);
    case 6:
      return { qx: -ax, qy: by - s, nx: -1, ny: 0, tx: 0, ty: -1 };
    default:
      return corner(-ax, -by, Math.PI);
  }
}

/**
 * Arc length, along the path `d` away from the core, of the point nearest `p`.
 * Points already on that path stay where they are, so a block parked on the rim
 * slides along it instead of snapping to another side.
 */
function projectCore([px, py]: Point, ax: number, by: number, d: number): number {
  let qx = Math.max(-ax, Math.min(ax, px));
  let qy = Math.max(-by, Math.min(by, py));
  let dx = px - qx;
  let dy = py - qy;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    // Inside the core: use the nearest side.
    if (by - Math.abs(py) <= ax - Math.abs(px)) {
      dy = py < 0 ? -1 : 1;
      qy = py < 0 ? -by : by;
    } else {
      dx = px < 0 ? -1 : 1;
      qx = px < 0 ? -ax : ax;
    }
  }
  const pieces = pathPieces(ax, by, d);
  const before = (k: number) => pieces.slice(0, k).reduce((a, b) => a + b, 0);
  if (Math.abs(dx) < 1e-9) return dy < 0 ? qx + ax : before(4) + (ax - qx);
  if (Math.abs(dy) < 1e-9) return dx > 0 ? before(2) + (qy + by) : before(6) + (by - qy);
  let phi = Math.atan2(dy, dx);
  let piece = 1;
  let phi0 = -Math.PI / 2;
  if (dx > 0 && dy > 0) {
    piece = 3;
    phi0 = 0;
  } else if (dx < 0 && dy > 0) {
    piece = 5;
    phi0 = Math.PI / 2;
  } else if (dx < 0 && dy < 0) {
    piece = 7;
    phi0 = Math.PI;
    if (phi < 0) phi += Math.PI * 2;
  }
  return before(piece) + d * (phi - phi0);
}

/**
 * The path rows follow around a venue shape, in world space. `d` is the distance
 * from the shape's straight core; the drawn rim is at `d = rim`. Arc length `t`
 * runs clockwise from the top-left end of the top side, and is measured on the
 * path at that same `d`.
 */
export type VenuePath = {
  venue: SeatMapDecoration;
  rim: number;
  /** Half lengths of the straight sides. */
  ax: number;
  by: number;
  length: (d: number) => number;
  /** Point, outward normal and clockwise tangent. */
  at: (t: number, d: number) => { x: number; y: number; nx: number; ny: number; tx: number; ty: number };
  distance: (x: number, y: number) => number;
  project: (x: number, y: number, d: number) => number;
  /** Arc length at `d` whose point lies at this bearing (degrees clockwise from the top) from the centre. */
  atBearing: (bearing: number, d: number) => number;
  bearing: (x: number, y: number) => number;
};

export function venuePath(venue: SeatMapDecoration): VenuePath {
  const cos = Math.cos(toRad(venue.rotation));
  const sin = Math.sin(toRad(venue.rotation));
  const hw = venue.w / 2;
  const hh = venue.h / 2;
  const rim = Math.max(0, Math.min(venue.radius, hw, hh));
  const ax = hw - rim;
  const by = hh - rim;
  const local = (x: number, y: number): Point => {
    const dx = x - venue.x;
    const dy = y - venue.y;
    return [dx * cos + dy * sin, -dx * sin + dy * cos];
  };
  const length = (d: number) => pathPieces(ax, by, d).reduce((a, b) => a + b, 0);
  const at = (t: number, d: number) => {
    const p = pathAt(t, ax, by, d);
    const lx = p.qx + p.nx * d;
    const ly = p.qy + p.ny * d;
    return {
      x: venue.x + lx * cos - ly * sin,
      y: venue.y + lx * sin + ly * cos,
      nx: p.nx * cos - p.ny * sin,
      ny: p.nx * sin + p.ny * cos,
      tx: p.tx * cos - p.ty * sin,
      ty: p.tx * sin + p.ty * cos,
    };
  };
  const bearing = (x: number, y: number) => {
    const b = toDeg(Math.atan2(x - venue.x, -(y - venue.y)));
    return ((b % 360) + 360) % 360;
  };
  const atBearing = (target: number, d: number) => {
    const total = length(d);
    const want = ((target % 360) + 360) % 360;
    const err = (t: number) => {
      const p = at(t, d);
      return Math.abs(((bearing(p.x, p.y) - want + 540) % 360) - 180);
    };
    let best = 0;
    let bestErr = Infinity;
    const steps = 720;
    for (let k = 0; k < steps; k++) {
      const t = (total * k) / steps;
      const e = err(t);
      if (e < bestErr) {
        bestErr = e;
        best = t;
      }
    }
    let span = total / steps;
    for (let i = 0; i < 24; i++) {
      span /= 2;
      for (const t of [best - span, best + span]) {
        const e = err(t);
        if (e < bestErr) {
          bestErr = e;
          best = t;
        }
      }
    }
    return ((best % total) + total) % total;
  };
  return {
    venue,
    rim,
    ax,
    by,
    length,
    at,
    distance: (x, y) => coreDistance(local(x, y), ax, by),
    project: (x, y, d) => projectCore(local(x, y), ax, by, d),
    atBearing,
    bearing,
  };
}

/** Writes the section's bend or venue path into seat positions `from` to `to`, which hold the drawn rows. */
export function warpSeats(section: SeatMapSection, venues: readonly SeatMapDecoration[], xs: Coords, ys: Coords, from: number, to: number) {
  if (to <= from) return;
  const frame = blockFrame(section);
  const box = straightBox(frame, xs, ys, from, to);
  const warp = sectionWarp(section, venues, frame, box);
  if (!warp) return;
  for (let i = from; i < to; i++) {
    const [x, y] = warp(xs[i] * frame.ux + ys[i] * frame.uy, xs[i] * frame.vx + ys[i] * frame.vy);
    xs[i] = x;
    ys[i] = y;
  }
}

function straightBox(frame: Frame, xs: ArrayLike<number>, ys: ArrayLike<number>, from: number, to: number) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = from; i < to; i++) {
    const x = xs[i] * frame.ux + ys[i] * frame.uy;
    const y = xs[i] * frame.vx + ys[i] * frame.vy;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

/* ---------- outline that follows the seats ---------- */

/** Chairs an outline wraps. Omit it and every chair still drawn is included. */
export type OutlinePick = {
  rows?: ReadonlySet<string>;
  seats?: ReadonlyMap<string, ReadonlySet<number>>;
};

/**
 * A polygon around the rows: the front row, the row ends, the back row, the row starts.
 * It keeps the shape of the block (a parallelogram stays a parallelogram, a bend stays a bend)
 * and pushes out by `padding` = front, end, back, start.
 * A pick still warps from the whole block, so a few rows keep the curve they are drawn on.
 */
export function outlineOfSeats(section: SeatMapSection, venues: readonly SeatMapDecoration[], pick?: OutlinePick): Point[] {
  const live = section.rows.filter((r) => liveSeatCount(r) > 0);
  if (!live.length) return [];
  const frame = blockFrame(section);
  const straight = { ...section, rows: live };
  const { xs: sx, ys: sy, starts } = placeSection({ ...straight, bend: 0, follow: "off" }, venues);
  const { xs, ys } = placeSection(straight, venues);
  const box = straightBox(frame, sx, sy, 0, sx.length);
  const warp = sectionWarp(straight, venues, frame, box);
  const local = (i: number): Point => [sx[i] * frame.ux + sy[i] * frame.uy, sx[i] * frame.vx + sy[i] * frame.vy];
  // Toward the front of the block at a seat, after any bend: the warp of one unit forward.
  const forward = (i: number): Point => {
    if (!warp) return [-frame.vx, -frame.vy];
    const [x, y] = local(i);
    const a = warp(x, y);
    const b = warp(x, y - 1);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  };
  const along = (i: number): Point => {
    if (!warp) return [frame.ux, frame.uy];
    const [x, y] = local(i);
    const a = warp(x, y);
    const b = warp(x + 1, y);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  };

  // Rows front to back, and each row's live seats from the block's start to its end.
  const rows = live
    .map((row, ri) => {
      const gone = new Set(row.removed);
      const seats: number[] = [];
      for (let i = starts[ri]; i < starts[ri + 1]; i++) {
        const slot = i - starts[ri];
        if (gone.has(slot)) continue;
        if (pick && !pick.rows?.has(row.id) && !pick.seats?.get(row.id)?.has(slot)) continue;
        seats.push(i);
      }
      if (!seats.length) return null;
      seats.sort((a, b) => local(a)[0] - local(b)[0]);
      const depth = seats.reduce((n, i) => n + local(i)[1], 0) / seats.length;
      return { seats, depth };
    })
    .filter((row) => row !== null)
    .sort((a, b) => a.depth - b.depth);
  if (!rows.length) return [];

  // Padding is measured from the edge of the seat circles.
  const [padFront, padEnd, padBack, padStart] = section.padding.map((p) => p + SEAT_RADIUS);
  const out: Point[] = [];
  const push = (i: number, front: number, end: number) => {
    const f = forward(i);
    const e = along(i);
    out.push([xs[i] + f[0] * front + e[0] * end, ys[i] + f[1] * front + e[1] * end]);
  };
  const first = rows[0].seats;
  const last = rows[rows.length - 1].seats;
  first.forEach((i, k) => {
    if (k === 0) push(i, padFront, -padStart);
    if (k === first.length - 1) push(i, padFront, padEnd);
    else if (k > 0) push(i, padFront, 0);
  });
  for (let r = 1; r < rows.length - 1; r++) {
    const s = rows[r].seats;
    push(s[s.length - 1], 0, padEnd);
  }
  for (let k = last.length - 1; k >= 0; k--) {
    const i = last[k];
    if (k === last.length - 1) push(i, -padBack, padEnd);
    if (k === 0) push(i, -padBack, -padStart);
    else if (k < last.length - 1) push(i, -padBack, 0);
  }
  for (let r = rows.length - 2; r >= 1; r--) push(rows[r].seats[0], 0, -padStart);
  return simplifyOutline(out);
}

/** Drops corners that sit on a straight line, so long straight rows cost four points. */
function simplifyOutline(points: Point[]): Point[] {
  const round = (p: Point): Point => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
  let pts = points.filter((p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 0.01);
  if (pts.length > 3) {
    const kept: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = kept[kept.length - 1] ?? pts[pts.length - 1];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      if (distanceToSegment(b[0], b[1], a[0], a[1], c[0], c[1]) > 0.25) kept.push(b);
    }
    if (kept.length >= 3) pts = kept;
  }
  if (pts.length > 400) {
    const step = pts.length / 400;
    pts = Array.from({ length: 400 }, (_, k) => pts[Math.floor(k * step)]);
  }
  return pts.map(round);
}

/**
 * Re-wraps every section whose outline follows its seats. Cached per section object,
 * so an edit only re-wraps the sections it touched.
 */
const wrapped = new WeakMap<SeatMapSection, { venues: readonly SeatMapDecoration[]; out: SeatMapSection }>();

export function syncOutlines(doc: SeatMapDoc): SeatMapDoc {
  const venues = venuesOf(doc);
  let changed = false;
  const sections = doc.sections.map((s) => {
    if (s.outline !== "auto" || s.display !== "seats" || !s.rows.length) return s;
    const hit = wrapped.get(s);
    if (hit && sameVenues(hit.venues, venues, s)) return hit.out;
    const points = outlineOfSeats(s, venues);
    const out = points.length >= 3 && !samePoints(points, s.points) ? { ...s, points } : s;
    wrapped.set(s, { venues, out });
    if (out !== s) wrapped.set(out, { venues, out });
    if (out !== s) changed = true;
    return out;
  });
  return changed ? { ...doc, sections } : doc;
}

function sameVenues(a: readonly SeatMapDecoration[], b: readonly SeatMapDecoration[], s: SeatMapSection) {
  if (s.follow === "off") return true;
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function samePoints(a: readonly Point[], b: readonly (readonly [number, number])[]) {
  return a.length === b.length && a.every((p, i) => p[0] === b[i][0] && p[1] === b[i][1]);
}

/* ---------- aligning rows ---------- */

/** Slides rows along the first row's direction so their starts, middles or ends line up. Removed chairs are not part of the edge. */
export function alignRows(rows: SeatMapRow[], mode: "start" | "center" | "end"): Map<string, SeatMapRow> {
  const out = new Map<string, SeatMapRow>();
  const lines = rows.filter((r) => r.layout === "line" && liveSeatCount(r) > 0);
  if (lines.length < 2) return out;
  const ux = Math.cos(toRad(lines[0].rotation));
  const uy = Math.sin(toRad(lines[0].rotation));
  const spans = lines.flatMap((r) => {
    const xs: number[] = [];
    const ys: number[] = [];
    placeRow(r, xs, ys);
    const gone = new Set(r.removed);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < r.seats; i++) {
      if (gone.has(i)) continue;
      const t = xs[i] * ux + ys[i] * uy;
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    return lo <= hi ? [{ r, lo, hi }] : [];
  });
  if (spans.length < 2) return out;
  const minLo = Math.min(...spans.map((s) => s.lo));
  const maxHi = Math.max(...spans.map((s) => s.hi));
  const mid = (minLo + maxHi) / 2;
  for (const { r, lo, hi } of spans) {
    const shift = mode === "start" ? minLo - lo : mode === "end" ? maxHi - hi : mid - (lo + hi) / 2;
    if (Math.abs(shift) < 1e-4) continue;
    out.set(r.id, { ...r, x: Math.round((r.x + ux * shift) * 100) / 100, y: Math.round((r.y + uy * shift) * 100) / 100 });
  }
  return out;
}

type EdgeLine = { nx: number; ny: number; c: number };

/** Unit normal of the best-fit line through the points, `n · p = c`. */
function fitEdge(pts: readonly Point[]): EdgeLine | null {
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
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);
  return { nx, ny, c: nx * mx + ny * my };
}

/**
 * Lines the drawn chairs up. Straight rows slide in their own frame. A block wrapped
 * around a venue is moved until the chairs you see sit on one edge — equal stored
 * positions still fan out once the path bends.
 */
export function alignSectionRows(section: SeatMapSection, venues: readonly SeatMapDecoration[], rowIds: ReadonlySet<string>, mode: "start" | "center" | "end"): SeatMapSection {
  const picked = section.rows.filter((r) => rowIds.has(r.id) && r.layout === "line" && liveSeatCount(r) > 0);
  if (picked.length < 2) return section;
  if (section.follow === "off" || section.display !== "seats" || !venues.length) {
    const moved = alignRows(picked, mode);
    if (!moved.size) return section;
    return { ...section, rows: section.rows.map((r) => moved.get(r.id) ?? r) };
  }
  const ids = new Set(picked.map((r) => r.id));
  const base = picked[0];
  const ux = Math.cos(toRad(base.rotation));
  const uy = Math.sin(toRad(base.rotation));
  let rows = section.rows;
  let changed = false;
  for (let iter = 0; iter < 8; iter++) {
    const current = { ...section, rows };
    const placed = placeSection(current, venues);
    const refs = new Map<string, { at: number; x: number; y: number }>();
    const pts: Point[] = [];
    current.rows.forEach((row, ri) => {
      if (!ids.has(row.id)) return;
      const gone = new Set(row.removed);
      const count = placed.starts[ri + 1] - placed.starts[ri];
      const live: number[] = [];
      for (let i = 0; i < count; i++) if (!gone.has(i)) live.push(i);
      if (!live.length) return;
      const index = mode === "end" ? live[live.length - 1] : mode === "center" ? live[Math.floor(live.length / 2)] : live[0];
      const x = placed.xs[placed.starts[ri] + index];
      const y = placed.ys[placed.starts[ri] + index];
      refs.set(row.id, { at: placed.starts[ri] + index, x, y });
      pts.push([x, y]);
    });
    const line = fitEdge(pts);
    if (!line || refs.size < 2) return section;
    let maxDist = 0;
    for (const ref of refs.values()) maxDist = Math.max(maxDist, Math.abs(line.nx * ref.x + line.ny * ref.y - line.c));
    if (maxDist < 0.2) break;
    rows = rows.map((row) => {
      const ref = refs.get(row.id);
      if (!ref) return row;
      const dist = line.nx * ref.x + line.ny * ref.y - line.c;
      if (Math.abs(dist) < 0.15) return row;
      const nudged = placeSection(
        { ...current, rows: current.rows.map((r) => (r.id === row.id ? { ...r, x: r.x + ux, y: r.y + uy } : r)) },
        venues,
      );
      const ri = current.rows.findIndex((r) => r.id === row.id);
      const slot = ref.at - placed.starts[ri];
      const nx = nudged.xs[nudged.starts[ri] + slot] - ref.x;
      const ny = nudged.ys[nudged.starts[ri] + slot] - ref.y;
      const denom = nx * line.nx + ny * line.ny;
      if (Math.abs(denom) < 0.2) return row;
      const shift = Math.max(-30, Math.min(30, (-dist / denom) * 0.65));
      if (Math.abs(shift) < 1e-3) return row;
      changed = true;
      return { ...row, x: Math.round((row.x + ux * shift) * 100) / 100, y: Math.round((row.y + uy * shift) * 100) / 100 };
    });
  }
  return changed ? { ...section, rows } : section;
}

/** Chairs still drawn. A removed slot keeps its place but does not count. */
export function liveSeatCount(row: SeatMapRow): number {
  const gone = new Set(row.removed.filter((i) => i >= 0 && i < row.seats));
  return row.seats - gone.size;
}

export function seatCount(doc: SeatMapDoc): number {
  let n = 0;
  for (const s of doc.sections) for (const r of s.rows) n += liveSeatCount(r);
  return n;
}

export function sectionSeatCount(section: SeatMapSection): number {
  return section.rows.reduce((n, r) => n + liveSeatCount(r), 0);
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

/** Next label in the section's sequence: 1, 2, 3…, I, II, III… or A, B, C… */
export function nextRowLabel(section: SeatMapSection, numbering: SeatMapNumbering = DEFAULT_NUMBERING): string {
  const labels = section.rows.map((r) => r.label);
  const last = labels[labels.length - 1];
  if (!last) return rowLabelAt(numbering, 0);
  const { step, style } = numbering.rows;
  const taken = new Set(labels);
  let candidate = stepLabel(last, step, style);
  for (let i = 0; taken.has(candidate) && i < 1000; i++) candidate = stepLabel(candidate, step, style);
  return candidate;
}

/** Label of the n-th new row (0 is the first) under the venue's numbering defaults. */
export function rowLabelAt(numbering: SeatMapNumbering, n: number): string {
  const { style, from, step } = numbering.rows;
  const value = from + n * step;
  if (style === "roman") return toRoman(Math.max(1, value));
  if (style === "letters") return fromLetters(Math.max(1, value));
  return String(Math.max(0, value));
}

/** Labels for `count` new rows, front to back, honouring the "count from the back" default. */
export function rowLabels(numbering: SeatMapNumbering, count: number): string[] {
  const labels = Array.from({ length: count }, (_, n) => rowLabelAt(numbering, n));
  return numbering.rows.reverse ? labels.reverse() : labels;
}

/** Seat numbering fields for a new row. */
export function seatDefaults(numbering: SeatMapNumbering): Pick<SeatMapRow, "start" | "step" | "reverse"> {
  return { start: numbering.seats.from, step: numbering.seats.step, reverse: numbering.seats.reverse };
}

/** First few labels, for the numbering preview. */
export function numberingPreview(kind: "rows" | "seats", numbering: SeatMapNumbering): string {
  if (kind === "rows") return [0, 1, 2, 3].map((n) => rowLabelAt({ ...numbering, rows: { ...numbering.rows, reverse: false } }, n)).join(", ") + "…";
  const { from, step } = numbering.seats;
  return [0, 1, 2, 3].map((n) => (from + n * step).toLocaleString("en")).join(", ") + "…";
}

const ROMAN: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

function toRoman(n: number): string {
  let out = "";
  for (const [value, glyph] of ROMAN) {
    while (n >= value) {
      out += glyph;
      n -= value;
    }
  }
  return out;
}

function fromRoman(s: string): number | null {
  if (!/^[MDCLXVI]+$/.test(s)) return null;
  let n = 0;
  let rest = s;
  for (const [value, glyph] of ROMAN) {
    while (rest.startsWith(glyph)) {
      n += value;
      rest = rest.slice(glyph.length);
    }
  }
  return toRoman(n) === s ? n : null;
}

export function stepLabel(label: string, by: number, style?: SeatMapNumbering["rows"]["style"]): string {
  if (style === "roman") {
    const n = fromRoman(label);
    if (n !== null) return toRoman(Math.max(1, n + by));
  }
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
    step: 1,
    reverse: false,
    gaps: [],
    spread: "packed",
    layout: "line",
    boxW: 0,
    boxH: 0,
    wheelchair: [],
    removed: [],
    numbers: [],
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
    loose: false,
    rows: [],
    bend: 0,
    follow: "off",
    face: "auto",
    outline: "auto",
    padding: [3, 3, 3, 3],
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

/** Changes a table's top. The chairs are laid out again around the new size. */
export function resizeTable(section: SeatMapSection, x: number, y: number, w: number, h: number): SeatMapSection {
  const row = section.rows[0];
  if (!row || (section.display !== "round-table" && section.display !== "rect-table")) return section;
  const round = section.display === "round-table";
  const boxW = Math.max(16, w);
  const boxH = round ? boxW : Math.max(16, h);
  const points = round ? circlePoints(x, y, boxW / 2 + SEAT_RADIUS + 3, 20) : rectPoints(x, y, boxW + (SEAT_RADIUS + 2) * 2, boxH + (SEAT_RADIUS + 2) * 2);
  return { ...section, points, rows: [{ ...row, x, y, boxW, boxH }] };
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
/** A polygon that wraps seat centres, pushed out so the discs sit inside it. */
export function outlineAround(seats: readonly Point[], pad = SEAT_RADIUS * 2.6): Point[] {
  if (!seats.length) return [];
  const hull = convexHull(seats);
  if (hull.length < 3) {
    const b = boundsOf(seats);
    return [
      [b.minX - pad, b.minY - pad],
      [b.maxX + pad, b.minY - pad],
      [b.maxX + pad, b.maxY + pad],
      [b.minX - pad, b.maxY + pad],
    ];
  }
  const n = hull.length;
  return hull.map((cur, i) => {
    const prev = hull[(i + n - 1) % n];
    const next = hull[(i + 1) % n];
    const ax = cur[0] - prev[0];
    const ay = cur[1] - prev[1];
    const bx = next[0] - cur[0];
    const by = next[1] - cur[1];
    const al = Math.hypot(ax, ay) || 1;
    const bl = Math.hypot(bx, by) || 1;
    let nx = ay / al + by / bl;
    let ny = -ax / al - bx / bl;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    return [Math.round((cur[0] + nx * pad) * 100) / 100, Math.round((cur[1] + ny * pad) * 100) / 100] as Point;
  });
}

function convexHull(points: readonly Point[]): Point[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const unique: Point[] = [];
  for (const p of pts) {
    const last = unique[unique.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) unique.push(p);
  }
  if (unique.length < 3) return unique;
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

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
    removed: [],
    numbers: [],
    step: 1,
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
    removed: [],
    numbers: [],
    step: 1,
  };
}

/**
 * Change how many seats a row holds.
 * Packed keeps today's gap, so the row grows or shrinks from its middle.
 * Edge to edge keeps the same length and shares it evenly.
 */
export function applySeatCount(row: SeatMapRow, seats: number, spread: "packed" | "edge"): SeatMapRow {
  const count = Math.max(1, Math.min(MAX_SEATS_PER_ROW, Math.round(seats)));
  const kept = row.removed.filter((i) => i >= 0 && i < count);
  const removed = kept.length >= count ? [] : kept;
  if (row.layout !== "line") return { ...row, seats: count, spread, removed, numbers: [] };
  if (spread === "edge" && count > 1 && row.seats > 1) {
    const pitch = Math.min(60, Math.max(SEAT_RADIUS * 2, rowLength(row) / (count - 1)));
    return { ...row, seats: count, spread, pitch: Math.round(pitch * 100) / 100, removed, numbers: [] };
  }
  return { ...row, seats: count, spread: "packed", removed, numbers: [] };
}

export type RowPlan = { seats: number; spread: "packed" | "edge" };

/**
 * Straight rows filling a section from its top-left corner to its bottom-right.
 * The count is exact: seats share the width, rows share the height.
 */
export function fillSectionGrid(section: SeatMapSection, rowCount: number, perRow: number, numbering: SeatMapNumbering = DEFAULT_NUMBERING): { rows: SeatMapRow[] } | { error: string } {
  const rowsN = Math.max(1, Math.min(MAX_ROWS_PER_SECTION, Math.round(rowCount)));
  const seatsN = Math.max(1, Math.min(MAX_SEATS_PER_ROW, Math.round(perRow)));
  const b = boundsOf(section.points);
  const pad = SEAT_RADIUS + 1;
  const left = b.minX + pad;
  const right = b.maxX - pad;
  const top = b.minY + pad;
  const bottom = b.maxY - pad;
  if (right < left || bottom < top) return { error: "This section is too small for a seat." };
  const pitch = seatsN === 1 ? DEFAULT_SEAT_PITCH : (right - left) / (seatsN - 1);
  const rowPitch = rowsN === 1 ? 0 : (bottom - top) / (rowsN - 1);
  if (seatsN > 1 && pitch < SEAT_RADIUS * 2 - 1e-6) return { error: "Too many seats for the width of this section." };
  if (seatsN > 1 && pitch > 60) return { error: "Too few seats for the width of this section." };
  if (rowsN > 1 && rowPitch < SEAT_RADIUS * 2 - 1e-6) return { error: "Too many rows for the height of this section." };
  const x = (left + right) / 2;
  const seatPitch = seatsN === 1 ? DEFAULT_SEAT_PITCH : Math.max(SEAT_RADIUS * 2, Math.round(pitch * 100) / 100);
  const labels = rowLabels(numbering, rowsN);
  const rows = labels.map((label, i) =>
    makeRow({
      ...seatDefaults(numbering),
      label,
      seats: seatsN,
      x,
      y: rowsN === 1 ? (top + bottom) / 2 : top + i * rowPitch,
      rotation: 0,
      curve: 0,
      pitch: seatPitch,
      spread: "packed",
      layout: "line",
    }),
  );
  return { rows };
}

export const round2 = ([x, y]: Point): Point => [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
