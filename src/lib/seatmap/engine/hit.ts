import { pointInPolygon, toRad } from "../geometry";
import { SEAT_RADIUS } from "../schema";
import { decorationWidth, type Scene } from "./scene";

/** Same cutoff as LOD_SEAT_LABELS: the section steps aside once seat numbers are drawn. */
const CLOSE_SEATS = 6.5;

/** True once seat numbers are drawn. Keep the cutoff equal to CLOSE_SEATS. */
export function seatLabelsVisible(scale: number) {
  return SEAT_RADIUS * scale >= CLOSE_SEATS;
}

/** Seat cards wait until the numbers are drawn. Before that the pointer is on the section. */
export function cardHit(hit: MapHit | null, scale: number): MapHit | null {
  if (!hit || hit.kind === "decoration" || hit.kind === "poi") return null;
  if (hit.kind === "seat" && !seatLabelsVisible(scale)) return { kind: "section", section: hit.section };
  return hit;
}

export type MapHit =
  | { kind: "seat"; seat: number; row: number; section: number }
  | { kind: "section"; section: number }
  | { kind: "decoration"; id: string }
  | { kind: "poi"; id: string };

/** POIs draw at a fixed screen size, so their hit radius is in CSS pixels. */
export const POI_SCREEN_RADIUS = 11;

export function seatAt(scene: Scene, x: number, y: number, slop = 0): number {
  const g = scene.grid;
  const reach = SEAT_RADIUS + slop;
  const c0 = Math.max(0, Math.floor((x - reach - g.minX) / g.cell));
  const c1 = Math.min(g.cols - 1, Math.floor((x + reach - g.minX) / g.cell));
  const r0 = Math.max(0, Math.floor((y - reach - g.minY) / g.cell));
  const r1 = Math.min(g.rows - 1, Math.floor((y + reach - g.minY) / g.cell));
  let best = -1;
  let bestD = reach * reach;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const cell = r * g.cols + c;
      for (let k = g.start[cell], end = g.start[cell + 1]; k < end; k++) {
        const i = g.items[k];
        const dx = scene.seatX[i] - x;
        const dy = scene.seatY[i] - y;
        const d = dx * dx + dy * dy;
        if (d <= bestD) {
          bestD = d;
          best = i;
        }
      }
    }
  }
  return best;
}

/** Topmost section containing the point. */
export function sectionAt(scene: Scene, x: number, y: number): number {
  for (let i = scene.sections.length - 1; i >= 0; i--) {
    const s = scene.sections[i];
    const b = s.bounds;
    if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) continue;
    if (pointInPolygon(x, y, s.points)) return i;
  }
  return -1;
}

export function decorationAt(scene: Scene, x: number, y: number, slop = 0, only?: (d: Scene["decorations"][number]) => boolean): string | null {
  for (let i = scene.decorations.length - 1; i >= 0; i--) {
    const d = scene.decorations[i];
    if (only && !only(d)) continue;
    const c = Math.cos(toRad(-d.rotation));
    const s = Math.sin(toRad(-d.rotation));
    const lx = (x - d.x) * c - (y - d.y) * s;
    const ly = (x - d.x) * s + (y - d.y) * c;
    const hw = decorationWidth(d) / 2 + slop;
    const hh = d.h / 2 + slop;
    if (d.kind === "ellipse") {
      if ((lx * lx) / (hw * hw) + (ly * ly) / (hh * hh) <= 1) return d.id;
    } else if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) return d.id;
  }
  return null;
}

export function poiAt(scene: Scene, x: number, y: number, scale: number): string | null {
  const r = POI_SCREEN_RADIUS / scale;
  for (let i = scene.pois.length - 1; i >= 0; i--) {
    const p = scene.pois[i];
    if (p.w > 0 && p.h > 0) {
      const c = Math.cos(toRad(-p.rotation));
      const s = Math.sin(toRad(-p.rotation));
      const lx = (x - p.x) * c - (y - p.y) * s;
      const ly = (x - p.x) * s + (y - p.y) * c;
      if (Math.abs(lx) <= p.w / 2 && Math.abs(ly) <= p.h / 2) return p.id;
    } else if ((p.x - x) ** 2 + (p.y - y) ** 2 <= r * r) return p.id;
  }
  return null;
}

/**
 * What's under a world point. Seats only count once they're drawn
 * (`seatsVisible`); zoomed out, a tap lands on the section instead.
 */
export function hitTest(scene: Scene, x: number, y: number, scale: number, seatsVisible: boolean): MapHit | null {
  const poi = poiAt(scene, x, y, scale);
  if (poi) return { kind: "poi", id: poi };
  if (seatsVisible && seatLabelsVisible(scale)) {
    const seat = seatAt(scene, x, y, Math.max(0.6, 4 / scale));
    if (seat >= 0) {
      const row = scene.seatRow[seat];
      const section = scene.rows[row].section;
      if (scene.sections[section].display !== "block") return { kind: "seat", seat, row, section };
    }
  }
  // Text sits on top of sections; stages and fields sit under them.
  const text = decorationAt(scene, x, y, 0, (d) => d.kind === "text");
  if (text) return { kind: "decoration", id: text };
  const section = sectionAt(scene, x, y);
  if (section >= 0) {
    const shape = scene.sections[section];
    const close = SEAT_RADIUS * scale >= CLOSE_SEATS;
    if (!(close && shape.display === "seats")) return { kind: "section", section };
  }
  const deco = decorationAt(scene, x, y);
  if (deco) return { kind: "decoration", id: deco };
  return null;
}
