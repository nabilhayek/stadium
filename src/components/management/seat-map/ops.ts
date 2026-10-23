import {
  boundsOf,
  boxCorners,
  centroid,
  makeSection,
  moveAlongVenue,
  moveDecoration,
  movePoi,
  moveRow,
  moveSection,
  nextSectionCode,
  outlineAround,
  alignSectionRows,
  applyRigid,
  liveSeatCount,
  outlineOfSeats,
  placeSection,
  placeRow,
  sectionFrame,
  syncOutlines,
  venuesOf,
  renumberRow,
  seatNumber,
  stepLabel,
  translation,
  unionBounds,
  type Bounds,
  type Point,
  type Rigid,
} from "@/lib/seatmap/geometry";
import { decorationWidth, type Scene } from "@/lib/seatmap/engine/scene";
import { newId, SEAT_RADIUS, type SeatMapDecoration, type SeatMapDoc, type SeatMapPoi, type SeatMapRow, type SeatMapSection } from "@/lib/seatmap/schema";

/** Selection keys: `s:` section, `r:` row, `c:` one seat, `d:` decoration, `p:` point of interest. */
export type SelKey = `${"s" | "r" | "c" | "d" | "p"}:${string}`;
export type Selection = ReadonlySet<string>;
export type SeatPick = { rowId: string; index: number };

export const keyOf = (kind: "s" | "r" | "d" | "p", id: string) => `${kind}:${id}` as SelKey;

/** One chair in a row. `index` is the slot, so later seats keep their key when one is removed. */
export const seatKey = (rowId: string, index: number) => `c:${rowId}:${index}` as SelKey;

export function seatPick(key: string): SeatPick | null {
  if (!key.startsWith("c:")) return null;
  const cut = key.lastIndexOf(":");
  if (cut <= 2) return null;
  const index = Number(key.slice(cut + 1));
  if (!Number.isInteger(index) || index < 0) return null;
  return { rowId: key.slice(2, cut), index };
}

export function splitSelection(sel: Selection) {
  const sections = new Set<string>();
  const rows = new Set<string>();
  const decorations = new Set<string>();
  const pois = new Set<string>();
  const seats: SeatPick[] = [];
  for (const key of sel) {
    const seat = seatPick(key);
    if (seat) {
      seats.push(seat);
      continue;
    }
    const id = key.slice(2);
    if (key.startsWith("s:")) sections.add(id);
    else if (key.startsWith("r:")) rows.add(id);
    else if (key.startsWith("d:")) decorations.add(id);
    else if (key.startsWith("p:")) pois.add(id);
  }
  return { sections, rows, decorations, pois, seats };
}

/**
 * Scene indices for the engine's drag preview. A row moves when it is selected,
 * and also when every chair still drawn in it is selected, so a box around a
 * block drags the block. Chairs picked out of a row move on their own.
 */
export function transientOf(scene: Scene, sel: Selection) {
  const parts = splitSelection(sel);
  const sections = new Set<number>();
  for (const id of parts.sections) {
    const i = scene.sectionIndex.get(id);
    if (i !== undefined) sections.add(i);
  }
  const rows = new Set<number>();
  for (const id of parts.rows) {
    const i = scene.rowIndex.get(id);
    if (i !== undefined && !sections.has(scene.rows[i].section)) rows.add(i);
  }
  const wanted = new Map<number, number>();
  for (const seat of parts.seats) {
    const ri = scene.rowIndex.get(seat.rowId);
    if (ri === undefined || rows.has(ri) || sections.has(scene.rows[ri].section)) continue;
    wanted.set(ri, (wanted.get(ri) ?? 0) + 1);
  }
  const seats: number[] = [];
  for (const [ri, count] of wanted) {
    const row = scene.rows[ri];
    let live = 0;
    for (let i = row.seatStart; i < row.seatEnd; i++) if (scene.seatLive[i]) live++;
    if (live > 0 && count >= live) rows.add(ri);
    else {
      for (const seat of parts.seats) {
        if (seat.rowId !== row.id) continue;
        const i = row.seatStart + seat.index;
        if (i >= row.seatStart && i < row.seatEnd && scene.seatLive[i]) seats.push(i);
      }
    }
  }
  return { sections, rows, decorations: parts.decorations, pois: parts.pois, seats };
}

/** Rows fully covered by picked chairs, and chairs picked out of a row that stays put. */
function coveredSeats(doc: SeatMapDoc, parts: ReturnType<typeof splitSelection>) {
  const picked = new Map<string, Set<number>>();
  for (const seat of parts.seats) {
    if (parts.rows.has(seat.rowId)) continue;
    const set = picked.get(seat.rowId) ?? new Set<number>();
    set.add(seat.index);
    picked.set(seat.rowId, set);
  }
  const full = new Set<string>();
  const partial = new Map<string, Set<number>>();
  if (!picked.size) return { full, partial };
  for (const s of doc.sections) {
    if (parts.sections.has(s.id)) continue;
    for (const r of s.rows) {
      const set = picked.get(r.id);
      if (!set) continue;
      const gone = new Set(r.removed);
      let live = 0;
      let hit = 0;
      for (let i = 0; i < r.seats; i++) {
        if (gone.has(i)) continue;
        live++;
        if (set.has(i)) hit++;
      }
      if (live > 0 && hit >= live) full.add(r.id);
      else if (hit > 0) partial.set(r.id, set);
    }
  }
  return { full, partial };
}

/** Keeps the picked chairs on the row they already have, and leaves the rest behind as a new row. */
function partitionRow(row: SeatMapRow, picked: ReadonlySet<number>): { stay: SeatMapRow | null; moving: SeatMapRow } {
  const chosen: number[] = [];
  const rest: number[] = [];
  const gone = new Set(row.removed);
  for (let i = 0; i < row.seats; i++) {
    if (gone.has(i)) continue;
    (picked.has(i) ? chosen : rest).push(i);
  }
  const block = (keep: number[]): SeatMapRow => {
    const keepSet = new Set(keep);
    const removed: number[] = [];
    for (let i = 0; i < row.seats; i++) if (!keepSet.has(i)) removed.push(i);
    const nums = new Set(keep.map((i) => seatNumber(row, i)));
    return { ...row, removed, wheelchair: row.wheelchair.filter((n) => nums.has(n)) };
  };
  if (!rest.length) return { stay: null, moving: row };
  return { stay: { ...block(rest), id: newId("r") }, moving: block(chosen) };
}

/** A point the rest of a selection can hang onto: the rows, or the outline when there are none. */
function sectionCenter(section: SeatMapSection): Point {
  if (!section.rows.length) return centroid(section.points);
  let x = 0;
  let y = 0;
  for (const row of section.rows) {
    x += row.x;
    y += row.y;
  }
  return [x / section.rows.length, y / section.rows.length];
}

/** Shortest turn from one heading to another, in degrees. */
function turn(from: number, to: number) {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

export function transformSelection(doc: SeatMapDoc, sel: Selection, t: Rigid): SeatMapDoc {
  const parts = splitSelection(sel);
  const { full, partial } = coveredSeats(doc, parts);
  const venues = venuesOf(doc);
  // A section on the venue path bends as it slides. Anything selected with it
  // keeps its place beside that section, including the turn a corner adds,
  // instead of sliding off in a straight line.
  const leaders =
    Math.abs(t.angle) > 1e-6
      ? []
      : doc.sections.filter((s) => parts.sections.has(s.id) && s.follow !== "off" && s.display === "seats" && s.rows.length > 0);
  const along = new Map<string, SeatMapSection>();
  const rides = new Map<string, Rigid>();
  for (const section of leaders) {
    const before = sectionFrame(section, venues);
    if (!before) continue;
    const next = moveAlongVenue(section, venues, t.dx, t.dy);
    const after = sectionFrame(next, venues);
    if (!after) continue;
    along.set(section.id, next);
    rides.set(section.id, { angle: turn(before.angle, after.angle), px: before.x, py: before.y, dx: after.x - before.x, dy: after.y - before.y });
  }
  const rideFor = (x: number, y: number): Rigid => {
    let best: Rigid | null = null;
    let bestD = Infinity;
    for (const section of leaders) {
      const ride = rides.get(section.id);
      const frame = sectionFrame(section, venues);
      if (!ride || !frame) continue;
      const d = Math.hypot(frame.x - x, frame.y - y);
      if (d < bestD) {
        bestD = d;
        best = ride;
      }
    }
    return best ?? t;
  };
  return {
    ...doc,
    sections: doc.sections.map((s) => {
      const led = along.get(s.id);
      if (led) return led;
      if (parts.sections.has(s.id)) {
        const [cx, cy] = sectionCenter(s);
        return moveDraggedSection(s, venues, rideFor(cx, cy));
      }
      if (!s.rows.some((r) => parts.rows.has(r.id) || full.has(r.id) || partial.has(r.id))) return s;
      const taken = new Set(s.rows.map((r) => r.label));
      let label = s.rows[s.rows.length - 1]?.label ?? "1";
      const retitle = (row: SeatMapRow) => {
        let next = label;
        do next = stepLabel(next, 1);
        while (taken.has(next));
        label = next;
        taken.add(next);
        return { ...row, label: next };
      };
      return {
        ...s,
        rows: s.rows.flatMap((r) => {
          const motion = rideFor(r.x, r.y);
          if (parts.rows.has(r.id) || full.has(r.id)) return [moveRow(r, motion)];
          const picks = partial.get(r.id);
          if (!picks) return [r];
          const { stay, moving } = partitionRow(r, picks);
          return stay ? [moveRow(moving, motion), retitle(stay)] : [moveRow(moving, motion)];
        }),
      };
    }),
    decorations: doc.decorations.map((d) => (parts.decorations.has(d.id) ? moveDecoration(d, rideFor(d.x, d.y)) : d)),
    pois: doc.pois.map((p) => (parts.pois.has(p.id) ? movePoi(p, rideFor(p.x, p.y)) : p)),
  };
}

/** A following section slides on the venue path. Anything else moves in a straight line. */
function moveDraggedSection(section: SeatMapSection, venues: readonly SeatMapDecoration[], t: Rigid): SeatMapSection {
  if (section.follow === "off" || Math.abs(t.angle) > 1e-6 || section.display !== "seats" || !section.rows.length || !venues.length) return moveSection(section, t);
  return moveAlongVenue(section, venues, t.dx, t.dy);
}

export type DragPreview = {
  x: Float32Array;
  y: Float32Array;
  /** 1 where `x`/`y` replace the rigid preview, because the seats were warped again. */
  live: Uint8Array;
  outlines: Map<number, Point[]>;
  /** Poses for objects that turn with a section instead of sliding in a straight line. */
  rides: Map<string, { x: number; y: number; rotation: number }>;
};

/**
 * Seat positions and section outlines for the frame being dragged. A section that
 * follows a venue shape is wrapped again at the dragged spot, and an outline set
 * to follow the seats is rebuilt, so both are visible before the pointer goes up.
 */
export function dragPreview(doc: SeatMapDoc, scene: Scene, sel: Selection, t: Rigid): DragPreview | null {
  const venues = venuesOf(doc);
  const needs = doc.sections.some((s) => s.display === "seats" && s.rows.length && (s.outline === "auto" || (s.follow !== "off" && venues.length > 0)));
  if (!needs) return null;
  const next = syncOutlines(transformSelection(doc, sel, t));
  const movedVenue = next.decorations.some((d, i) => d !== doc.decorations[i] && (d.kind === "venue" || doc.decorations[i]?.kind === "venue"));
  const nextVenues = movedVenue ? venuesOf(next) : venues;
  const live = new Uint8Array(scene.seatCount);
  const x = new Float32Array(scene.seatCount);
  const y = new Float32Array(scene.seatCount);
  const outlines = new Map<number, Point[]>();
  const rides = new Map<string, { x: number; y: number; rotation: number }>();
  next.decorations.forEach((d, i) => {
    const prev = doc.decorations[i];
    if (!prev || prev.id !== d.id || (prev.x === d.x && prev.y === d.y && prev.rotation === d.rotation)) return;
    rides.set(`d:${d.id}`, { x: d.x, y: d.y, rotation: d.rotation });
  });
  next.pois.forEach((p, i) => {
    const prev = doc.pois[i];
    if (!prev || prev.id !== p.id || (prev.x === p.x && prev.y === p.y && prev.rotation === p.rotation)) return;
    rides.set(`p:${p.id}`, { x: p.x, y: p.y, rotation: p.rotation });
  });
  next.sections.forEach((s, i) => {
    if (s.display !== "round-table" && s.display !== "rect-table") return;
    const row = s.rows[0];
    const old = doc.sections[i]?.rows[0];
    if (!row || !old || (row.x === old.x && row.y === old.y && row.rotation === old.rotation)) return;
    rides.set(`s:${s.id}`, { x: row.x, y: row.y, rotation: row.rotation });
  });
  let any = rides.size > 0;
  next.sections.forEach((s, si) => {
    const prev = doc.sections[si];
    const shown = scene.sections[si];
    if (!prev || !shown || prev.id !== s.id || shown.id !== s.id || s.display !== "seats") return;
    const shifted = s.rows.length === prev.rows.length && s.rows.some((r, i) => r !== prev.rows[i]);
    const warps = s.follow !== "off" && nextVenues.length > 0 && (shifted || movedVenue);
    if ((warps || (rides.size > 0 && shifted)) && shown.seatEnd - shown.seatStart === s.rows.reduce((n, r) => n + r.seats, 0)) {
      const placed = placeSection(s, nextVenues);
      for (let i = 0; i < placed.xs.length; i++) {
        const at = shown.seatStart + i;
        x[at] = placed.xs[i];
        y[at] = placed.ys[i];
        live[at] = 1;
      }
      any = true;
    }
    if (s.points !== prev.points) {
      outlines.set(si, s.points as Point[]);
      any = true;
    }
  });
  if (!any) return null;
  return { x, y, live, outlines, rides };
}

function omitSeats(row: SeatMapRow, drop: ReadonlySet<number>): SeatMapRow[] {
  const removed = [...new Set([...row.removed, ...drop])].filter((i) => i >= 0 && i < row.seats).sort((a, b) => a - b);
  if (removed.length >= row.seats) return [];
  const gone = new Set<number>();
  for (const i of drop) if (i >= 0 && i < row.seats) gone.add(seatNumber(row, i));
  return [{ ...row, removed, wheelchair: row.wheelchair.filter((n) => !gone.has(n)) }];
}

export function deleteSelection(doc: SeatMapDoc, sel: Selection): SeatMapDoc {
  const parts = splitSelection(sel);
  const byRow = new Map<string, Set<number>>();
  for (const seat of parts.seats) {
    if (parts.rows.has(seat.rowId)) continue;
    const set = byRow.get(seat.rowId) ?? new Set<number>();
    set.add(seat.index);
    byRow.set(seat.rowId, set);
  }
  return {
    ...doc,
    sections: doc.sections
      .filter((s) => !parts.sections.has(s.id))
      .map((s) => {
        const touches = s.rows.some((r) => parts.rows.has(r.id) || byRow.has(r.id));
        if (!touches) return s;
        return {
          ...s,
          rows: s.rows.flatMap((r) => {
            if (parts.rows.has(r.id)) return [];
            const drop = byRow.get(r.id);
            return drop ? omitSeats(r, drop) : [r];
          }),
        };
      })
      .filter((s) => !(s.loose && s.rows.length === 0)),
    decorations: doc.decorations.filter((d) => !parts.decorations.has(d.id)),
    pois: doc.pois.filter((p) => !parts.pois.has(p.id)),
  };
}

/** Rewrites the printed numbers of these rows so the chairs that remain run start, start + 1, … */
export function renumberRows(doc: SeatMapDoc, ids: ReadonlySet<string>): SeatMapDoc {
  return updateRows(doc, ids, (r) => renumberRow(r));
}

/** Turns unassigned rows into one section whose outline follows the seats. */
export function groupRowsAsSection(doc: SeatMapDoc, rowIds: ReadonlySet<string>): { doc: SeatMapDoc; sectionId: string } | null {
  const picked: SeatMapRow[] = [];
  let categoryId: string | null = null;
  for (const s of doc.sections) {
    if (!s.loose) continue;
    for (const r of s.rows) {
      if (!rowIds.has(r.id)) continue;
      picked.push(r);
      categoryId ??= s.categoryId;
    }
  }
  if (!picked.length) return null;
  const pts: Point[] = [];
  const xs = new Float32Array(512);
  const ys = new Float32Array(512);
  for (const r of picked) {
    const n = placeRow(r, xs, ys);
    const gone = new Set(r.removed);
    for (let i = 0; i < n; i++) if (!gone.has(i)) pts.push([xs[i], ys[i]]);
  }
  const points = outlineAround(pts);
  if (points.length < 3) return null;
  const section = makeSection(doc, points, categoryId ?? doc.categories[0]?.id ?? null);
  const taken = new Set<string>();
  section.rows = picked.map((r) => {
    let label = r.label;
    while (taken.has(label)) label = stepLabel(label, 1);
    taken.add(label);
    return { ...r, label };
  });
  const kept = doc.sections
    .map((s) => (s.loose ? { ...s, rows: s.rows.filter((r) => !rowIds.has(r.id)) } : s))
    .filter((s) => !(s.loose && s.rows.length === 0));
  return { doc: { ...doc, sections: [...kept, section] }, sectionId: section.id };
}

/** Copies sit 2 m down-right. Sections get fresh codes; rows get the next free labels. */
export function duplicateSelection(doc: SeatMapDoc, sel: Selection): { doc: SeatMapDoc; selection: Set<string> } {
  const parts = splitSelection(sel);
  const shift = translation(20, 20);
  const next = new Set<string>();
  let out: SeatMapDoc = doc;

  for (const s of doc.sections) {
    if (!parts.sections.has(s.id)) continue;
    const code = nextSectionCode(out);
    const copy = moveSection({ ...s, id: newId("s"), code, name: s.name.replace(s.code, code), rows: s.rows.map((r) => ({ ...r, id: newId("r") })) }, shift);
    out = { ...out, sections: [...out.sections, copy] };
    next.add(keyOf("s", copy.id));
  }

  out = {
    ...out,
    sections: out.sections.map((s) => {
      const picked = s.rows.filter((r) => parts.rows.has(r.id) && !parts.sections.has(s.id));
      if (!picked.length) return s;
      const taken = new Set(s.rows.map((r) => r.label));
      let label = s.rows[s.rows.length - 1]?.label ?? "1";
      const copies = picked.map((r) => {
        do label = stepLabel(label, 1);
        while (taken.has(label));
        taken.add(label);
        const copy = moveRow({ ...r, id: newId("r"), label }, translation(0, 8));
        next.add(keyOf("r", copy.id));
        return copy;
      });
      return { ...s, rows: [...s.rows, ...copies] };
    }),
  };

  const decorations = doc.decorations.filter((d) => parts.decorations.has(d.id)).map((d) => moveDecoration({ ...d, id: newId("d") }, shift));
  const pois = doc.pois.filter((p) => parts.pois.has(p.id)).map((p) => movePoi({ ...p, id: newId("p") }, shift));
  for (const d of decorations) next.add(keyOf("d", d.id));
  for (const p of pois) next.add(keyOf("p", p.id));
  return { doc: { ...out, decorations: [...out.decorations, ...decorations], pois: [...out.pois, ...pois] }, selection: next };
}

/**
 * The blue selection frame for a block of seats. A whole section uses the outline
 * already drawn around it, so the frame follows the curve instead of a rectangle.
 * A few rows or chairs get the same outline, still bent with the block they sit in.
 */
export function selectionOutline(
  doc: SeatMapDoc,
  scene: Scene,
  sel: Selection,
  drag: { transform: Rigid; outlines: ReadonlyMap<number, readonly Point[]> | null } | null = null,
): Point[] | null {
  const parts = splitSelection(sel);
  if (parts.decorations.size || parts.pois.size || parts.sections.size > 1) return null;
  if (!parts.sections.size && !parts.rows.size && !parts.seats.length) return null;

  const sectionIdOf = (rowId: string) => {
    const ri = scene.rowIndex.get(rowId);
    return ri === undefined ? null : scene.sections[scene.rows[ri].section].id;
  };
  let sectionId: string | null = parts.sections.size === 1 ? [...parts.sections][0] : null;
  if (!sectionId) {
    const ids = new Set<string>();
    for (const id of parts.rows) {
      const sid = sectionIdOf(id);
      if (sid) ids.add(sid);
    }
    for (const seat of parts.seats) {
      const sid = sectionIdOf(seat.rowId);
      if (sid) ids.add(sid);
    }
    if (ids.size !== 1) return null;
    sectionId = [...ids][0];
  } else if (parts.rows.size || parts.seats.length) {
    return null;
  }

  const si = scene.sectionIndex.get(sectionId);
  const section = doc.sections.find((s) => s.id === sectionId);
  if (si === undefined || !section) return null;

  const covers = (row: SeatMapRow) => {
    if (parts.sections.has(section.id) || parts.rows.has(row.id)) return true;
    const gone = new Set(row.removed);
    let live = 0;
    let hit = 0;
    for (let i = 0; i < row.seats; i++) {
      if (gone.has(i)) continue;
      live++;
      if (parts.seats.some((seat) => seat.rowId === row.id && seat.index === i)) hit++;
    }
    return live > 0 && hit >= live;
  };
  const whole = section.rows.every((row) => liveSeatCount(row) === 0 || covers(row));
  const dragged = whole ? drag?.outlines?.get(si) : undefined;
  if (dragged && dragged.length >= 3) return dragged as Point[];

  let points: readonly Point[];
  if (whole && section.points.length >= 3) points = section.points;
  else if (section.display === "seats" && section.rows.length) {
    const rows = new Set(parts.rows);
    const seats = new Map<string, Set<number>>();
    for (const seat of parts.seats) {
      if (rows.has(seat.rowId) || parts.sections.has(section.id)) continue;
      const set = seats.get(seat.rowId) ?? new Set<number>();
      set.add(seat.index);
      seats.set(seat.rowId, set);
    }
    points = outlineOfSeats(section, venuesOf(doc), { rows, seats });
  } else points = section.points;
  if (points.length < 3) return null;
  return drag ? points.map(([x, y]) => applyRigid(drag.transform, x, y)) : [...points];
}

export function selectionBounds(scene: Scene, sel: Selection): Bounds | null {
  let b: Bounds | null = null;
  for (const key of sel) {
    const id = key.slice(2);
    if (key.startsWith("s:")) {
      const i = scene.sectionIndex.get(id);
      if (i === undefined) continue;
      const s = scene.sections[i];
      if (s.rowEnd > s.rowStart) {
        for (let r = s.rowStart; r < s.rowEnd; r++) b = unionBounds(b, scene.rows[r].bounds);
      } else b = unionBounds(b, s.bounds);
    } else if (key.startsWith("r:")) {
      const i = scene.rowIndex.get(id);
      if (i !== undefined) b = unionBounds(b, scene.rows[i].bounds);
    } else if (key.startsWith("c:")) {
      const seat = seatPick(key);
      const ri = seat ? scene.rowIndex.get(seat.rowId) : undefined;
      if (seat && ri !== undefined) {
        const row = scene.rows[ri];
        const i = row.seatStart + seat.index;
        if (i >= row.seatStart && i < row.seatEnd && scene.seatLive[i]) {
          const x = scene.seatX[i];
          const y = scene.seatY[i];
          b = unionBounds(b, { minX: x - SEAT_RADIUS, minY: y - SEAT_RADIUS, maxX: x + SEAT_RADIUS, maxY: y + SEAT_RADIUS });
        }
      }
    } else if (key.startsWith("d:")) {
      const d = scene.decorations.find((x) => x.id === id);
      if (d) b = unionBounds(b, boundsOf(boxCorners(d.x, d.y, decorationWidth(d), d.h, d.rotation)));
    } else if (key.startsWith("p:")) {
      const p = scene.pois.find((x) => x.id === id);
      if (p) {
        b = unionBounds(
          b,
          p.w > 0 && p.h > 0
            ? boundsOf(boxCorners(p.x, p.y, p.w, p.h, p.rotation))
            : { minX: p.x - 6, minY: p.y - 6, maxX: p.x + 6, maxY: p.y + 6 },
        );
      }
    }
  }
  return b;
}

export function findRow(doc: SeatMapDoc, rowId: string): { section: SeatMapSection; row: SeatMapRow } | null {
  for (const section of doc.sections) {
    const row = section.rows.find((r) => r.id === rowId);
    if (row) return { section, row };
  }
  return null;
}

export function updateSection(doc: SeatMapDoc, id: string, patch: (s: SeatMapSection) => SeatMapSection): SeatMapDoc {
  return { ...doc, sections: doc.sections.map((s) => (s.id === id ? patch(s) : s)) };
}

export function updateRows(doc: SeatMapDoc, ids: ReadonlySet<string>, patch: (r: SeatMapRow, index: number) => SeatMapRow): SeatMapDoc {
  let index = 0;
  return {
    ...doc,
    sections: doc.sections.map((s) => (s.rows.some((r) => ids.has(r.id)) ? { ...s, rows: s.rows.map((r) => (ids.has(r.id) ? patch(r, index++) : r)) } : s)),
  };
}

export function updateDecoration(doc: SeatMapDoc, id: string, patch: Partial<SeatMapDecoration>): SeatMapDoc {
  return { ...doc, decorations: doc.decorations.map((d) => (d.id === id ? { ...d, ...patch } : d)) };
}

export function updatePoi(doc: SeatMapDoc, id: string, patch: Partial<SeatMapPoi>): SeatMapDoc {
  return { ...doc, pois: doc.pois.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

/** Hand-placed corners: the outline stops following the seats. */
export function setSectionPoints(doc: SeatMapDoc, id: string, points: Point[]): SeatMapDoc {
  return updateSection(doc, id, (s) => ({ ...s, points, outline: "drawn" }));
}

/** Lines up rows by their first seat, middle or last seat, including after they wrap a venue. */
export function alignSelectedRows(doc: SeatMapDoc, rowIds: ReadonlySet<string>, mode: "start" | "center" | "end"): SeatMapDoc {
  const venues = venuesOf(doc);
  return { ...doc, sections: doc.sections.map((s) => alignSectionRows(s, venues, rowIds, mode)) };
}

/** Marks or clears picked seats as wheelchair places. Seats are matched by their printed number. */
export function setWheelchair(doc: SeatMapDoc, seats: readonly SeatPick[], on: boolean): SeatMapDoc {
  const byRow = new Map<string, Set<number>>();
  for (const p of seats) {
    const set = byRow.get(p.rowId) ?? new Set<number>();
    set.add(p.index);
    byRow.set(p.rowId, set);
  }
  return {
    ...doc,
    sections: doc.sections.map((s) => {
      if (!s.rows.some((r) => byRow.has(r.id))) return s;
      return {
        ...s,
        rows: s.rows.map((r) => {
          const slots = byRow.get(r.id);
          if (!slots) return r;
          const numbers = new Set([...slots].map((i) => seatNumber(r, i)));
          const rest = r.wheelchair.filter((n) => !numbers.has(n));
          return { ...r, wheelchair: on ? [...rest, ...numbers].sort((a, b) => a - b) : rest };
        }),
      };
    }),
  };
}

export function addRows(doc: SeatMapDoc, sectionId: string, rows: SeatMapRow[]): SeatMapDoc {
  return updateSection(doc, sectionId, (s) => ({ ...s, rows: [...s.rows, ...rows] }));
}
