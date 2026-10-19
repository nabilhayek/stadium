import { boundsIntersect, boxCorners, rigidMatrix, toRad, unionBounds, type Bounds, type Point, type Rigid } from "../geometry";
import { SEAT_RADIUS, type PoiKind, type SeatMapDecoration, type SeatMapPoi, type SeatMapSection } from "../schema";
import type { Camera } from "./camera";
import { POI_SCREEN_RADIUS, type MapHit } from "./hit";
import { decorationWidth, polygonPath, SEAT_HELD, SEAT_SOLD, type Scene } from "./scene";

export type Lod = "overview" | "dots" | "seats";

/** Seat radius on screen, in CSS pixels, where each level starts. */
export const LOD_DOTS = 1.3;
export const LOD_SEATS = 4;
/** Keep in step with CLOSE_SEATS in hit.ts. Seat numbers, the faded section, and the seat card share this cutoff. */
export const LOD_SEAT_LABELS = 6.5;

export function lodFor(scale: number): Lod {
  const px = SEAT_RADIUS * scale;
  return px < LOD_DOTS ? "overview" : px < LOD_SEATS ? "dots" : "seats";
}

/** Objects mid-drag. The scene still holds their old positions; the renderer moves them. */
export type Transient = {
  transform: Rigid;
  sections: ReadonlySet<number>;
  rows: ReadonlySet<number>;
  decorations: ReadonlySet<string>;
  pois: ReadonlySet<string>;
  /** 1 for every seat that moves, so the culled pass can skip it. */
  seatMask: Uint8Array;
  seats: Int32Array;
};

export type RenderState = {
  selection: ReadonlySet<string>;
  hover: MapHit | null;
  seatStatus: Uint8Array | null;
  transient: Transient | null;
  /** Polygon being reshaped: drawn instead of the section's stored outline. */
  outline: { section: number; points: Point[] } | null;
  moving: boolean;
  grid: number;
  design: boolean;
  /** Focal point being dragged; drawn instead of the one stored on the map. */
  focalDrag: Point | null;
  overlay: ((ctx: CanvasRenderingContext2D) => void) | null;
  /** Seats mid spring. `scale` is 1 at rest and a little over 1 while hovered. */
  seatPop: readonly { index: number; scale: number }[];
};

export type Frame = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  camera: Camera;
  scene: Scene;
  state: RenderState;
  font: string;
};

/** The engine only talks to this, so a WebGL backend could replace the Canvas 2D one. */
export interface Renderer {
  draw(frame: Frame): void;
}

export const ACCENT = "#3b82f6";
const TAU = Math.PI * 2;
const SOLD = "#d4d4d4";
const HELD = "#a3a3a3";
const POI_STYLE: Record<PoiKind, { color: string; glyph: string }> = {
  kitchen: { color: "#f97316", glyph: "K" },
  entrance: { color: "#171717", glyph: "" },
  exit: { color: "#171717", glyph: "" },
  stairs: { color: "#525252", glyph: "" },
  pickup: { color: "#2563eb", glyph: "P" },
};

function sizedPoi(kind: PoiKind, w: number, h: number) {
  return w > 0 && h > 0 && (kind === "stairs" || kind === "entrance" || kind === "exit");
}

export class CanvasRenderer implements Renderer {
  draw(frame: Frame) {
    const { ctx, width, height, dpr, camera, scene, state } = frame;
    const { scale, tx, ty } = camera;
    const lod = lodFor(scale);
    const view = camera.view(width, height, 24);
    const t = state.transient;
    const m = t ? rigidMatrix(t.transform) : null;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width * dpr, height * dpr);
    const world = () => ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * tx, dpr * ty);
    const screen = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const px = 1 / scale;

    world();
    if (state.design && state.grid > 0) drawGrid(ctx, view, state.grid, scale);

    // Decorations under the seating.
    for (const d of scene.decorations) {
      if (d.kind === "text") continue;
      withMove(ctx, t?.decorations.has(d.id) ? m : null, () => drawDecoration(ctx, d, px));
    }

    // Section shapes.
    const visible: number[] = [];
    for (const s of scene.sections) {
      const moving = t?.sections.has(s.index) ?? false;
      if (!moving && !boundsIntersect(view, s.bounds)) continue;
      visible.push(s.index);
      const c = scene.colors[s.color];
      const path = state.outline?.section === s.index ? polygonPath(state.outline.points) : s.path;
      if (s.display === "round-table" || s.display === "rect-table") continue;
      // Once numbers are on the seats, the section is only a faint ground. It does not take the pointer.
      if (s.display === "seats" && SEAT_RADIUS * scale >= LOD_SEAT_LABELS) {
        withMove(ctx, moving ? m : null, () => {
          ctx.save();
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = c.soft;
          ctx.fill(path);
          ctx.restore();
        });
        continue;
      }
      withMove(ctx, moving ? m : null, () => {
        ctx.fillStyle = s.display === "block" ? c.base : lod === "overview" ? c.fill : c.soft;
        ctx.globalAlpha = s.display === "block" ? 0.95 : 1;
        ctx.fill(path);
        ctx.globalAlpha = 1;
        if (state.hover?.kind === "section" && state.hover.section === s.index) {
          ctx.fillStyle = "rgba(0,0,0,0.07)";
          ctx.fill(path);
        }
        ctx.strokeStyle = c.stroke;
        ctx.globalAlpha = lod === "overview" ? 0.55 : 0.35;
        ctx.lineWidth = px;
        ctx.stroke(path);
        ctx.globalAlpha = 1;
      });
    }

    this.drawTables(ctx, scene);

    if (lod === "overview") {
      // Row stripes: one stroke per section, cached paths.
      ctx.lineCap = "round";
      ctx.lineWidth = SEAT_RADIUS * 1.25;
      for (const si of visible) {
        const s = scene.sections[si];
        if (s.display !== "seats") continue;
        ctx.strokeStyle = scene.colors[s.color].stripe;
        if (t?.sections.has(si)) {
          withMove(ctx, m, () => ctx.stroke(s.stripes));
        } else if (t && hasMovingRow(t, s.rowStart, s.rowEnd)) {
          for (let r = s.rowStart; r < s.rowEnd; r++) withMove(ctx, t.rows.has(r) ? m : null, () => ctx.stroke(scene.rows[r].stripe));
        } else {
          ctx.stroke(s.stripes);
        }
      }
      // Selected rows.
      ctx.strokeStyle = ACCENT;
      for (const key of state.selection) {
        if (!key.startsWith("r:")) continue;
        const r = scene.rowIndex.get(key.slice(2));
        if (r === undefined) continue;
        const moving = t ? t.rows.has(r) || t.sections.has(scene.rows[r].section) : false;
        withMove(ctx, moving ? m : null, () => ctx.stroke(scene.rows[r].stripe));
      }
    } else {
      this.drawSeats(frame, lod, view, m);
    }

    // Seat labels leave the canvas in screen space. Map furniture is in world space.
    world();

    // Section outlines for the selection.
    ctx.lineJoin = "round";
    for (const key of state.selection) {
      if (!key.startsWith("s:")) continue;
      const si = scene.sectionIndex.get(key.slice(2));
      if (si === undefined) continue;
      const s = scene.sections[si];
      const path = state.outline?.section === si ? polygonPath(state.outline.points) : s.path;
      withMove(ctx, t?.sections.has(si) ? m : null, () => {
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2 * px;
        ctx.stroke(path);
      });
    }

    // Stairs and gates are part of the map, so they scale with it.
    for (const p of scene.pois) {
      if (!sizedPoi(p.kind, p.w, p.h)) continue;
      withMove(ctx, t?.pois.has(p.id) ? m : null, () => drawMarker(ctx, p, px, frame.font));
    }

    // Decoration selection boxes.
    for (const d of scene.decorations) {
      if (!state.selection.has(`d:${d.id}`)) continue;
      withMove(ctx, t?.decorations.has(d.id) ? m : null, () => {
        const corners = boxCorners(d.x, d.y, decorationWidth(d), d.h, d.rotation);
        ctx.beginPath();
        corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1.5 * px;
        ctx.setLineDash([4 * px, 3 * px]);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }
    for (const p of scene.pois) {
      if (!sizedPoi(p.kind, p.w, p.h) || !state.selection.has(`p:${p.id}`)) continue;
      withMove(ctx, t?.pois.has(p.id) ? m : null, () => {
        const corners = boxCorners(p.x, p.y, p.w, p.h, p.rotation);
        ctx.beginPath();
        corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1.5 * px;
        ctx.setLineDash([4 * px, 3 * px]);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    // Everything below is sized in screen pixels.
    screen();
    const toScreen = (x: number, y: number, moving: boolean): Point => {
      if (moving && m) {
        const wx = m[0] * x + m[2] * y + m[4];
        const wy = m[1] * x + m[3] * y + m[5];
        return [wx * scale + tx, wy * scale + ty];
      }
      return [x * scale + tx, y * scale + ty];
    };

    if (SEAT_RADIUS * scale < LOD_SEAT_LABELS) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const si of visible) {
        const s = scene.sections[si];
        if (!s.label.visible || s.display !== "seats") continue;
        const size = s.label.size * scale;
        if (size < 7) continue;
        const fontPx = Math.min(size, 22);
        const [x, y] = toScreen(s.label.x, s.label.y, t?.sections.has(si) ?? false);
        ctx.save();
        ctx.translate(x, y);
        if (s.label.rotation) ctx.rotate(toRad(s.label.rotation));
        ctx.font = `600 ${fontPx}px ${frame.font}`;
        const w = ctx.measureText(s.label.text).width + fontPx * 0.8;
        const h = fontPx * 1.35;
        ctx.globalAlpha = lod === "dots" ? 0.85 : 1;
        ctx.fillStyle = scene.colors[s.color].label;
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(6, h / 2));
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillText(s.label.text, 0, fontPx * 0.04);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // Text decorations.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const d of scene.decorations) {
      if (d.kind !== "text" || !d.label) continue;
      const size = d.h * scale;
      if (size < 5) continue;
      const [x, y] = toScreen(d.x, d.y, t?.decorations.has(d.id) ?? false);
      ctx.save();
      ctx.translate(x, y);
      if (d.rotation) ctx.rotate(toRad(d.rotation));
      ctx.font = `600 ${size}px ${frame.font}`;
      ctx.fillStyle = d.color;
      ctx.fillText(d.label, 0, 0);
      ctx.restore();
    }

    const storedFocal = state.design && scene.doc.focal ? ([scene.doc.focal.x, scene.doc.focal.y] as Point) : null;
    const focal = state.focalDrag ?? storedFocal;
    if (focal) {
      const [x, y] = toScreen(focal[0], focal[1], false);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, TAU);
      ctx.moveTo(x - 18, y);
      ctx.lineTo(x - 5, y);
      ctx.moveTo(x + 5, y);
      ctx.lineTo(x + 18, y);
      ctx.moveTo(x, y - 18);
      ctx.lineTo(x, y - 5);
      ctx.moveTo(x, y + 5);
      ctx.lineTo(x, y + 18);
      ctx.stroke();
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, TAU);
      ctx.fill();
    }

    // Points of interest at a fixed screen size.
    for (const p of scene.pois) {
      if (sizedPoi(p.kind, p.w, p.h)) continue;
      const [x, y] = toScreen(p.x, p.y, t?.pois.has(p.id) ?? false);
      if (x < -40 || y < -40 || x > width + 40 || y > height + 40) continue;
      const style = POI_STYLE[p.kind];
      const selected = state.selection.has(`p:${p.id}`);
      ctx.beginPath();
      ctx.arc(x, y, POI_SCREEN_RADIUS, 0, TAU);
      ctx.fillStyle = style.color;
      ctx.fill();
      ctx.lineWidth = selected ? 3 : 2;
      ctx.strokeStyle = selected ? ACCENT : "#fff";
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = `700 11px ${frame.font}`;
      ctx.fillText(style.glyph, x, y + 0.5);
      if (p.label) {
        ctx.font = `500 11px ${frame.font}`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.strokeText(p.label, x, y + POI_SCREEN_RADIUS + 9);
        ctx.fillStyle = "#404040";
        ctx.fillText(p.label, x, y + POI_SCREEN_RADIUS + 9);
      }
    }

    state.overlay?.(ctx);
  }

  private drawSeats(frame: Frame, lod: Lod, view: Bounds, m: ReturnType<typeof rigidMatrix> | null) {
    const { ctx, scene, state, camera } = frame;
    const { scale, tx, ty } = camera;
    const t = state.transient;
    const status = state.seatStatus;
    const xs = scene.seatX;
    const ys = scene.seatY;
    const rowOf = scene.seatRow;
    const r = SEAT_RADIUS;
    const sold = scene.colors.length;
    const held = sold + 1;
    const round = lod === "seats" || r * scale >= 2.5;
    const cache = seatCache(scene);
    const mask = t?.seatMask;

    // Sections touched by a drag are rebuilt per frame; the rest reuse cached paths.
    const dirty = new Set<number>();
    if (t) {
      for (const si of t.sections) dirty.add(si);
      for (const ri of t.rows) dirty.add(scene.rows[ri].section);
    }
    const cached: number[][] = Array.from({ length: sold }, () => []);
    const loose: Path2D[] = Array.from({ length: held + 1 }, () => new Path2D());
    const add = (p: Path2D, x: number, y: number) => {
      if (round) {
        p.moveTo(x + r, y);
        p.arc(x, y, r, 0, TAU);
      } else {
        p.rect(x - r, y - r, r * 2, r * 2);
      }
    };

    for (let si = 0; si < scene.sections.length; si++) {
      const s = scene.sections[si];
      if (s.display === "block") continue;
      if (s.seatEnd === s.seatStart || !boundsIntersect(view, cache.bounds[si])) continue;
      if (dirty.has(si)) {
        for (let i = s.seatStart; i < s.seatEnd; i++) if (!mask || !mask[i]) add(loose[s.color], xs[i], ys[i]);
      } else {
        cached[s.color].push(si);
      }
      // Sold and held seats paint over the base colour.
      if (status) {
        for (let i = s.seatStart; i < s.seatEnd; i++) {
          const st = status[i];
          if (st && (!mask || !mask[i])) add(loose[st === SEAT_SOLD ? sold : held], xs[i], ys[i]);
        }
      }
    }
    // Moving seats may sit far from their section's cached bounds.
    if (t && m) {
      for (let k = 0; k < t.seats.length; k++) {
        const i = t.seats[k];
        const st = status ? status[i] : 0;
        add(loose[st === SEAT_SOLD ? sold : st === SEAT_HELD ? held : scene.sections[scene.rows[rowOf[i]].section].color], m[0] * xs[i] + m[2] * ys[i] + m[4], m[1] * xs[i] + m[3] * ys[i] + m[5]);
      }
    }

    const outline = lod === "seats";
    // A rim of about 1.6 CSS pixels. Category colour inside, a darker rim around it.
    if (outline) ctx.lineWidth = 1.6 / scale;
    for (let c = 0; c < sold; c++) {
      ctx.fillStyle = scene.colors[c].base;
      if (outline) ctx.strokeStyle = scene.colors[c].disc;
      for (const si of cached[c]) {
        const p = sectionSeatPath(scene, si, round);
        ctx.fill(p);
        if (outline) ctx.stroke(p);
      }
      ctx.fill(loose[c]);
      if (outline) ctx.stroke(loose[c]);
    }
    ctx.fillStyle = SOLD;
    ctx.fill(loose[sold]);
    ctx.fillStyle = HELD;
    ctx.fill(loose[held]);

    const drawn: number[] = [];
    if (lod === "seats" && r * scale >= LOD_SEAT_LABELS && !state.moving) {
      const g = scene.grid;
      const c0 = Math.max(0, Math.floor((view.minX - g.minX) / g.cell));
      const c1 = Math.min(g.cols - 1, Math.floor((view.maxX - g.minX) / g.cell));
      const r0 = Math.max(0, Math.floor((view.minY - g.minY) / g.cell));
      const r1 = Math.min(g.rows - 1, Math.floor((view.maxY - g.minY) / g.cell));
      for (let row = r0; row <= r1; row++) {
        for (let col = c0; col <= c1; col++) {
          const cell = row * g.cols + col;
          for (let k = g.start[cell], end = g.start[cell + 1]; k < end; k++) {
            const i = g.items[k];
            if (!mask || !mask[i]) drawn.push(i);
          }
        }
      }
    }

    // Selected rows and the hovered seat.
    const highlight = new Path2D();
    let any = false;
    for (const key of state.selection) {
      if (!key.startsWith("r:")) continue;
      const ri = scene.rowIndex.get(key.slice(2));
      if (ri === undefined) continue;
      const row = scene.rows[ri];
      const moving = t ? t.rows.has(ri) || t.sections.has(row.section) : false;
      for (let i = row.seatStart; i < row.seatEnd; i++) {
        const x = moving && m ? m[0] * xs[i] + m[2] * ys[i] + m[4] : xs[i];
        const y = moving && m ? m[1] * xs[i] + m[3] * ys[i] + m[5] : ys[i];
        highlight.moveTo(x + r, y);
        highlight.arc(x, y, r, 0, TAU);
        any = true;
      }
    }
    if (any) {
      ctx.fillStyle = ACCENT;
      ctx.fill(highlight);
    }

    this.paintPopped(frame, lod, m);

    if (lod !== "seats" || state.moving) return;

    // Labels in screen space for crisp text.
    ctx.setTransform(frame.dpr, 0, 0, frame.dpr, 0, 0);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const seatPx = r * scale;

    // Row labels just past both ends of every visible row.
    ctx.font = `600 ${Math.min(14, seatPx * 1.1)}px ${frame.font}`;
    ctx.fillStyle = "#737373";
    for (let ri = 0; ri < scene.rows.length; ri++) {
      const row = scene.rows[ri];
      if (scene.sections[row.section].display !== "seats") continue;
      if (!boundsIntersect(view, row.bounds) || row.seatEnd - row.seatStart < 2) continue;
      if (t && (t.rows.has(ri) || t.sections.has(row.section))) continue;
      for (const [a, b] of [
        [row.seatStart, row.seatStart + 1],
        [row.seatEnd - 1, row.seatEnd - 2],
      ]) {
        const dx = xs[a] - xs[b];
        const dy = ys[a] - ys[b];
        const len = Math.hypot(dx, dy) || 1;
        const off = r * 2.6;
        ctx.fillText(row.label, (xs[a] + (dx / len) * off) * scale + tx, (ys[a] + (dy / len) * off) * scale + ty);
      }
    }

    if (!drawn.length) return;
    const pops = state.seatPop;
    for (const i of drawn) {
      const x = xs[i] * scale + tx;
      const y = ys[i] * scale + ty;
      let grown = 1;
      for (let p = 0; p < pops.length; p++) if (pops[p].index === i) grown = pops[p].scale;
      if (scene.seatWheelchair[i]) {
        drawWheelchair(ctx, x, y, seatPx * grown * 0.62);
        continue;
      }
      const label = String(scene.seatNumber[i]);
      const size = seatPx * grown * (label.length > 2 ? 0.78 : 0.95);
      ctx.font = `600 ${size}px ${frame.font}`;
      ctx.fillStyle = status && status[i] ? "#737373" : "#fff";
      ctx.fillText(label, x, y + size * 0.04);
    }
  }

  /** Hovered seat, painted over the batch so the spring never rebuilds those paths. */
  private paintPopped(frame: Frame, lod: Lod, m: ReturnType<typeof rigidMatrix> | null) {
    const pops = frame.state.seatPop;
    if (lod !== "seats" || !pops.length) return;
    const { ctx, scene, state, camera } = frame;
    const mask = state.transient?.seatMask;
    const xs = scene.seatX;
    const ys = scene.seatY;
    ctx.lineWidth = 1.6 / camera.scale;
    for (const pop of pops) {
      if (pop.scale <= 1.004) continue;
      const i = pop.index;
      if (i < 0 || i >= xs.length) continue;
      const section = scene.sections[scene.rows[scene.seatRow[i]].section];
      if (section.display === "block") continue;
      let x = xs[i];
      let y = ys[i];
      if (mask?.[i] && m) {
        x = m[0] * xs[i] + m[2] * ys[i] + m[4];
        y = m[1] * xs[i] + m[3] * ys[i] + m[5];
      }
      const st = state.seatStatus?.[i] ?? 0;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(pop.scale, pop.scale);
      ctx.beginPath();
      ctx.arc(0, 0, SEAT_RADIUS, 0, TAU);
      if (st === SEAT_SOLD) ctx.fillStyle = SOLD;
      else if (st === SEAT_HELD) ctx.fillStyle = HELD;
      else {
        const tone = scene.colors[section.color];
        ctx.fillStyle = tone.base;
        ctx.strokeStyle = tone.disc;
      }
      ctx.fill();
      if (st !== SEAT_SOLD && st !== SEAT_HELD) ctx.stroke();
      ctx.restore();
    }
  }

  /** Tabletops, and the name sitting in the middle of a loge. */
  private drawTables(ctx: CanvasRenderingContext2D, scene: Scene) {
    for (const s of scene.sections) {
      if (s.display === "block" && s.label.visible) {
        ctx.save();
        ctx.translate(s.label.x, s.label.y);
        if (s.label.rotation) ctx.rotate(toRad(s.label.rotation));
        const size = s.label.size;
        ctx.fillStyle = inkOn(scene.colors[s.color].base);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillText(s.label.text, 0, 0);
        ctx.restore();
        continue;
      }
      if (s.display !== "round-table" && s.display !== "rect-table") continue;
      const row = scene.doc.sections[s.index].rows[0];
      if (!row) continue;
      ctx.save();
      ctx.translate(row.x, row.y);
      if (row.rotation) ctx.rotate(toRad(row.rotation));
      ctx.fillStyle = "#3f3f46";
      ctx.beginPath();
      if (s.display === "round-table") ctx.arc(0, 0, Math.max(row.boxW, row.boxH) / 2, 0, TAU);
      else ctx.roundRect(-row.boxW / 2, -row.boxH / 2, row.boxW, row.boxH, Math.min(row.boxW, row.boxH) * 0.12);
      ctx.fill();
      const size = Math.min(row.boxW, row.boxH) * 0.34;
      ctx.fillStyle = "#fafafa";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(s.label.text, 0, size * 0.04);
      ctx.restore();
    }
  }
}

type SeatCache = { bounds: Bounds[] };

const seatCaches = new WeakMap<Scene, SeatCache>();

/**
 * One reusable seat path per section and shape. Keyed by the document's section object,
 * which edits replace only when that section changes, so a rebuilt scene keeps the rest.
 */
const sectionPaths = new WeakMap<SeatMapSection, { dots?: Path2D; round?: Path2D }>();

function seatCache(scene: Scene): SeatCache {
  let cache = seatCaches.get(scene);
  if (!cache) {
    const bounds = scene.sections.map((s) => {
      let b = s.bounds;
      for (let ri = s.rowStart; ri < s.rowEnd; ri++) b = unionBounds(b, scene.rows[ri].bounds);
      return b;
    });
    cache = { bounds };
    seatCaches.set(scene, cache);
    warmSeatPaths(scene);
  }
  return cache;
}

function sectionSeatPath(scene: Scene, si: number, round: boolean): Path2D {
  const key = scene.doc.sections[si];
  let entry = sectionPaths.get(key);
  if (!entry) sectionPaths.set(key, (entry = {}));
  const cached = round ? entry.round : entry.dots;
  if (cached) return cached;
  const path = new Path2D();
  const s = scene.sections[si];
  const r = SEAT_RADIUS;
  for (let i = s.seatStart; i < s.seatEnd; i++) {
    const x = scene.seatX[i];
    const y = scene.seatY[i];
    if (round) {
      path.moveTo(x + r, y);
      path.arc(x, y, r, 0, TAU);
    } else {
      path.rect(x - r, y - r, r * 2, r * 2);
    }
  }
  if (round) entry.round = path;
  else entry.dots = path;
  return path;
}

let warming: Scene | null = null;

/** Builds the remaining seat paths in idle time so crossing a zoom level doesn't stall a pinch. */
function warmSeatPaths(scene: Scene) {
  if (typeof requestIdleCallback === "undefined") return;
  warming = scene;
  let si = 0;
  const step = (deadline: IdleDeadline) => {
    if (warming !== scene) return;
    while (si < scene.sections.length && deadline.timeRemaining() > 2) {
      sectionSeatPath(scene, si, false);
      sectionSeatPath(scene, si, true);
      si++;
    }
    if (si < scene.sections.length) requestIdleCallback(step, { timeout: 2000 });
  };
  requestIdleCallback(step, { timeout: 2000 });
}

function hasMovingRow(t: Transient, start: number, end: number) {
  for (let r = start; r < end; r++) if (t.rows.has(r)) return true;
  return false;
}

function inkOn(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const y = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
  return y > 160 ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.92)";
}

function withMove(ctx: CanvasRenderingContext2D, m: ReturnType<typeof rigidMatrix> | null, draw: () => void) {
  if (!m) return draw();
  ctx.save();
  ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  draw();
  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, view: Bounds, step: number, scale: number) {
  let s = step;
  while (s * scale < 10) s *= 5;
  const path = new Path2D();
  for (let x = Math.floor(view.minX / s) * s; x <= view.maxX; x += s) {
    path.moveTo(x, view.minY);
    path.lineTo(x, view.maxY);
  }
  for (let y = Math.floor(view.minY / s) * s; y <= view.maxY; y += s) {
    path.moveTo(view.minX, y);
    path.lineTo(view.maxX, y);
  }
  ctx.strokeStyle = "rgba(0,0,0,0.06)";
  ctx.lineWidth = 1 / scale;
  ctx.stroke(path);
}

function drawDecoration(ctx: CanvasRenderingContext2D, d: SeatMapDecoration, px: number) {
  ctx.save();
  ctx.translate(d.x, d.y);
  if (d.rotation) ctx.rotate(toRad(d.rotation));
  const w = d.w;
  const h = d.h;
  if (d.kind === "field") {
    drawField(ctx, w, h, d.color, px);
  } else if (d.kind === "stage") {
    ctx.fillStyle = "#d4d4d4";
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.12);
    ctx.fill();
    if (d.label) {
      const size = Math.min(h * 0.32, (w / Math.max(4, d.label.length)) * 1.3);
      ctx.fillStyle = "#404040";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(d.label.toUpperCase(), 0, 0);
    }
  } else if (d.kind === "rect" || d.kind === "ellipse") {
    ctx.beginPath();
    if (d.kind === "rect") ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.08);
    else ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU);
    ctx.fillStyle = d.color;
    ctx.fill();
    if (d.label) {
      const size = Math.min(h * 0.34, (w / Math.max(4, d.label.length)) * 1.35);
      ctx.fillStyle = inkOn(d.color);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(d.label, 0, size * 0.04);
    }
  }
  ctx.restore();
}

/** A stair bar or a gate arrow. Rotation 0 points up the map. */
function drawMarker(ctx: CanvasRenderingContext2D, p: SeatMapPoi, px: number, font: string) {
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.rotation) ctx.rotate(toRad(p.rotation));
  const { w, h } = p;
  if (p.kind === "stairs") {
    const radius = Math.min(w, h) * 0.16;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, radius);
    ctx.fillStyle = "#e7e5e4";
    ctx.fill();
    ctx.strokeStyle = "#a8a29e";
    ctx.lineWidth = Math.max(px, Math.min(w, h) * 0.04);
    ctx.stroke();
    const glyph = Math.min(w, h, 18) * 0.72;
    ctx.beginPath();
    ctx.moveTo(-glyph * 0.05, -glyph * 0.5);
    ctx.lineTo(glyph * 0.42, -glyph * 0.5);
    ctx.lineTo(glyph * 0.42, -glyph * 0.16);
    ctx.lineTo(-glyph * 0.05, -glyph * 0.16);
    ctx.lineTo(-glyph * 0.05, glyph * 0.16);
    ctx.lineTo(-glyph * 0.5, glyph * 0.16);
    ctx.lineTo(-glyph * 0.5, glyph * 0.5);
    ctx.strokeStyle = "#44403c";
    ctx.lineWidth = Math.max(px * 1.3, glyph * 0.14);
    ctx.lineJoin = "miter";
    ctx.lineCap = "square";
    ctx.stroke();
  } else {
    const radius = Math.min(w, h) * 0.14;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, radius);
    ctx.fillStyle = "#e7e5e4";
    ctx.fill();
    ctx.strokeStyle = "#a8a29e";
    ctx.lineWidth = Math.max(px, Math.min(w, h) * 0.045);
    ctx.stroke();
    const g = Math.min(w, h, 22) * 0.34;
    ctx.beginPath();
    ctx.strokeStyle = "#292524";
    ctx.lineWidth = Math.max(px * 1.2, g * 0.16);
    ctx.lineJoin = "miter";
    ctx.lineCap = "square";
    ctx.strokeRect(-g * 0.95, -g * 0.85, g * 1.15, g * 1.7);
    ctx.beginPath();
    ctx.moveTo(-g * 0.2, 0);
    ctx.lineTo(g * 0.95, 0);
    ctx.moveTo(g * 0.5, -g * 0.38);
    ctx.lineTo(g * 1.05, 0);
    ctx.lineTo(g * 0.5, g * 0.38);
    ctx.stroke();
    if (p.label) {
      const size = Math.min(h * 0.22, w * 0.28);
      ctx.fillStyle = "#44403c";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${size}px ${font}`;
      ctx.fillText(p.label, 0, h * 0.32);
    }
  }
  ctx.restore();
}

/** A small wheelchair, drawn in screen pixels, centred on a seat. */
function drawWheelchair(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const r = Math.max(3.5, size);
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#fff";
  ctx.fillStyle = "#fff";
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.arc(0, -r * 0.55, r * 0.22, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 0.02, r * 0.28, r * 0.42, 0.4, Math.PI * 1.15);
  ctx.moveTo(-r * 0.15, -r * 0.28);
  ctx.lineTo(-r * 0.15, r * 0.22);
  ctx.lineTo(r * 0.42, r * 0.22);
  ctx.moveTo(-r * 0.15, -r * 0.02);
  ctx.lineTo(r * 0.28, -r * 0.02);
  ctx.stroke();
  ctx.restore();
}

/** A football pitch, proportions from the 105 × 68 m standard. */
function drawField(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, px: number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-w / 2 - w * 0.03, -h / 2 - h * 0.045, w * 1.06, h * 1.09, Math.min(w, h) * 0.04);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = Math.max(px, w * 0.0025);
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(0, h / 2);
  ctx.moveTo(h * 0.135, 0);
  ctx.arc(0, 0, h * 0.135, 0, TAU);
  for (const side of [-1, 1]) {
    const x = (side * w) / 2;
    ctx.rect(side < 0 ? x : x - w * 0.157, -h * 0.296, w * 0.157, h * 0.593);
    ctx.rect(side < 0 ? x : x - w * 0.052, -h * 0.135, w * 0.052, h * 0.27);
  }
  ctx.stroke();
}
