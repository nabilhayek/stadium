import type { Interaction, PointerInfo, SeatMapEngine } from "@/lib/seatmap/engine/engine";
import { ACCENT } from "@/lib/seatmap/engine/canvas-renderer";
import {
  blockFacingFocal,
  curvedRow,
  makeLoge,
  makeRow,
  makeSection,
  makeTable,
  nextRowLabel,
  normalizeAngle,
  placeRow,
  pointInPolygon,
  rotation,
  rowFromSegment,
  snap,
  stepLabel,
  toDeg,
  translation,
  type Point,
  type Rigid,
} from "@/lib/seatmap/geometry";
import {
  DEFAULT_ROW_PITCH,
  MAX_ROWS_PER_SECTION,
  SEAT_RADIUS,
  newId,
  type DecorationKind,
  type PoiKind,
  type SeatMapDoc,
  type SeatMapRow,
} from "@/lib/seatmap/schema";
import { addRows, keyOf, selectionBounds, setSectionPoints, transformSelection, transientOf, type Selection } from "./ops";

export type ShapeKind = Exclude<DecorationKind, "text">;
export type ToolId =
  | "select"
  | "hand"
  | "section"
  | "rect-section"
  | "loge"
  | "table-round"
  | "table-rect"
  | "row"
  | "curved-row"
  | "row-block"
  | "focal"
  | "text"
  | `shape:${ShapeKind}`
  | `poi:${PoiKind}`;

export type ToolHost = {
  engine: SeatMapEngine;
  doc(): SeatMapDoc;
  selection(): Selection;
  select(keys: Set<string>): void;
  commit(doc: SeatMapDoc, selection?: Set<string>): void;
  setTool(tool: ToolId): void;
  snapStep(): number;
  defaultCategory(): string | null;
  notify(message: string): void;
};

type Gesture =
  | { kind: "none" }
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number; additive: boolean }
  | { kind: "move"; wx: number; wy: number; sx: number; sy: number; started: boolean; transform: Rigid; solo: string | null }
  | { kind: "rotate"; px: number; py: number; a0: number; angle: number }
  | { kind: "vertex"; sectionId: string; section: number; index: number; points: Point[] }
  | { kind: "box"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "segment"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "focal"; x: number; y: number };

/** Second step of two-step tools: bend a curved row, or spread a row into a block. */
type Phase = { kind: "bend" | "spread"; x0: number; y0: number; x1: number; y1: number } | null;

const HANDLE = 7;
const ROTATE_OFFSET = 28;
const POI_LABEL: Record<PoiKind, string> = { kitchen: "Kitchen", entrance: "A", exit: "A", stairs: "", pickup: "Pickup" };

export class ToolController implements Interaction {
  tool: ToolId = "select";
  private gesture: Gesture = { kind: "none" };
  private polygon: Point[] = [];
  private phase: Phase = null;
  private cursor: Point | null = null;
  private alt = false;

  constructor(private host: ToolHost) {}

  setTool(tool: ToolId) {
    this.cancel();
    this.polygon = [];
    this.phase = null;
    this.tool = tool;
    this.host.engine.setCursor(this.cursorFor(null));
    this.host.engine.invalidate();
  }

  /** True while a multi-click tool has unfinished work Esc should discard. */
  get busy() {
    return this.polygon.length > 0 || this.phase !== null || this.gesture.kind !== "none";
  }

  /* ---------- Interaction ---------- */

  down(p: PointerInfo): boolean {
    if (this.tool === "hand") return false;
    this.alt = p.alt;
    const [wx, wy] = this.snapped(p);
    this.cursor = [wx, wy];

    switch (this.tool) {
      case "select":
        return this.selectDown(p);
      case "section": {
        const first = this.polygon[0];
        if (first && this.polygon.length >= 3) {
          const [fx, fy] = this.host.engine.camera.toScreen(first[0], first[1]);
          if (Math.hypot(fx - p.sx, fy - p.sy) <= HANDLE + 2) {
            this.finishPolygon();
            return true;
          }
        }
        const last = this.polygon[this.polygon.length - 1];
        if (!last || last[0] !== wx || last[1] !== wy) this.polygon.push([wx, wy]);
        this.host.engine.invalidate();
        return true;
      }
      case "rect-section":
      case "loge":
      case "table-round":
      case "table-rect":
      case "shape:stage":
      case "shape:field":
      case "shape:rect":
      case "shape:ellipse":
      case "poi:stairs":
      case "poi:entrance":
        this.gesture = { kind: "box", x0: wx, y0: wy, x1: wx, y1: wy };
        return true;
      case "focal":
        this.gesture = { kind: "focal", x: wx, y: wy };
        this.host.engine.state.focalDrag = [wx, wy];
        this.host.engine.touch();
        return true;
      case "poi:exit":
      case "row":
        this.gesture = { kind: "segment", x0: wx, y0: wy, x1: wx, y1: wy };
        return true;
      case "curved-row":
      case "row-block":
        if (this.phase) {
          this.finishPhase();
          return true;
        }
        this.gesture = { kind: "segment", x0: wx, y0: wy, x1: wx, y1: wy };
        return true;
      case "text":
        this.addText(wx, wy);
        return true;
      default:
        if (this.tool.startsWith("poi:")) {
          this.addPoi(this.tool.slice(4) as PoiKind, wx, wy);
          return true;
        }
        return false;
    }
  }

  move(p: PointerInfo) {
    this.alt = p.alt;
    const [wx, wy] = this.snapped(p);
    this.cursor = [wx, wy];
    const g = this.gesture;
    const engine = this.host.engine;

    switch (g.kind) {
      case "marquee":
        g.x1 = p.sx;
        g.y1 = p.sy;
        engine.invalidate();
        return;
      case "move": {
        if (!g.started) {
          if (Math.hypot(p.sx - g.sx, p.sy - g.sy) < 3) return;
          g.started = true;
          const scene = engine.scene;
          if (scene) engine.beginTransient(transientOf(scene, this.host.selection()));
        }
        const step = this.step();
        g.transform = translation(snap(p.wx - g.wx, step), snap(p.wy - g.wy, step));
        engine.updateTransient(g.transform);
        return;
      }
      case "rotate": {
        let angle = toDeg(Math.atan2(p.wy - g.py, p.wx - g.px)) - g.a0;
        if (p.shift) angle = Math.round(angle / 15) * 15;
        g.angle = normalizeAngle(angle);
        engine.updateTransient(rotation(g.angle, g.px, g.py));
        return;
      }
      case "vertex":
        g.points = g.points.map((pt, i) => (i === g.index ? [wx, wy] : pt));
        engine.state.outline = { section: g.section, points: g.points };
        engine.touch();
        return;
      case "box":
      case "segment":
        g.x1 = wx;
        g.y1 = wy;
        engine.invalidate();
        return;
      case "focal":
        g.x = wx;
        g.y = wy;
        engine.state.focalDrag = [wx, wy];
        engine.touch();
        return;
      default:
        this.hover(p);
    }
  }

  up(p: PointerInfo) {
    const g = this.gesture;
    this.gesture = { kind: "none" };
    const engine = this.host.engine;

    switch (g.kind) {
      case "marquee":
        this.finishMarquee(g);
        return;
      case "move": {
        if (!g.started) {
          if (g.solo) this.host.select(new Set([g.solo]));
          return;
        }
        if (!g.transform.dx && !g.transform.dy) return engine.endTransient();
        this.host.commit(transformSelection(this.host.doc(), this.host.selection(), g.transform));
        return;
      }
      case "rotate":
        if (!g.angle) return engine.endTransient();
        this.host.commit(transformSelection(this.host.doc(), this.host.selection(), rotation(g.angle, g.px, g.py)));
        return;
      case "vertex":
        this.host.commit(setSectionPoints(this.host.doc(), g.sectionId, g.points));
        return;
      case "box":
        this.finishBox(g);
        return;
      case "segment":
        this.finishSegment(g);
        return;
      case "focal":
        engine.state.focalDrag = null;
        this.host.commit({ ...this.host.doc(), focal: { x: g.x, y: g.y } });
        return;
    }
    this.hover(p);
  }

  cancel() {
    const g = this.gesture;
    this.gesture = { kind: "none" };
    const engine = this.host.engine;
    if (g.kind === "focal") engine.state.focalDrag = null;
    if (g.kind === "move" || g.kind === "rotate") engine.endTransient();
    if (g.kind === "vertex") {
      engine.state.outline = null;
      engine.invalidate();
    }
    engine.invalidate();
  }

  hover(p: PointerInfo) {
    this.alt = p.alt;
    this.cursor = this.snapped(p);
    this.host.engine.setCursor(this.cursorFor(p));
    if (this.tool !== "select" && this.tool !== "hand") this.host.engine.invalidate();
  }

  dblclick(p: PointerInfo) {
    if (this.tool === "section") {
      this.finishPolygon();
      return;
    }
    if (this.tool !== "select") return;
    const vertex = this.vertexAt(p);
    if (vertex && vertex.kind === "vertex") {
      const section = this.host.doc().sections.find((s) => s.id === vertex.sectionId);
      if (section && section.points.length > 3) {
        this.host.commit(setSectionPoints(this.host.doc(), section.id, section.points.filter((_, i) => i !== vertex.index)));
      }
      return;
    }
    const hit = this.host.engine.hitAt(p.sx, p.sy);
    const scene = this.host.engine.scene;
    if (hit?.kind === "seat" && scene) this.host.select(new Set([keyOf("s", scene.sections[hit.section].id)]));
  }

  /** Keys the designer forwards while a tool is active. Returns true when handled. */
  key(e: KeyboardEvent): boolean {
    if (e.key === "Escape" && this.busy) {
      this.cancel();
      this.polygon = [];
      this.phase = null;
      this.host.engine.invalidate();
      return true;
    }
    if (e.key === "Enter" && this.tool === "section" && this.polygon.length >= 3) {
      this.finishPolygon();
      return true;
    }
    if ((e.key === "Backspace" || e.key === "Delete") && this.tool === "section" && this.polygon.length) {
      this.polygon.pop();
      this.host.engine.invalidate();
      return true;
    }
    return false;
  }

  /* ---------- select tool ---------- */

  private selectDown(p: PointerInfo): boolean {
    const engine = this.host.engine;
    const scene = engine.scene;
    if (!scene) return true;
    const sel = this.host.selection();

    const focal = scene.doc.focal;
    if (focal) {
      const [sx, sy] = engine.camera.toScreen(focal.x, focal.y);
      if (Math.hypot(sx - p.sx, sy - p.sy) <= 12) {
        const [x, y] = this.snapped(p);
        this.gesture = { kind: "focal", x, y };
        engine.state.focalDrag = [x, y];
        engine.touch();
        return true;
      }
    }

    const handle = this.vertexAt(p);
    if (handle) {
      const section = scene.sections[handle.section];
      let points = section.points.slice();
      let index = handle.index;
      if (handle.kind === "midpoint") {
        points = [...points.slice(0, index + 1), [handle.x, handle.y] as Point, ...points.slice(index + 1)];
        index += 1;
      }
      this.gesture = { kind: "vertex", sectionId: section.id, section: handle.section, index, points };
      engine.state.outline = { section: handle.section, points };
      engine.invalidate();
      return true;
    }

    const rotate = this.rotateHandle();
    if (rotate && Math.hypot(rotate.hx - p.sx, rotate.hy - p.sy) <= HANDLE + 2) {
      const [px, py] = rotate.pivot;
      engine.beginTransient(transientOf(scene, sel));
      this.gesture = { kind: "rotate", px, py, a0: toDeg(Math.atan2(p.wy - py, p.wx - px)), angle: 0 };
      return true;
    }

    const hit = engine.hitAt(p.sx, p.sy);
    const key =
      hit?.kind === "seat"
        ? keyOf("r", scene.rows[hit.row].id)
        : hit?.kind === "section"
          ? keyOf("s", scene.sections[hit.section].id)
          : hit?.kind === "decoration"
            ? keyOf("d", hit.id)
            : hit?.kind === "poi"
              ? keyOf("p", hit.id)
              : null;

    if (!key) {
      this.gesture = { kind: "marquee", x0: p.sx, y0: p.sy, x1: p.sx, y1: p.sy, additive: p.shift };
      if (!p.shift && sel.size) this.host.select(new Set());
      return true;
    }
    if (p.shift) {
      const next = new Set(sel);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      this.host.select(next);
      return true;
    }
    let solo: string | null = null;
    if (!sel.has(key)) this.host.select(new Set([key]));
    else if (sel.size > 1) solo = key;
    this.gesture = { kind: "move", wx: p.wx, wy: p.wy, sx: p.sx, sy: p.sy, started: false, transform: translation(0, 0), solo };
    return true;
  }

  private finishMarquee(g: Extract<Gesture, { kind: "marquee" }>) {
    const engine = this.host.engine;
    const scene = engine.scene;
    engine.invalidate();
    if (!scene || Math.abs(g.x1 - g.x0) < 3 || Math.abs(g.y1 - g.y0) < 3) return;
    const [ax, ay] = engine.camera.toWorld(Math.min(g.x0, g.x1), Math.min(g.y0, g.y1));
    const [bx, by] = engine.camera.toWorld(Math.max(g.x0, g.x1), Math.max(g.y0, g.y1));
    const inside = (x: number, y: number) => x >= ax && x <= bx && y >= ay && y <= by;
    const found = new Set<string>();

    // Whole sections first; if none fall inside, the box picks rows instead.
    for (const s of scene.sections) {
      const b = s.bounds;
      if (inside((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2)) found.add(keyOf("s", s.id));
    }
    if (!found.size && engine.seatsVisible()) {
      for (const r of scene.rows) {
        const mid = (r.seatStart + r.seatEnd) >> 1;
        if (inside(scene.seatX[mid], scene.seatY[mid])) found.add(keyOf("r", r.id));
      }
    }
    for (const d of scene.decorations) if (inside(d.x, d.y)) found.add(keyOf("d", d.id));
    for (const p of scene.pois) if (inside(p.x, p.y)) found.add(keyOf("p", p.id));

    this.host.select(g.additive ? new Set([...this.host.selection(), ...found]) : found);
  }

  /** Corner and midpoint handles of the one selected section. */
  private vertexAt(p: PointerInfo): { kind: "vertex" | "midpoint"; section: number; sectionId: string; index: number; x: number; y: number } | null {
    if (this.tool !== "select") return null;
    const scene = this.host.engine.scene;
    const sel = this.host.selection();
    if (!scene || sel.size !== 1) return null;
    const [key] = sel;
    if (!key.startsWith("s:")) return null;
    const si = scene.sectionIndex.get(key.slice(2));
    if (si === undefined) return null;
    const pts = scene.sections[si].points;
    const cam = this.host.engine.camera;
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = cam.toScreen(pts[i][0], pts[i][1]);
      if (Math.abs(x - p.sx) <= HANDLE && Math.abs(y - p.sy) <= HANDLE) return { kind: "vertex", section: si, sectionId: key.slice(2), index: i, x: pts[i][0], y: pts[i][1] };
    }
    if (pts.length >= 120) return null;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const [x, y] = cam.toScreen(mx, my);
      const [ax, ay] = cam.toScreen(a[0], a[1]);
      const [bx, by] = cam.toScreen(b[0], b[1]);
      if (Math.hypot(bx - ax, by - ay) < 36) continue;
      if (Math.hypot(x - p.sx, y - p.sy) <= HANDLE - 1) return { kind: "midpoint", section: si, sectionId: key.slice(2), index: i, x: mx, y: my };
    }
    return null;
  }

  private rotateHandle() {
    if (this.tool !== "select") return null;
    const scene = this.host.engine.scene;
    const sel = this.host.selection();
    if (!scene || !sel.size) return null;
    const b = selectionBounds(scene, sel);
    if (!b) return null;
    const cam = this.host.engine.camera;
    const [x0, y0] = cam.toScreen(b.minX, b.minY);
    const [x1, y1] = cam.toScreen(b.maxX, b.maxY);
    const pivot: Point = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
    return { x0, y0, x1, y1, hx: (x0 + x1) / 2, hy: y0 - ROTATE_OFFSET, pivot };
  }

  private cursorFor(p: PointerInfo | null): string {
    switch (this.tool) {
      case "hand":
        return "grab";
      case "select": {
        if (!p) return "default";
        const handle = this.vertexAt(p);
        if (handle) return handle.kind === "vertex" ? "move" : "copy";
        const rotate = this.rotateHandle();
        if (rotate && Math.hypot(rotate.hx - p.sx, rotate.hy - p.sy) <= HANDLE + 2) return "alias";
        return this.host.engine.hitAt(p.sx, p.sy) ? "pointer" : "default";
      }
      case "text":
        return "text";
      default:
        return "crosshair";
    }
  }

  /* ---------- drawing tools ---------- */

  private step() {
    return this.alt ? 0 : this.host.snapStep();
  }

  private snapped(p: PointerInfo): Point {
    const s = this.step();
    return [snap(p.wx, s), snap(p.wy, s)];
  }

  private finishPolygon() {
    const pts = this.polygon.filter((pt, i, all) => i === 0 || pt[0] !== all[i - 1][0] || pt[1] !== all[i - 1][1]);
    this.polygon = [];
    this.host.engine.invalidate();
    if (pts.length < 3) return;
    const doc = this.host.doc();
    const section = makeSection(doc, pts, this.host.defaultCategory());
    this.host.commit({ ...doc, sections: [...doc.sections, section] }, new Set([keyOf("s", section.id)]));
    this.host.setTool("select");
  }

  private finishBox(g: Extract<Gesture, { kind: "box" }>) {
    const engine = this.host.engine;
    engine.invalidate();
    const doc = this.host.doc();
    let w = Math.abs(g.x1 - g.x0);
    let h = Math.abs(g.y1 - g.y0);
    let cx = (g.x0 + g.x1) / 2;
    let cy = (g.y0 + g.y1) / 2;

    if (this.tool === "poi:stairs") {
      if (w < 8 || h < 8) {
        w = 16;
        h = 80;
        cx = g.x0;
        cy = g.y0;
      }
      this.addPoi("stairs", cx, cy, { w, h, rotation: 0, label: "" });
      return;
    }

    if (this.tool === "poi:entrance") {
      if (w < 8 || h < 8) {
        w = 32;
        h = 32;
        cx = g.x0;
        cy = g.y0;
      }
      this.addPoi("entrance", cx, cy, { w, h, rotation: 0, label: "" });
      return;
    }

    if (this.tool === "loge" || this.tool === "rect-section" || this.tool === "table-round" || this.tool === "table-rect") {
      if (w < 10 || h < 10) {
        if (this.tool === "table-round" || this.tool === "table-rect") {
          w = this.tool === "table-round" ? 28 : 22;
          h = this.tool === "table-round" ? 28 : 36;
          cx = g.x0;
          cy = g.y0;
        } else return this.host.notify("Drag to draw the area.");
      }
      const category = this.host.defaultCategory();
      const section =
        this.tool === "loge"
          ? makeLoge(
              doc,
              [
                [Math.min(g.x0, g.x1), Math.min(g.y0, g.y1)],
                [Math.max(g.x0, g.x1), Math.min(g.y0, g.y1)],
                [Math.max(g.x0, g.x1), Math.max(g.y0, g.y1)],
                [Math.min(g.x0, g.x1), Math.max(g.y0, g.y1)],
              ],
              category,
            )
          : this.tool === "table-round" || this.tool === "table-rect"
            ? makeTable(doc, this.tool === "table-round" ? "round" : "rect", cx, cy, w, h, category)
            : makeSection(
                doc,
                [
                  [Math.min(g.x0, g.x1), Math.min(g.y0, g.y1)],
                  [Math.max(g.x0, g.x1), Math.min(g.y0, g.y1)],
                  [Math.max(g.x0, g.x1), Math.max(g.y0, g.y1)],
                  [Math.min(g.x0, g.x1), Math.max(g.y0, g.y1)],
                ],
                category,
              );
      this.host.commit({ ...doc, sections: [...doc.sections, section] }, new Set([keyOf("s", section.id)]));
      this.host.setTool("select");
      return;
    }

    const kind = this.tool.slice(6) as ShapeKind;
    if (w < 8 || h < 8) {
      // A click drops a default-sized shape.
      const size = { stage: [240, 90], field: [1050, 680], rect: [120, 80], ellipse: [120, 80] }[kind];
      [w, h] = size;
      cx = g.x0;
      cy = g.y0;
    }
    const decoration = {
      id: newId("d"),
      kind,
      x: cx,
      y: cy,
      w,
      h,
      rotation: 0,
      label: kind === "stage" ? "Stage" : kind === "rect" ? "Area" : kind === "ellipse" ? "Circle" : "",
      color: kind === "field" ? "#7cb36b" : kind === "rect" || kind === "ellipse" ? "#86efac" : "#737373",
    };
    this.host.commit({ ...doc, decorations: [...doc.decorations, decoration] }, new Set([keyOf("d", decoration.id)]));
    this.host.setTool("select");
  }

  private finishSegment(g: Extract<Gesture, { kind: "segment" }>) {
    const engine = this.host.engine;
    engine.invalidate();
    if (this.tool === "poi:exit") {
      this.placeGate(g, "exit");
      return;
    }
    const length = Math.hypot(g.x1 - g.x0, g.y1 - g.y0);
    if (length < SEAT_RADIUS * 2) {
      this.host.notify("Drag along where the seats should go.");
      return;
    }
    if (this.tool === "curved-row" || this.tool === "row-block") {
      this.phase = { kind: this.tool === "curved-row" ? "bend" : "spread", x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1 };
      return;
    }
    this.placeRows([{ ...rowFromSegment(g.x0, g.y0, g.x1, g.y1) }]);
  }

  private finishPhase() {
    const rows = this.phaseRows();
    this.phase = null;
    this.host.engine.invalidate();
    if (rows.length) this.placeRows(rows);
  }

  /** Rows the current two-step gesture would create, given where the pointer is. */
  private phaseRows(): Omit<SeatMapRow, "id" | "label">[] {
    const ph = this.phase;
    const c = this.cursor;
    if (!ph || !c) return [];
    const dx = ph.x1 - ph.x0;
    const dy = ph.y1 - ph.y0;
    const len = Math.hypot(dx, dy) || 1;
    // Left-hand normal of start → end; screen y points down.
    const nx = dy / len;
    const ny = -dx / len;
    const d = (c[0] - ph.x0) * nx + (c[1] - ph.y0) * ny;
    if (ph.kind === "bend") {
      const mx = (ph.x0 + ph.x1) / 2;
      const my = (ph.y0 + ph.y1) / 2;
      const sag = (c[0] - mx) * nx + (c[1] - my) * ny;
      return [curvedRow(ph.x0, ph.y0, ph.x1, ph.y1, sag)];
    }
    const count = Math.min(MAX_ROWS_PER_SECTION, Math.floor(Math.abs(d) / DEFAULT_ROW_PITCH) + 1);
    const sign = d < 0 ? -1 : 1;
    const focal = this.host.doc().focal;
    if (focal) {
      const rows = blockFacingFocal([focal.x, focal.y], ph.x0, ph.y0, ph.x1, ph.y1, nx, ny, sign, count);
      if (rows) return rows;
    }
    return Array.from({ length: count }, (_, i) => {
      const off = sign * i * DEFAULT_ROW_PITCH;
      return rowFromSegment(ph.x0 + nx * off, ph.y0 + ny * off, ph.x1 + nx * off, ph.y1 + ny * off);
    });
  }

  private placeRows(rows: Omit<SeatMapRow, "id" | "label">[]) {
    const doc = this.host.doc();
    const first = rows[0];
    const section =
      doc.sections.findLast((s) => pointInPolygon(first.x, first.y, s.points)) ??
      doc.sections.findLast((s) => rows.some((r) => pointInPolygon(r.x, r.y, s.points)));
    if (!section) {
      this.host.notify("Draw rows inside a section. Draw the section first.");
      return;
    }
    if (section.rows.length + rows.length > MAX_ROWS_PER_SECTION) {
      this.host.notify(`A section holds up to ${MAX_ROWS_PER_SECTION} rows.`);
      return;
    }
    let label = nextRowLabel(section);
    const taken = new Set(section.rows.map((r) => r.label));
    const made = rows.map((r, i) => {
      if (i > 0) {
        do label = stepLabel(label, 1);
        while (taken.has(label));
      }
      taken.add(label);
      return makeRow({ ...r, label });
    });
    this.host.commit(addRows(doc, section.id, made), new Set(made.map((r) => keyOf("r", r.id))));
  }

  private addText(x: number, y: number) {
    const doc = this.host.doc();
    const d = { id: newId("d"), kind: "text" as const, x, y, w: 80, h: 16, rotation: 0, label: "Label", color: "#404040" };
    this.host.commit({ ...doc, decorations: [...doc.decorations, d] }, new Set([keyOf("d", d.id)]));
    this.host.setTool("select");
  }

  private addPoi(kind: PoiKind, x: number, y: number, size?: { w: number; h: number; rotation: number; label: string }) {
    const doc = this.host.doc();
    const p = { id: newId("p"), kind, x, y, label: size?.label ?? POI_LABEL[kind], w: size?.w ?? 0, h: size?.h ?? 0, rotation: size?.rotation ?? 0 };
    this.host.commit({ ...doc, pois: [...doc.pois, p] }, new Set([keyOf("p", p.id)]));
    this.host.setTool("select");
  }

  /** Click aims the arrow at the focal point; a drag sets where it points. */
  private placeGate(g: Extract<Gesture, { kind: "segment" }>, kind: "entrance" | "exit") {
    const doc = this.host.doc();
    const dx = g.x1 - g.x0;
    const dy = g.y1 - g.y0;
    const len = Math.hypot(dx, dy);
    const dragged = len > 8;
    const rotation = dragged
      ? normalizeAngle(toDeg(Math.atan2(dx, -dy)))
      : doc.focal
        ? normalizeAngle(toDeg(Math.atan2(doc.focal.x - g.x0, -(doc.focal.y - g.y0))))
        : 0;
    const size = dragged ? Math.max(28, Math.min(90, len)) : 42;
    const used = new Set(doc.pois.filter((p) => p.kind === "entrance" || p.kind === "exit").map((p) => p.label));
    let label = "A";
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      if (!used.has(letter)) {
        label = letter;
        break;
      }
    }
    this.addPoi(kind, dragged ? (g.x0 + g.x1) / 2 : g.x0, dragged ? (g.y0 + g.y1) / 2 : g.y0, { w: size * 0.85, h: size, rotation, label });
  }

  /* ---------- overlay ---------- */

  /** Drawn by the engine after the map, in CSS-pixel screen space. */
  overlay = (ctx: CanvasRenderingContext2D) => {
    const engine = this.host.engine;
    const cam = engine.camera;
    const g = this.gesture;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ACCENT;
    ctx.fillStyle = "rgba(59,130,246,0.08)";

    if (g.kind === "marquee") {
      const x = Math.min(g.x0, g.x1);
      const y = Math.min(g.y0, g.y1);
      ctx.fillRect(x, y, Math.abs(g.x1 - g.x0), Math.abs(g.y1 - g.y0));
      ctx.strokeRect(x + 0.5, y + 0.5, Math.abs(g.x1 - g.x0), Math.abs(g.y1 - g.y0));
    }

    if (this.tool === "select" && g.kind !== "marquee") this.drawHandles(ctx, g);

    if (g.kind === "box") {
      const [x0, y0] = cam.toScreen(g.x0, g.y0);
      const [x1, y1] = cam.toScreen(g.x1, g.y1);
      ctx.setLineDash([5, 4]);
      if (this.tool === "shape:ellipse" || this.tool === "table-round") {
        ctx.beginPath();
        ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
        ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      }
      ctx.setLineDash([]);
      this.badge(ctx, Math.max(x0, x1), Math.max(y0, y1), `${(Math.abs(g.x1 - g.x0) / 10).toFixed(1)} × ${(Math.abs(g.y1 - g.y0) / 10).toFixed(1)} m`);
    }

    if (this.tool === "section" && this.polygon.length) {
      ctx.beginPath();
      this.polygon.forEach(([x, y], i) => {
        const [sx, sy] = cam.toScreen(x, y);
        if (i) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
      });
      if (this.cursor) {
        const [cx, cy] = cam.toScreen(this.cursor[0], this.cursor[1]);
        ctx.lineTo(cx, cy);
      }
      if (this.polygon.length >= 2) ctx.fill();
      ctx.stroke();
      this.polygon.forEach(([x, y], i) => {
        const [sx, sy] = cam.toScreen(x, y);
        this.square(ctx, sx, sy, i === 0 ? 5 : 3.5);
      });
    }

    let preview: Omit<SeatMapRow, "id" | "label">[] = [];
    if (g.kind === "segment") preview = [rowFromSegment(g.x0, g.y0, g.x1, g.y1)];
    else if (this.phase) preview = this.phaseRows();
    if (preview.length) {
      const seats = this.drawRowPreview(ctx, preview);
      const at = this.cursor ? cam.toScreen(this.cursor[0], this.cursor[1]) : [0, 0];
      const text = preview.length > 1 ? `${preview.length} rows · ${seats} seats` : `${seats} seat${seats === 1 ? "" : "s"}`;
      this.badge(ctx, at[0], at[1], text);
    }
    ctx.restore();
  };

  private drawHandles(ctx: CanvasRenderingContext2D, g: Gesture) {
    const engine = this.host.engine;
    const scene = engine.scene;
    if (!scene) return;
    const cam = engine.camera;

    if (g.kind === "rotate") {
      const [px, py] = cam.toScreen(g.px, g.py);
      this.badge(ctx, px, py, `${g.angle}°`);
      return;
    }
    if (g.kind === "move" && g.started) return;

    const sel = this.host.selection();
    if (g.kind !== "vertex") {
      const rotate = this.rotateHandle();
      if (rotate) {
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = "rgba(59,130,246,0.6)";
        ctx.strokeRect(rotate.x0 - 4, rotate.y0 - 4, rotate.x1 - rotate.x0 + 8, rotate.y1 - rotate.y0 + 8);
        ctx.setLineDash([]);
        ctx.strokeStyle = ACCENT;
        ctx.beginPath();
        ctx.moveTo(rotate.hx, rotate.y0 - 4);
        ctx.lineTo(rotate.hx, rotate.hy);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rotate.hx, rotate.hy, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.stroke();
      }
    }

    if (sel.size !== 1) return;
    const [key] = sel;
    if (!key.startsWith("s:")) return;
    const si = scene.sectionIndex.get(key.slice(2));
    if (si === undefined) return;
    const pts = g.kind === "vertex" ? g.points : scene.sections[si].points;
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = cam.toScreen(pts[i][0], pts[i][1]);
      this.square(ctx, x, y, 4);
      if (g.kind === "vertex" || pts.length >= 120) continue;
      const b = pts[(i + 1) % pts.length];
      const [bx, by] = cam.toScreen(b[0], b[1]);
      if (Math.hypot(bx - x, by - y) < 36) continue;
      ctx.beginPath();
      ctx.arc((x + bx) / 2, (y + by) / 2, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fill();
      ctx.strokeStyle = "rgba(59,130,246,0.7)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  private drawRowPreview(ctx: CanvasRenderingContext2D, rows: Omit<SeatMapRow, "id" | "label">[]): number {
    const cam = this.host.engine.camera;
    const r = Math.max(1.5, SEAT_RADIUS * cam.scale);
    const xs = new Float32Array(512);
    const ys = new Float32Array(512);
    const path = new Path2D();
    let total = 0;
    for (const row of rows) {
      const n = placeRow({ ...row, id: "", label: "" }, xs, ys);
      total += n;
      for (let i = 0; i < n; i++) {
        const [x, y] = cam.toScreen(xs[i], ys[i]);
        path.moveTo(x + r, y);
        path.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    ctx.fillStyle = "rgba(59,130,246,0.55)";
    ctx.fill(path);
    return total;
  }

  private square(ctx: CanvasRenderingContext2D, x: number, y: number, half: number) {
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.fillRect(x - half, y - half, half * 2, half * 2);
    ctx.strokeRect(x - half, y - half, half * 2, half * 2);
  }

  private badge(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
    ctx.font = "500 12px ui-sans-serif, system-ui, sans-serif";
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = "#171717";
    ctx.beginPath();
    ctx.roundRect(x + 12, y + 12, w, 22, 11);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + 18, y + 23.5);
  }
}
