import { boundsIntersect, boxCorners, centroid, rigidMatrix, toRad, unionBounds, type Bounds, type Point, type Rigid } from "../geometry";
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
  /**
   * Seats wrapped again at the dragged position, and outlines rebuilt around them.
   * Absent for a plain move, which the rigid transform already draws correctly.
   */
  preview: {
    x: Float32Array;
    y: Float32Array;
    live: Uint8Array;
    outlines: ReadonlyMap<number, readonly Point[]>;
    /** Objects that turn with a following section, drawn at this pose instead of the straight drag. */
    rides: ReadonlyMap<string, { x: number; y: number; rotation: number }>;
  } | null;
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
  overlay: ((ctx: CanvasRenderingContext2D) => void) | null;
  /** Seats mid spring. `scale` is 1 at rest and a little over 1 while hovered. */
  seatPop: readonly { index: number; scale: number }[];
  /** One box being resized. Drawn at this size until the pointer goes up. */
  resize: { key: string; x: number; y: number; w: number; h: number } | null;
  /** Objects the assistant just placed. They descend into scale 1, staggered when several arrive together. */
  craft: Craft | null;
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

/**
 * Assistant placements. Keys are `s:`, `d:` and `p:` plus the object id. `born` may lie
 * in the future when a batch is staggered. An object stays a grey placeholder until it
 * has a `reveal` time, which the engine sets once the assistant has finished.
 */
export type Craft = {
  born: ReadonlyMap<string, number>;
  reveal: ReadonlyMap<string, number>;
  reduced: boolean;
};

/**
 * `alpha` is the real object, `ghost` the grey placeholder under it. `spread` is how many
 * screen pixels the real object is smeared by while it comes into focus.
 */
type Arrival = { alpha: number; ghost: number; spread: number; scale: number; dy: number; settled: boolean };

/** Timings for placed objects. The engine uses the same numbers to drop finished entries. */
export const CRAFT_FALL_MS = 1250;
export const CRAFT_FALL_REDUCED_MS = 280;
export const CRAFT_REVEAL_MS = 1000;
export const CRAFT_REVEAL_REDUCED_MS = 220;
/** Screen pixels of smear an object starts its reveal with. */
const REVEAL_BLUR = 18;
/** How long the highlight takes to cross a placeholder. */
const SHIMMER_MS = 1400;
const GHOST = "#ebebeb";
const GHOST_SHIMMER = "#f5f5f5";

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Scale about a point and drop in from above. `dy` is world units, negative is up. */
function arrivedScreen(x: number, y: number, cx: number, cy: number, pose: Arrival, scale: number, tx: number, ty: number): [number, number] {
  const wx = cx + (x - cx) * pose.scale;
  const wy = cy + pose.dy + (y - cy) * pose.scale;
  return [wx * scale + tx, wy * scale + ty];
}

/**
 * The context an arrival callback should draw on. While a reveal is smeared this is the
 * offscreen plate, so the geometry is built once and the blur is a few image copies.
 */
let pen: CanvasRenderingContext2D | null = null;
let craftClock = 0;
let craftUnit = 1;
let shimmerOn = true;

let plateCanvas: HTMLCanvasElement | null = null;
let plateCtx: CanvasRenderingContext2D | null = null;
let plateOn = false;
let plateSpread = 0;

function plateOf(main: CanvasRenderingContext2D) {
  if (!plateCanvas) {
    plateCanvas = document.createElement("canvas");
    plateCtx = plateCanvas.getContext("2d");
  }
  const plate = plateCtx;
  if (!plate || !plateCanvas) return null;
  if (!plateOn) {
    if (plateCanvas.width !== main.canvas.width || plateCanvas.height !== main.canvas.height) {
      plateCanvas.width = main.canvas.width;
      plateCanvas.height = main.canvas.height;
    } else {
      plate.setTransform(1, 0, 0, 1, 0, 0);
      plate.clearRect(0, 0, plateCanvas.width, plateCanvas.height);
    }
    plateOn = true;
    plateSpread = 0;
  }
  return plate;
}

/** One geometry pass onto the plate. The frame blits it a few times to make the smear. */
function stagePlate(main: CanvasRenderingContext2D, alpha: number, spread: number, draw: () => void) {
  const plate = plateOf(main);
  if (!plate) {
    pen = main;
    draw();
    return;
  }
  plateSpread = Math.max(plateSpread, spread);
  plate.setTransform(main.getTransform());
  plate.globalAlpha = alpha;
  pen = plate;
  draw();
  plate.globalAlpha = 1;
}

function blitPlate(ctx: CanvasRenderingContext2D, dpr: number) {
  if (!plateOn || !plateCanvas) return;
  const rad = plateSpread * dpr;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const copies = 6;
  ctx.globalAlpha = 0.45 / copies;
  for (let i = 0; i < copies; i++) {
    const a = (i / copies) * TAU;
    ctx.drawImage(plateCanvas, Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.globalAlpha = 0.55;
  ctx.drawImage(plateCanvas, 0, 0);
  ctx.restore();
  plateOn = false;
}

/** Grey fill plus a highlight that fades out toward both sides, clipped to the shape. */
function shimmerClip(ctx: CanvasRenderingContext2D, path: Path2D, b: Bounds, screen = false) {
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = GHOST;
  ctx.fill(path);
  if (shimmerOn) {
    const w = Math.max(1, b.maxX - b.minX);
    const band = Math.min(w * 0.7, screen ? 120 : craftUnit * 120);
    const t = (craftClock % SHIMMER_MS) / SHIMMER_MS;
    const x0 = b.minX - band + (w + band) * t;
    const g = ctx.createLinearGradient(x0, b.minY, x0 + band, b.minY);
    g.addColorStop(0, `${GHOST_SHIMMER}00`);
    g.addColorStop(0.5, GHOST_SHIMMER);
    g.addColorStop(1, `${GHOST_SHIMMER}00`);
    ctx.fillStyle = g;
    ctx.fillRect(b.minX - band, b.minY, w + band * 2, Math.max(1, b.maxY - b.minY));
  }
  ctx.restore();
}

/**
 * Screen-space smear for the few things that are not on the plate (labels, markers).
 * Geometry-heavy objects go through the plate instead.
 */
function paintSoft(ctx: CanvasRenderingContext2D, spread: number, alpha: number, unit: number, draw: () => void) {
  const base = ctx.globalAlpha;
  if (alpha <= 0.003) {
    ctx.globalAlpha = base;
    return;
  }
  const rad = spread * unit;
  if (rad <= 0.35) {
    ctx.globalAlpha = base * alpha;
    draw();
    ctx.globalAlpha = base;
    return;
  }
  const copies = 4;
  ctx.globalAlpha = (base * alpha * 0.45) / copies;
  for (let i = 0; i < copies; i++) {
    const a = (i / copies) * TAU;
    ctx.save();
    ctx.translate(Math.cos(a) * rad, Math.sin(a) * rad);
    draw();
    ctx.restore();
  }
  ctx.globalAlpha = base * alpha * 0.55;
  draw();
  ctx.globalAlpha = base;
}

/** Draws `ghost` as the grey placeholder, then the object itself smeared until it is sharp. */
function withArrival(ctx: CanvasRenderingContext2D, pose: Arrival | null, cx: number, cy: number, unit: number, draw: () => void, ghost?: () => void) {
  if (!pose) {
    pen = ctx;
    draw();
    return;
  }
  ctx.save();
  ctx.translate(cx, cy + pose.dy);
  ctx.scale(pose.scale, pose.scale);
  ctx.translate(-cx, -cy);
  const base = ctx.globalAlpha;
  if (ghost && pose.ghost > 0.003) {
    ctx.globalAlpha = base * pose.ghost;
    pen = ctx;
    ghost();
    ctx.globalAlpha = base;
  }
  if (pose.alpha > 0.003) {
    if (pose.spread > 0.35) stagePlate(ctx, base * pose.alpha, pose.spread, draw);
    else {
      pen = ctx;
      paintSoft(ctx, pose.spread, pose.alpha, unit / pose.scale, draw);
    }
  }
  ctx.restore();
}

/** Grey stand-in for a box-shaped object, in its own rotated frame. */
function ghostBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rotation: number, round: "box" | "ellipse" | number) {
  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate(toRad(rotation));
  const path = new Path2D();
  if (round === "ellipse") path.ellipse(0, 0, Math.max(0, w / 2), Math.max(0, h / 2), 0, 0, TAU);
  else path.roundRect(-w / 2, -h / 2, w, h, Math.max(0, Math.min(round === "box" ? Math.min(w, h) * 0.08 : round, w / 2, h / 2)));
  shimmerClip(ctx, path, { minX: -w / 2, minY: -h / 2, maxX: w / 2, maxY: h / 2 });
  ctx.restore();
}

function ghostDecoration(ctx: CanvasRenderingContext2D, d: SeatMapDecoration) {
  const w = decorationWidth(d);
  const round = d.kind === "venue" ? d.radius : d.kind === "ellipse" || d.kind === "column" ? "ellipse" : "box";
  ghostBox(ctx, d.x, d.y, w, d.h, d.rotation, round);
}

function sectionCenter(scene: Scene, si: number): [number, number] {
  const s = scene.sections[si];
  let b = s.bounds;
  for (let r = s.rowStart; r < s.rowEnd; r++) b = unionBounds(b, scene.rows[r].bounds);
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
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
  private frameNow = 0;
  /** World units per screen pixel, so a smear stays the same size at every zoom. */
  private unit = 1;

  /** Where an assistant placement is in its arrival: falling in grey, then sharpening into itself. */
  private pose(craft: Craft | null, key: string): Arrival | null {
    const born = craft?.born.get(key);
    if (born === undefined || !craft) return null;
    const now = this.frameNow;
    const reduced = craft.reduced;
    const t = clamp01((now - born) / (reduced ? CRAFT_FALL_REDUCED_MS : CRAFT_FALL_MS));
    const start = craft.reveal.get(key);
    // A future reveal belongs to an object that is still waiting for its staggered slot.
    const live = start !== undefined && now >= start;
    const u = !live || start === undefined ? 0 : clamp01((now - start) / (reduced ? CRAFT_REVEAL_REDUCED_MS : CRAFT_REVEAL_MS));
    const k = live ? 1 : reduced || t === 0 ? t : 1 - (1 - t) * (1 - t);
    return {
      alpha: k * u,
      ghost: k * (1 - u),
      spread: reduced || !live ? 0 : REVEAL_BLUR * (1 - u),
      scale: live || reduced ? 1 : 1 + 0.15 * (1 - k),
      dy: live || reduced ? 0 : -42 * (1 - k),
      settled: t >= 1 && live && u >= 1,
    };
  }

  draw(frame: Frame) {
    const { ctx, width, height, dpr, camera, scene, state } = frame;
    this.frameNow = performance.now();
    this.unit = 1 / camera.scale;
    craftClock = this.frameNow;
    craftUnit = this.unit;
    shimmerOn = !state.craft?.reduced;
    plateOn = false;
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
      const resizing = state.resize?.key === `d:${d.id}`;
      const shown = resizing && state.resize ? { ...d, x: state.resize.x, y: state.resize.y, w: state.resize.w, h: state.resize.h } : d;
      const pose = resizing ? null : this.pose(state.craft, `d:${d.id}`);
      withMove(ctx, resizing ? null : (carried(t, `d:${d.id}`, d.x, d.y, d.rotation) ?? (t?.decorations.has(d.id) ? m : null)), () => {
        withArrival(
          ctx,
          pose,
          shown.x,
          shown.y,
          this.unit,
          () => drawDecoration(pen ?? ctx, shown, px),
          () => ghostDecoration(ctx, shown),
        );
      });
    }

    // Section shapes.
    const visible: number[] = [];
    for (const s of scene.sections) {
      const override = t?.preview?.outlines.get(s.index);
      const moving = !override && (t?.sections.has(s.index) ?? false);
      const pose = this.pose(state.craft, `s:${s.id}`);
      if (!moving && !override && !pose && !boundsIntersect(view, s.bounds)) continue;
      visible.push(s.index);
      const c = scene.colors[s.color];
      const path = override ? polygonPath(override as Point[]) : state.outline?.section === s.index ? polygonPath(state.outline.points) : s.path;
      if (s.loose || s.display === "round-table" || s.display === "rect-table") continue;
      const [cx, cy] = sectionCenter(scene, s.index);
      // Once numbers are on the seats, the section is only a faint ground. It does not take the pointer.
      const ghost = () => shimmerClip(ctx, path, s.bounds);
      if (s.display === "seats" && SEAT_RADIUS * scale >= LOD_SEAT_LABELS) {
        withArrival(
          ctx,
          pose,
          cx,
          cy,
          this.unit,
          () => {
            const g = pen ?? ctx;
            withMove(g, moving ? m : null, () => {
              g.save();
              g.globalAlpha *= 0.28;
              g.fillStyle = c.soft;
              g.fill(path);
              g.restore();
            });
          },
          ghost,
        );
        continue;
      }
      withArrival(ctx, pose, cx, cy, this.unit, () => {
        const g = pen ?? ctx;
        withMove(g, moving ? m : null, () => {
          const fade = g.globalAlpha;
          g.fillStyle = s.display === "block" ? c.base : lod === "overview" ? c.fill : c.soft;
          g.globalAlpha = (s.display === "block" ? 0.95 : 1) * fade;
          g.fill(path);
          if (state.hover?.kind === "section" && state.hover.section === s.index) {
            g.fillStyle = "rgba(0,0,0,0.07)";
            g.fill(path);
          }
          g.strokeStyle = c.stroke;
          g.globalAlpha = (lod === "overview" ? 0.55 : 0.35) * fade;
          g.lineWidth = px;
          g.stroke(path);
          g.globalAlpha = fade;
        });
      }, ghost);
    }

    this.drawTables(ctx, scene, state, t, m);

    if (lod === "overview") {
      // Row stripes: one stroke per section, cached paths.
      ctx.lineCap = "round";
      ctx.lineWidth = SEAT_RADIUS * 1.25;
      for (const si of visible) {
        const s = scene.sections[si];
        if (s.display !== "seats") continue;
        ctx.strokeStyle = scene.colors[s.color].stripe;
        const wrapped = t?.preview && sectionWrapped(t, s.seatStart, s.seatEnd);
        if (wrapped) ctx.stroke(wrappedStripe(scene, t, si));
        else if (t?.sections.has(si)) {
          withMove(ctx, m, () => ctx.stroke(s.stripes));
        } else if (t && hasMovingRow(t, s.rowStart, s.rowEnd)) {
          for (let r = s.rowStart; r < s.rowEnd; r++) withMove(ctx, t.rows.has(r) ? m : null, () => ctx.stroke(scene.rows[r].stripe));
        } else {
          const pose = this.pose(state.craft, `s:${s.id}`);
          const [cx, cy] = sectionCenter(scene, si);
          withArrival(ctx, pose, cx, cy, this.unit, () => (pen ?? ctx).stroke(s.stripes));
        }
      }
      // Selected rows.
      ctx.strokeStyle = ACCENT;
      for (const key of state.selection) {
        if (!key.startsWith("r:")) continue;
        const r = scene.rowIndex.get(key.slice(2));
        if (r === undefined) continue;
        const row = scene.rows[r];
        const wrapped = t?.preview && sectionWrapped(t, row.seatStart, row.seatEnd);
        if (wrapped) ctx.stroke(wrappedStripe(scene, t, row.section, r));
        else {
          const moving = t ? t.rows.has(r) || t.sections.has(row.section) : false;
          withMove(ctx, moving ? m : null, () => ctx.stroke(row.stripe));
        }
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
      if (state.resize?.key === `s:${s.id}`) continue;
      const override = t?.preview?.outlines.get(si);
      const path = override ? polygonPath(override as Point[]) : state.outline?.section === si ? polygonPath(state.outline.points) : s.path;
      withMove(ctx, !override && t?.sections.has(si) ? m : null, () => {
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2 * px;
        ctx.stroke(path);
      });
    }

    // Stairs and gates are part of the map, so they scale with it.
    for (const p of scene.pois) {
      if (!sizedPoi(p.kind, p.w, p.h)) continue;
      const shown = state.resize?.key === `p:${p.id}` ? { ...p, x: state.resize.x, y: state.resize.y, w: state.resize.w, h: state.resize.h } : p;
      const mat = state.resize?.key === `p:${p.id}` ? null : (carried(t, `p:${p.id}`, p.x, p.y, p.rotation) ?? (t?.pois.has(p.id) ? m : null));
      const pose = state.resize?.key === `p:${p.id}` ? null : this.pose(state.craft, `p:${p.id}`);
      withMove(ctx, mat, () => {
        withArrival(
          ctx,
          pose,
          shown.x,
          shown.y,
          this.unit,
          () => drawMarker(pen ?? ctx, shown, px, frame.font),
          () => ghostBox(ctx, shown.x, shown.y, shown.w, shown.h, shown.rotation, "box"),
        );
      });
    }

    // Decoration selection boxes.
    for (const d of scene.decorations) {
      if (!state.selection.has(`d:${d.id}`)) continue;
      const shown = state.resize?.key === `d:${d.id}` ? { ...d, x: state.resize.x, y: state.resize.y, w: state.resize.w, h: state.resize.h } : d;
      const mat = state.resize?.key === `d:${d.id}` ? null : (carried(t, `d:${d.id}`, d.x, d.y, d.rotation) ?? (t?.decorations.has(d.id) ? m : null));
      withMove(ctx, mat, () => {
        const corners = boxCorners(shown.x, shown.y, decorationWidth(shown), shown.h, shown.rotation);
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
      const shown = state.resize?.key === `p:${p.id}` ? { ...p, x: state.resize.x, y: state.resize.y, w: state.resize.w, h: state.resize.h } : p;
      const mat = state.resize?.key === `p:${p.id}` ? null : (carried(t, `p:${p.id}`, p.x, p.y, p.rotation) ?? (t?.pois.has(p.id) ? m : null));
      withMove(ctx, mat, () => {
        const corners = boxCorners(shown.x, shown.y, shown.w, shown.h, shown.rotation);
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
    blitPlate(ctx, dpr);
    screen();
    const toScreen = (x: number, y: number, mat: ReturnType<typeof rigidMatrix> | null): Point => {
      if (mat) {
        const wx = mat[0] * x + mat[2] * y + mat[4];
        const wy = mat[1] * x + mat[3] * y + mat[5];
        return [wx * scale + tx, wy * scale + ty];
      }
      return [x * scale + tx, y * scale + ty];
    };

    if (SEAT_RADIUS * scale < LOD_SEAT_LABELS) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const si of visible) {
        const s = scene.sections[si];
        if (!s.label.visible || s.display !== "seats" || s.loose) continue;
        const size = s.label.size * scale;
        if (size < 7) continue;
        const fontPx = Math.min(size, 22);
        const override = t?.preview?.outlines.get(si);
        let lx = s.label.x;
        let ly = s.label.y;
        let rigid = t?.sections.has(si) ?? false;
        if (override) {
          const oldC = centroid(s.points);
          const nextC = centroid(override);
          lx += nextC[0] - oldC[0];
          ly += nextC[1] - oldC[1];
          rigid = false;
        }
        const pose = this.pose(state.craft, `s:${s.id}`);
        if (pose && pose.alpha <= 0.003) continue;
        const [x, y] = pose
          ? arrivedScreen(lx, ly, ...sectionCenter(scene, si), pose, scale, tx, ty)
          : toScreen(lx, ly, rigid && m ? m : null);
        ctx.save();
        ctx.translate(x, y);
        if (pose) ctx.scale(pose.scale, pose.scale);
        if (s.label.rotation) ctx.rotate(toRad(s.label.rotation));
        ctx.font = `600 ${fontPx}px ${frame.font}`;
        const w = ctx.measureText(s.label.text).width + fontPx * 0.8;
        const h = fontPx * 1.35;
        const fade = lod === "dots" ? 0.85 : 1;
        paintSoft(ctx, pose?.spread ?? 0, fade * (pose?.alpha ?? 1), 1, () => {
          ctx.fillStyle = scene.colors[s.color].label;
          ctx.beginPath();
          ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(6, h / 2));
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.fillText(s.label.text, 0, fontPx * 0.04);
        });
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // Text decorations.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const d of scene.decorations) {
      if (d.kind !== "text" || !d.label) continue;
      const shown = state.resize?.key === `d:${d.id}` ? { ...d, x: state.resize.x, y: state.resize.y, h: state.resize.h } : d;
      const size = shown.h * scale;
      if (size < 5) continue;
      const ride = t?.preview?.rides.get(`d:${d.id}`);
      const mat = state.resize?.key === `d:${d.id}` ? null : (carried(t, `d:${d.id}`, d.x, d.y, d.rotation) ?? (t?.decorations.has(d.id) ? m : null));
      const pose = state.resize?.key === `d:${d.id}` ? null : this.pose(state.craft, `d:${d.id}`);
      const [x, y] = pose ? arrivedScreen(shown.x, shown.y, shown.x, shown.y, pose, scale, tx, ty) : toScreen(shown.x, shown.y, mat);
      const rotation = ride?.rotation ?? shown.rotation;
      ctx.save();
      ctx.translate(x, y);
      if (pose) ctx.scale(pose.scale, pose.scale);
      if (rotation) ctx.rotate(toRad(rotation));
      ctx.font = `600 ${size}px ${frame.font}`;
      const base = ctx.globalAlpha;
      if (pose && pose.ghost > 0.003) {
        const w = ctx.measureText(shown.label).width;
        ctx.globalAlpha = base * pose.ghost;
        const bar = new Path2D();
        const top = -size * 0.4;
        const barH = size * 0.8;
        bar.roundRect(-w / 2, top, w, barH, Math.min(6, size * 0.2));
        shimmerClip(ctx, bar, { minX: -w / 2, minY: top, maxX: w / 2, maxY: top + barH }, true);
      }
      if (!pose || pose.alpha > 0.003) {
        ctx.globalAlpha = base;
        paintSoft(ctx, pose?.spread ?? 0, pose?.alpha ?? 1, 1, () => {
          ctx.fillStyle = shown.color;
          ctx.fillText(shown.label, 0, 0);
        });
      }
      ctx.restore();
    }

    // Points of interest at a fixed screen size.
    for (const p of scene.pois) {
      if (sizedPoi(p.kind, p.w, p.h)) continue;
      const mat = carried(t, `p:${p.id}`, p.x, p.y, p.rotation) ?? (t?.pois.has(p.id) ? m : null);
      const pose = this.pose(state.craft, `p:${p.id}`);
      const [x, y] = pose ? arrivedScreen(p.x, p.y, p.x, p.y, pose, scale, tx, ty) : toScreen(p.x, p.y, mat);
      if (x < -40 || y < -40 || x > width + 40 || y > height + 40) continue;
      const style = POI_STYLE[p.kind];
      const selected = state.selection.has(`p:${p.id}`);
      ctx.save();
      ctx.translate(x, y);
      if (pose) ctx.scale(pose.scale, pose.scale);
      if (pose) {
        const base = ctx.globalAlpha;
        if (pose.ghost > 0.003) {
          ctx.globalAlpha = base * pose.ghost;
          const dot = new Path2D();
          dot.arc(0, 0, POI_SCREEN_RADIUS, 0, TAU);
          shimmerClip(ctx, dot, {
            minX: -POI_SCREEN_RADIUS,
            minY: -POI_SCREEN_RADIUS,
            maxX: POI_SCREEN_RADIUS,
            maxY: POI_SCREEN_RADIUS,
          }, true);
        }
        if (pose.alpha <= 0.003) {
          ctx.restore();
          continue;
        }
        ctx.globalAlpha = base;
      }
      paintSoft(ctx, pose?.spread ?? 0, pose?.alpha ?? 1, 1, () => {
      ctx.beginPath();
      ctx.arc(0, 0, POI_SCREEN_RADIUS, 0, TAU);
      ctx.fillStyle = style.color;
      ctx.fill();
      ctx.lineWidth = selected ? 3 : 2;
      ctx.strokeStyle = selected ? ACCENT : "#fff";
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = `700 11px ${frame.font}`;
      ctx.fillText(style.glyph, 0, 0.5);
      if (p.label) {
        ctx.font = `500 11px ${frame.font}`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.strokeText(p.label, 0, POI_SCREEN_RADIUS + 9);
        ctx.fillStyle = "#404040";
        ctx.fillText(p.label, 0, POI_SCREEN_RADIUS + 9);
      }
      });
      ctx.restore();
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

    // Sections touched by a drag are rebuilt per frame; the rest reuse cached paths.
    const dirty = new Set<number>();
    if (t) {
      for (const si of t.sections) dirty.add(si);
      for (const ri of t.rows) dirty.add(scene.rows[ri].section);
      if (t.preview) {
        for (let si = 0; si < scene.sections.length; si++) {
          const s = scene.sections[si];
          if (sectionWrapped(t, s.seatStart, s.seatEnd)) dirty.add(si);
        }
      }
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

    const falling: number[] = [];
    for (let si = 0; si < scene.sections.length; si++) {
      const s = scene.sections[si];
      if (s.display === "block") continue;
      const pose = this.pose(state.craft, `s:${s.id}`);
      if (pose && !dirty.has(si)) {
        falling.push(si);
        continue;
      }
      if (s.seatEnd === s.seatStart || !boundsIntersect(view, cache.bounds[si])) continue;
      if (dirty.has(si)) {
        for (let i = s.seatStart; i < s.seatEnd; i++) if (scene.seatLive[i] && !seatHidden(t, i)) add(loose[s.color], xs[i], ys[i]);
      } else {
        cached[s.color].push(si);
      }
      // Sold and held seats paint over the base colour.
      if (status) {
        for (let i = s.seatStart; i < s.seatEnd; i++) {
          const st = status[i];
          if (st && scene.seatLive[i] && !seatHidden(t, i)) add(loose[st === SEAT_SOLD ? sold : held], xs[i], ys[i]);
        }
      }
    }
    // Moving seats may sit far from their section's cached bounds.
    if (t && (m || t.preview)) {
      const drawMoved = (i: number) => {
        if (!scene.seatLive[i]) return;
        const st = status ? status[i] : 0;
        const [x, y] = placed(t, m, i, xs[i], ys[i]);
        add(loose[st === SEAT_SOLD ? sold : st === SEAT_HELD ? held : scene.sections[scene.rows[rowOf[i]].section].color], x, y);
      };
      if (t.preview) for (let i = 0; i < t.preview.live.length; i++) if (t.preview.live[i]) drawMoved(i);
      for (let k = 0; k < t.seats.length; k++) if (!t.preview?.live[t.seats[k]]) drawMoved(t.seats[k]);
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

    for (const si of falling) {
      const s = scene.sections[si];
      if (s.seatEnd === s.seatStart) continue;
      const pose = this.pose(state.craft, `s:${s.id}`);
      const [cx, cy] = sectionCenter(scene, si);
      withArrival(ctx, pose, cx, cy, this.unit, () => {
        const g = pen ?? ctx;
        const p = sectionSeatPath(scene, si, round);
        g.fillStyle = scene.colors[s.color].base;
        if (outline) g.strokeStyle = scene.colors[s.color].disc;
        g.fill(p);
        if (outline) g.stroke(p);
      });
    }

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
            if (scene.seatLive[i] && !seatHidden(t, i)) {
              const pose = this.pose(state.craft, `s:${scene.sections[scene.rows[rowOf[i]].section].id}`);
              if (pose && !pose.settled) continue;
              drawn.push(i);
            }
          }
        }
      }
    }

    // Selected rows and the hovered seat.
    const highlight = new Path2D();
    let any = false;
    const paint = (i: number) => {
      if (!scene.seatLive[i]) return;
      const [x, y] = placed(t, m, i, xs[i], ys[i]);
      highlight.moveTo(x + r, y);
      highlight.arc(x, y, r, 0, TAU);
      any = true;
    };
    for (const key of state.selection) {
      if (key.startsWith("r:")) {
        const ri = scene.rowIndex.get(key.slice(2));
        if (ri === undefined) continue;
        const row = scene.rows[ri];
        for (let i = row.seatStart; i < row.seatEnd; i++) paint(i);
      } else if (key.startsWith("c:")) {
        const cut = key.lastIndexOf(":");
        const ri = scene.rowIndex.get(key.slice(2, cut));
        const index = Number(key.slice(cut + 1));
        if (ri === undefined || !Number.isInteger(index)) continue;
        const row = scene.rows[ri];
        const i = row.seatStart + index;
        if (i < row.seatStart || i >= row.seatEnd) continue;
        paint(i);
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
      const rowPose = this.pose(state.craft, `s:${scene.sections[row.section].id}`);
      if (rowPose && !rowPose.settled) continue;
      if (!boundsIntersect(view, row.bounds)) continue;
      if (t && (t.rows.has(ri) || t.sections.has(row.section))) continue;
      let first = -1;
      let second = -1;
      let prev = -1;
      let last = -1;
      for (let i = row.seatStart; i < row.seatEnd; i++) {
        if (!scene.seatLive[i]) continue;
        if (first < 0) first = i;
        else if (second < 0) second = i;
        prev = last;
        last = i;
      }
      if (first < 0 || prev < 0) continue;
      for (const [a, b] of [
        [first, second < 0 ? last : second],
        [last, prev],
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
      const label = String(scene.seatNumber[i]);
      if (scene.seatWheelchair[i]) {
        // Icon in the upper half, number in the lower half.
        const px = seatPx * grown;
        drawWheelchair(ctx, x, y - px * 0.36, px * 0.4);
        const size = px * (label.length > 2 ? 0.5 : 0.6);
        ctx.font = `700 ${size}px ${frame.font}`;
        ctx.fillStyle = "#fff";
        ctx.fillText(label, x, y + px * 0.46);
        continue;
      }
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
    const xs = scene.seatX;
    const ys = scene.seatY;
    ctx.lineWidth = 1.6 / camera.scale;
    for (const pop of pops) {
      if (pop.scale <= 1.004) continue;
      const i = pop.index;
      if (i < 0 || i >= xs.length) continue;
      const section = scene.sections[scene.rows[scene.seatRow[i]].section];
      if (section.display === "block") continue;
      const [x, y] = placed(state.transient, m, i, xs[i], ys[i]);
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

  private drawTables(ctx: CanvasRenderingContext2D, scene: Scene, state: RenderState, t: Transient | null, m: ReturnType<typeof rigidMatrix> | null) {
    for (const s of scene.sections) {
      if (s.display === "block" && s.label.visible) {
        const pose = this.pose(state.craft, `s:${s.id}`);
        const [cx, cy] = sectionCenter(scene, s.index);
        withArrival(ctx, pose, cx, cy, this.unit, () => {
          const g = pen ?? ctx;
          g.save();
          g.translate(s.label.x, s.label.y);
          if (s.label.rotation) g.rotate(toRad(s.label.rotation));
          const size = s.label.size;
          g.fillStyle = inkOn(scene.colors[s.color].base);
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
          g.fillText(s.label.text, 0, 0);
          g.restore();
        });
        continue;
      }
      if (s.display !== "round-table" && s.display !== "rect-table") continue;
      const row = scene.doc.sections[s.index].rows[0];
      if (!row) continue;
      const resized = state.resize?.key === `s:${s.id}` ? state.resize : null;
      const ride = t?.preview?.rides.get(`s:${s.id}`);
      const x = resized?.x ?? ride?.x ?? row.x;
      const y = resized?.y ?? ride?.y ?? row.y;
      const w = resized?.w ?? row.boxW;
      const h = resized?.h ?? row.boxH;
      const rotation = ride?.rotation ?? row.rotation;
      const pose = resized || ride ? null : this.pose(state.craft, `s:${s.id}`);
      withMove(ctx, resized || ride ? null : t?.sections.has(s.index) ? m : null, () => {
        withArrival(ctx, pose, x, y, this.unit, () => {
          const g = pen ?? ctx;
          g.save();
          g.translate(x, y);
          if (rotation) g.rotate(toRad(rotation));
          g.fillStyle = "#3f3f46";
          g.beginPath();
          if (s.display === "round-table") g.arc(0, 0, Math.max(w, h) / 2, 0, TAU);
          else g.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.12);
          g.fill();
          const size = Math.min(w, h) * 0.34;
          g.fillStyle = "#fafafa";
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
          g.fillText(s.label.text, 0, size * 0.04);
          g.restore();
        }, () => {
          const d = Math.max(w, h);
          ghostBox(ctx, x, y, s.display === "round-table" ? d : w, s.display === "round-table" ? d : h, rotation, s.display === "round-table" ? "ellipse" : Math.min(w, h) * 0.12);
        });
      });
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
    if (!scene.seatLive[i]) continue;
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

/** Where a seat is drawn this frame: the rewrapped position, else the rigid drag, else where it was. */
function placed(t: Transient | null, m: ReturnType<typeof rigidMatrix> | null, i: number, x: number, y: number): [number, number] {
  const preview = t?.preview;
  if (preview?.live[i]) return [preview.x[i], preview.y[i]];
  if (m && t?.seatMask[i]) return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  return [x, y];
}

function seatHidden(t: Transient | null, i: number) {
  return Boolean(t && (t.seatMask[i] || t.preview?.live[i]));
}

function sectionWrapped(t: Transient, from: number, to: number) {
  const live = t.preview?.live;
  if (!live) return false;
  for (let i = from; i < to; i++) if (live[i]) return true;
  return false;
}

/** A row stripe through seats that were wrapped again while dragging. */
function wrappedStripe(scene: Scene, t: Transient, section: number, onlyRow?: number) {
  const path = new Path2D();
  const s = scene.sections[section];
  const preview = t.preview;
  if (!preview) return path;
  for (let r = s.rowStart; r < s.rowEnd; r++) {
    if (onlyRow !== undefined && r !== onlyRow) continue;
    const row = scene.rows[r];
    let started = false;
    for (let i = row.seatStart; i < row.seatEnd; i++) {
      if (!scene.seatLive[i] || !preview.live[i]) continue;
      if (!started) {
        path.moveTo(preview.x[i], preview.y[i]);
        started = true;
      } else path.lineTo(preview.x[i], preview.y[i]);
    }
  }
  return path;
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

/** The turn that keeps an object beside a section sliding along the venue. */
function carried(t: Transient | null, id: string, x: number, y: number, rotation: number) {
  const next = t?.preview?.rides.get(id);
  if (!next) return null;
  return rigidMatrix({ angle: next.rotation - rotation, px: x, py: y, dx: next.x - x, dy: next.y - y });
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
  const fade = ctx.globalAlpha;
  ctx.translate(d.x, d.y);
  if (d.rotation) ctx.rotate(toRad(d.rotation));
  const w = d.w;
  const h = d.h;
  if (d.kind === "field") {
    drawField(ctx, w, h, d.color, px);
  } else if (d.kind === "venue") {
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, Math.max(0, Math.min(d.radius, w / 2, h / 2)));
    ctx.globalAlpha = 0.16 * fade;
    ctx.fillStyle = d.color;
    ctx.fill();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = d.color;
    ctx.lineWidth = Math.max(px * 2, Math.min(w, h) * 0.006);
    ctx.stroke();
    if (d.label) {
      const size = Math.min(h * 0.12, (w / Math.max(4, d.label.length)) * 1.2);
      ctx.fillStyle = d.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(d.label, 0, size * 0.04);
    }
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
  } else if (d.kind === "wall" || d.kind === "column") {
    ctx.fillStyle = "#d4d4d4";
    ctx.beginPath();
    if (d.kind === "wall") ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.06);
    else ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU);
    ctx.fill();
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
    const radius = Math.min(w, h) * 0.12;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, radius);
    ctx.fillStyle = "#d4d4d4";
    ctx.fill();
    const glyph = Math.min(w, h, 18) * 0.72;
    ctx.beginPath();
    ctx.moveTo(-glyph * 0.05, -glyph * 0.5);
    ctx.lineTo(glyph * 0.42, -glyph * 0.5);
    ctx.lineTo(glyph * 0.42, -glyph * 0.16);
    ctx.lineTo(-glyph * 0.05, -glyph * 0.16);
    ctx.lineTo(-glyph * 0.05, glyph * 0.16);
    ctx.lineTo(-glyph * 0.5, glyph * 0.16);
    ctx.lineTo(-glyph * 0.5, glyph * 0.5);
    ctx.strokeStyle = "#404040";
    ctx.lineWidth = Math.max(px * 1.3, glyph * 0.14);
    ctx.lineJoin = "miter";
    ctx.lineCap = "square";
    ctx.stroke();
  } else {
    const radius = Math.min(w, h) * 0.12;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, radius);
    ctx.fillStyle = "#d4d4d4";
    ctx.fill();
    const g = Math.min(w, h, 22) * 0.34;
    ctx.beginPath();
    ctx.strokeStyle = "#404040";
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
  const r = Math.max(2.5, size);
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
