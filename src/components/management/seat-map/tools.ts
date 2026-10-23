import type { Interaction, PointerInfo, SeatMapEngine } from "@/lib/seatmap/engine/engine";
import { seatAt, seatLabelsVisible } from "@/lib/seatmap/engine/hit";
import { decorationWidth } from "@/lib/seatmap/engine/scene";
import { ACCENT } from "@/lib/seatmap/engine/canvas-renderer";
import {
  boxCorners,
  curvedRow,
  makeLoge,
  makeRow,
  makeSection,
  makeTable,
  nextRowLabel,
  rowLabelAt,
  seatDefaults,
  normalizeAngle,
  outlineAround,
  placeRow,
  pointInPolygon,
  resizeTable,
  rotation,
  rowFromSegment,
  snap,
  stepLabel,
  toDeg,
  toRad,
  translation,
  type Point,
  type Rigid,
} from "@/lib/seatmap/geometry";
import {
  DEFAULT_ROW_PITCH,
  DEFAULT_SEAT_PITCH,
  MAX_ROWS_PER_SECTION,
  MAX_SEATS_PER_ROW,
  SEAT_RADIUS,
  newId,
  type DecorationKind,
  type PoiKind,
  type SeatMapDoc,
  type SeatMapRow,
} from "@/lib/seatmap/schema";
import { attachSlots, hostContains, inAttachSlot, presentSlot, sameHost, type AttachHost, type AttachKind, type AttachSlot } from "./attach";
import { formatLength, objectAnchors, snapBox, snapMove, snapPoint, snapSegmentEnd, type Guide } from "./guides";
import { addRows, dragPreview, keyOf, seatKey, seatPick, selectionBounds, selectionOutline, setSectionPoints, transformSelection, transientOf, type Selection } from "./ops";

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
  | "text"
  | `shape:${ShapeKind}`
  | `poi:${PoiKind}`;

export type AssistId = "snap" | "angle" | "finish" | "point" | "cancel";

export type AssistChip = { id: AssistId };

export type ToolHost = {
  engine: SeatMapEngine;
  doc(): SeatMapDoc;
  selection(): Selection;
  select(keys: Set<string>): void;
  commit(doc: SeatMapDoc, selection?: Set<string>): void;
  setTool(tool: ToolId): void;
  snapStep(): number;
  /** Rotation snaps to this many degrees. 0 leaves it free (Shift still snaps to 15°). */
  snapAngle(): number;
  defaultCategory(): string | null;
  notify(message: string): void;
  /** Keys that change the stroke in progress. Empty once the stroke ends. */
  assist(chips: AssistChip[]): void;
  /** The plus beside a section. Null closes it. */
  onAttachMenu(menu: { sx: number; sy: number; slot: AttachSlot } | null): void;
};

type Gesture =
  | { kind: "none" }
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number; additive: boolean }
  | { kind: "move"; wx: number; wy: number; sx: number; sy: number; started: boolean; transform: Rigid; solo: string | null }
  | { kind: "rotate"; px: number; py: number; a0: number; angle: number }
  | { kind: "vertex"; sectionId: string; section: number; index: number; points: Point[] }
  | { kind: "scale"; key: string; handle: ScaleHandle; rotation: number; lock: boolean; text: boolean; x0: number; y0: number; w0: number; h0: number; x: number; y: number; w: number; h: number }
  | { kind: "box"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "segment"; x0: number; y0: number; x1: number; y1: number };

/** A click-move-click stroke: the line of a row, the bend after it, or a block. */
type Phase = { kind: "line" | "bend" | "block"; x0: number; y0: number; x1: number; y1: number } | null;

/** Circles sit this far inside the block outline, so the dotted box never cuts a seat. */
const BLOCK_PAD = SEAT_RADIUS + 2.5;

/** How many items of `pitch` fit in `span` with `pad` of clear space at each end. Grows by exactly one. */
function fitCount(span: number, pitch: number, pad: number, max: number) {
  if (span < pad * 2) return 0;
  return Math.min(max, Math.floor((span - pad * 2) / pitch) + 1);
}

const HANDLE = 7;
const ROTATE_OFFSET = 28;
type ScaleHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const SCALE_HANDLES: { id: ScaleHandle; lx: number; ly: number }[] = [
  { id: "nw", lx: -1, ly: -1 },
  { id: "n", lx: 0, ly: -1 },
  { id: "ne", lx: 1, ly: -1 },
  { id: "e", lx: 1, ly: 0 },
  { id: "se", lx: 1, ly: 1 },
  { id: "s", lx: 0, ly: 1 },
  { id: "sw", lx: -1, ly: 1 },
  { id: "w", lx: -1, ly: 0 },
];
const POI_LABEL: Record<PoiKind, string> = { kitchen: "Kitchen", entrance: "A", exit: "A", stairs: "", pickup: "Pickup" };

function resizeCursor(sx: number, sy: number, cx: number, cy: number) {
  const oct = Math.round(Math.atan2(sy - cy, sx - cx) / (Math.PI / 4));
  const i = ((oct % 8) + 8) % 8;
  return (["ew-resize", "nwse-resize", "ns-resize", "nesw-resize", "ew-resize", "nwse-resize", "ns-resize", "nesw-resize"] as const)[i];
}

export class ToolController implements Interaction {
  tool: ToolId = "select";
  private gesture: Gesture = { kind: "none" };
  private polygon: Point[] = [];
  private phase: Phase = null;
  private cursor: Point | null = null;
  private guides: Guide[] = [];
  private alt = false;
  private assistKey = "";
  /** Section whose side slots are on screen. */
  private hotHost: AttachHost | null = null;
  private menu: { sx: number; sy: number; slot: AttachSlot } | null = null;

  constructor(private host: ToolHost) {}

  setTool(tool: ToolId) {
    this.closeAttach();
    this.cancel();
    this.polygon = [];
    this.phase = null;
    this.tool = tool;
    this.host.engine.setCursor(this.cursorFor(null));
    this.syncAssist();
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
    const [wx, wy] = this.snapped(p, false);
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
      case "shape:wall":
      case "shape:column":
      case "shape:venue":
      case "poi:stairs":
      case "poi:entrance":
        this.gesture = { kind: "box", x0: wx, y0: wy, x1: wx, y1: wy };
        return true;
      case "poi:exit":
        this.gesture = { kind: "segment", x0: wx, y0: wy, x1: wx, y1: wy };
        return true;
      case "row":
        if (this.phase?.kind === "line") {
          this.trackLine(p);
          this.finishLine();
          return true;
        }
        this.phase = { kind: "line", x0: wx, y0: wy, x1: wx, y1: wy };
        this.syncAssist();
        this.host.engine.invalidate();
        return true;
      case "curved-row":
        if (this.phase?.kind === "bend") {
          this.finishPhase();
          return true;
        }
        if (this.phase?.kind === "line") {
          this.trackLine(p);
          this.beginBend();
          return true;
        }
        this.phase = { kind: "line", x0: wx, y0: wy, x1: wx, y1: wy };
        this.syncAssist();
        this.host.engine.invalidate();
        return true;
      case "row-block":
        if (this.phase) {
          this.finishPhase();
          return true;
        }
        this.phase = { kind: "block", x0: wx, y0: wy, x1: wx, y1: wy };
        this.host.engine.invalidate();
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
    const g = this.gesture;
    const engine = this.host.engine;

    switch (g.kind) {
      case "marquee":
        this.guides = [];
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
        const scene = engine.scene;
        const bounds = scene ? selectionBounds(scene, this.host.selection()) : null;
        const delta = bounds && !this.alt ? snapMove(bounds, p.wx - g.wx, p.wy - g.wy, this.anchors(), this.threshold(), this.step()) : null;
        this.guides = delta?.guides ?? [];
        g.transform = translation(delta?.dx ?? snap(p.wx - g.wx, this.step()), delta?.dy ?? snap(p.wy - g.wy, this.step()));
        this.preview(g.transform);
        engine.invalidate();
        return;
      }
      case "rotate": {
        this.guides = [];
        let angle = toDeg(Math.atan2(p.wy - g.py, p.wx - g.px)) - g.a0;
        const step = this.angleStep() || (p.shift ? 15 : 0);
        if (step > 0) angle = Math.round(angle / step) * step;
        g.angle = normalizeAngle(angle);
        this.preview(rotation(g.angle, g.px, g.py));
        return;
      }
      case "scale": {
        const next = this.scaledBox(g, p);
        g.x = next.x;
        g.y = next.y;
        g.w = next.w;
        g.h = next.h;
        engine.state.resize = { key: g.key, x: next.x, y: next.y, w: next.w, h: next.h };
        engine.invalidate();
        return;
      }
      case "vertex": {
        const [wx, wy] = this.snapped(p);
        this.cursor = [wx, wy];
        g.points = g.points.map((pt, i) => (i === g.index ? [wx, wy] : pt));
        engine.state.outline = { section: g.section, points: g.points };
        engine.touch();
        return;
      }
      case "box": {
        const aligned = this.alt
          ? { x: p.wx, y: p.wy, guides: [] as Guide[] }
          : snapBox(g.x0, g.y0, p.wx, p.wy, this.anchors(), this.threshold(), this.step());
        this.guides = aligned.guides;
        this.cursor = [aligned.x, aligned.y];
        g.x1 = aligned.x;
        g.y1 = aligned.y;
        engine.invalidate();
        return;
      }
      case "segment": {
        const point = this.snapped(p);
        const [x, y] = this.guides.length || this.alt ? point : snapSegmentEnd(g.x0, g.y0, point[0], point[1], this.angleStep(), this.step());
        this.cursor = [x, y];
        g.x1 = x;
        g.y1 = y;
        engine.invalidate();
        return;
      }
      default:
        if (this.trackLine(p)) {
          engine.invalidate();
          return;
        }
        if (this.phase?.kind === "block") {
          const aligned = this.alt
            ? { x: p.wx, y: p.wy, guides: [] as Guide[] }
            : snapBox(this.phase.x0, this.phase.y0, p.wx, p.wy, this.anchors(), this.threshold(), this.step());
          this.guides = aligned.guides;
          this.cursor = [aligned.x, aligned.y];
          engine.invalidate();
          return;
        }
        this.hover(p);
    }
  }

  up(p: PointerInfo) {
    const g = this.gesture;
    this.gesture = { kind: "none" };
    this.guides = [];
    this.syncAssist();
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
      case "scale":
        this.commitScale(g);
        return;
      case "box":
        this.finishBox(g);
        return;
      case "segment":
        this.finishSegment(g);
        return;
    }
    this.hover(p);
  }

  cancel() {
    const g = this.gesture;
    this.gesture = { kind: "none" };
    const engine = this.host.engine;
    if (g.kind === "scale") engine.state.resize = null;
    if (g.kind === "move" || g.kind === "rotate") engine.endTransient();
    if (g.kind === "vertex") {
      engine.state.outline = null;
      engine.invalidate();
    }
    this.guides = [];
    this.syncAssist();
    engine.invalidate();
  }

  hover(p: PointerInfo) {
    this.trackAttach(p);
    this.alt = p.alt;
    if (this.phase?.kind === "line") this.trackLine(p);
    else if (this.phase?.kind === "block") {
      const aligned = this.alt
        ? { x: p.wx, y: p.wy, guides: [] as Guide[] }
        : snapBox(this.phase.x0, this.phase.y0, p.wx, p.wy, this.anchors(), this.threshold(), this.step());
      this.guides = aligned.guides;
      this.cursor = [aligned.x, aligned.y];
    } else if (this.polygon.length || this.phase) {
      this.cursor = this.snapped(p);
    } else {
      this.guides = [];
      this.cursor = [snap(p.wx, this.step()), snap(p.wy, this.step())];
    }
    this.host.engine.setCursor(this.cursorFor(p));
    if (this.phase || this.polygon.length || (this.tool !== "select" && this.tool !== "hand")) this.host.engine.invalidate();
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
    if (hit?.kind === "seat" && scene && !scene.sections[hit.section].loose) this.host.select(new Set([keyOf("s", scene.sections[hit.section].id)]));
  }

  /** Keys the designer forwards while a tool is active. Returns true when handled. */
  leave() {
    if (this.menu || !this.hotHost) return;
    this.hotHost = null;
    this.host.engine.invalidate();
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === "Escape" && this.menu) {
      this.closeAttach();
      return true;
    }
    if (e.key === "Escape" && this.busy) {
      this.cancel();
      this.polygon = [];
      this.phase = null;
      this.syncAssist();
      this.host.engine.invalidate();
      return true;
    }
    if (e.key === "Enter" && this.tool === "section" && this.polygon.length >= 3) {
      this.finishPolygon();
      return true;
    }
    if ((e.key === "Backspace" || e.key === "Delete") && this.tool === "section" && this.polygon.length) {
      this.polygon.pop();
      this.syncAssist();
      this.host.engine.invalidate();
      return true;
    }
    return false;
  }

  /* ---------- select tool ---------- */

  /** Rigid move, plus a live rewrap when the selection follows a venue or its outline follows the seats. */
  private preview(transform: Rigid) {
    const engine = this.host.engine;
    const scene = engine.scene;
    engine.updateTransient(transform, scene ? dragPreview(this.host.doc(), scene, this.host.selection(), transform) : null);
  }

  private beginMove(p: PointerInfo, solo: string | null) {
    this.gesture = { kind: "move", wx: p.wx, wy: p.wy, sx: p.sx, sy: p.sy, started: false, transform: translation(0, 0), solo };
  }

  /** The frame around the selection, bent with the seats while a drag is in progress. */
  private selectionShape(): Point[] | null {
    const scene = this.host.engine.scene;
    if (!scene) return null;
    const t = this.host.engine.state.transient;
    return selectionOutline(this.host.doc(), scene, this.host.selection(), t ? { transform: t.transform, outlines: t.preview?.outlines ?? null } : null);
  }

  private seatInSelection(index: number, sel: Selection): boolean {
    const scene = this.host.engine.scene;
    if (!scene || !scene.seatLive[index]) return false;
    const row = scene.rows[scene.seatRow[index]];
    const slot = index - row.seatStart;
    return sel.has(keyOf("s", scene.sections[row.section].id)) || sel.has(keyOf("r", row.id)) || sel.has(seatKey(row.id, slot));
  }

  /** True when the pointer is on chairs or the outline of what is already selected. */
  private onSelection(p: PointerInfo): boolean {
    const sel = this.host.selection();
    const scene = this.host.engine.scene;
    if (!scene || !sel.size) return false;
    const index = seatAt(scene, p.wx, p.wy, Math.max(SEAT_RADIUS, 12 / this.host.engine.camera.scale));
    if (index >= 0 && this.seatInSelection(index, sel)) return true;
    const shape = this.selectionShape();
    return !!shape && pointInPolygon(p.wx, p.wy, shape);
  }

  /**
   * Start a move of the current selection. Seat circles are not hits while zoomed out,
   * and the gaps between them are not hits once the section steps aside, so either one
   * used to start a marquee on top of a block you were trying to drag.
   */
  private grabSelected(p: PointerInfo): boolean {
    const sel = this.host.selection();
    const scene = this.host.engine.scene;
    if (!scene || !sel.size) return false;
    const scale = this.host.engine.camera.scale;
    const index = seatAt(scene, p.wx, p.wy, Math.max(SEAT_RADIUS, 12 / scale));
    if (index >= 0 && this.seatInSelection(index, sel)) {
      const row = scene.rows[scene.seatRow[index]];
      const slot = index - row.seatStart;
      const chair = seatKey(row.id, slot);
      const rowKey = keyOf("r", row.id);
      const sectionKey = keyOf("s", scene.sections[row.section].id);
      const labels = seatLabelsVisible(scale);
      const drilling = labels && (sel.has(rowKey) || [...sel].some((k) => k.startsWith(`c:${row.id}:`)));
      const solo = !labels ? null : drilling ? chair : sel.has(sectionKey) ? rowKey : null;
      this.beginMove(p, solo);
      return true;
    }
    const shape = this.selectionShape();
    if (shape && pointInPolygon(p.wx, p.wy, shape)) {
      this.beginMove(p, null);
      return true;
    }
    return false;
  }

  /** The selection is rows or chairs of this section, so a click on its fill should drag them. */
  private holdsSection(sectionIndex: number): boolean {
    const scene = this.host.engine.scene;
    if (!scene) return false;
    for (const key of this.host.selection()) {
      if (key.startsWith("r:")) {
        const ri = scene.rowIndex.get(key.slice(2));
        if (ri !== undefined && scene.rows[ri].section === sectionIndex) return true;
      } else {
        const seat = seatPick(key);
        const ri = seat ? scene.rowIndex.get(seat.rowId) : undefined;
        if (ri !== undefined && scene.rows[ri].section === sectionIndex) return true;
      }
    }
    return false;
  }

  private selectDown(p: PointerInfo): boolean {
    const engine = this.host.engine;
    const scene = engine.scene;
    if (!scene) return true;
    const slot = this.attachSlotAt(p);
    const under = slot ? this.hostUnder(p) : null;
    if (slot && (!under || sameHost(under, slot.host))) {
      this.openAttach(slot);
      return true;
    }
    if (this.menu) this.closeAttach();
    const sel = this.host.selection();

    const scale = this.scaleHandleAt(p);
    if (scale) {
      const box = scale.box;
      this.gesture = {
        kind: "scale",
        key: box.key,
        handle: scale.handle,
        rotation: box.rotation,
        lock: box.lock,
        text: box.text,
        x0: box.x,
        y0: box.y,
        w0: box.w,
        h0: box.h,
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
      };
      this.host.engine.state.resize = { key: box.key, x: box.x, y: box.y, w: box.w, h: box.h };
      this.host.engine.invalidate();
      return true;
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
    if (hit?.kind === "seat") {
      const row = scene.rows[hit.row];
      const index = hit.seat - row.seatStart;
      const rowKey = keyOf("r", row.id);
      const chair = seatKey(row.id, index);
      const sectionKey = keyOf("s", scene.sections[row.section].id);
      const drilling = sel.has(rowKey) || [...sel].some((k) => k.startsWith(`c:${row.id}:`));
      const grabbed = sel.has(chair) || sel.has(rowKey) || sel.has(sectionKey);
      // A click still picks the chair. A drag moves everything already selected.
      if (grabbed && !p.shift) {
        const solo = drilling ? chair : sel.has(sectionKey) ? rowKey : null;
        this.beginMove(p, solo);
        return true;
      }
      if (drilling) {
        const next = new Set(sel);
        next.delete(rowKey);
        if (!p.shift) next.clear();
        if (p.shift && next.has(chair)) next.delete(chair);
        else next.add(chair);
        this.host.select(next);
        return true;
      }
    }
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
      if (!p.shift && this.grabSelected(p)) return true;
      this.gesture = { kind: "marquee", x0: p.sx, y0: p.sy, x1: p.sx, y1: p.sy, additive: p.shift };
      if (!p.shift && sel.size) this.host.select(new Set());
      return true;
    }
    if (hit?.kind === "section" && !p.shift && !sel.has(key) && this.holdsSection(hit.section)) {
      this.beginMove(p, key);
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
    this.beginMove(p, solo);
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

    // Close enough to read seat numbers, the box picks chairs, including across rows.
    if (engine.seatsVisible() && seatLabelsVisible(engine.camera.scale)) {
      for (let i = 0; i < scene.seatCount; i++) {
        if (!scene.seatLive[i] || !inside(scene.seatX[i], scene.seatY[i])) continue;
        const row = scene.rows[scene.seatRow[i]];
        if (scene.sections[row.section].display === "block") continue;
        found.add(seatKey(row.id, i - row.seatStart));
      }
    } else {
      // Whole sections first; if none fall inside, the box picks rows instead.
      for (const s of scene.sections) {
        if (s.loose) continue;
        const b = s.bounds;
        if (inside((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2)) found.add(keyOf("s", s.id));
      }
      if (!found.size) {
        for (const r of scene.rows) {
          const loose = scene.sections[r.section].loose;
          if (!loose && !engine.seatsVisible()) continue;
          let mid = (r.seatStart + r.seatEnd) >> 1;
          if (!scene.seatLive[mid]) {
            for (let i = r.seatStart; i < r.seatEnd; i++) if (scene.seatLive[i]) {
              mid = i;
              break;
            }
          }
          if (scene.seatLive[mid] && inside(scene.seatX[mid], scene.seatY[mid])) found.add(keyOf("r", r.id));
        }
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
    let hx = (x0 + x1) / 2;
    let stemX = hx;
    let stemY = Math.min(y0, y1);
    const shape = this.selectionShape();
    if (shape && shape.length >= 3) {
      let top = shape[0];
      let topY = cam.toScreen(top[0], top[1])[1];
      for (const point of shape) {
        const sy = cam.toScreen(point[0], point[1])[1];
        if (sy < topY) {
          topY = sy;
          top = point;
        }
      }
      const [sx, sy] = cam.toScreen(top[0], top[1]);
      hx = sx;
      stemX = sx;
      stemY = sy;
    }
    return { x0, y0, x1, y1, hx, hy: stemY - ROTATE_OFFSET, stemX, stemY, pivot };
  }

  private cursorFor(p: PointerInfo | null): string {
    switch (this.tool) {
      case "hand":
        return "grab";
      case "select": {
        if (!p) return "default";
        if (this.attachSlotAt(p)) return "pointer";
        const scale = this.scaleHandleAt(p);
        if (scale) return resizeCursor(scale.sx, scale.sy, scale.cx, scale.cy);
        const handle = this.vertexAt(p);
        if (handle) return handle.kind === "vertex" ? "move" : "copy";
        const rotate = this.rotateHandle();
        if (rotate && Math.hypot(rotate.hx - p.sx, rotate.hy - p.sy) <= HANDLE + 2) return "alias";
        if (this.onSelection(p)) return "move";
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

  private angleStep() {
    return this.alt ? 0 : this.host.snapAngle();
  }

  /** World distance that reads as about six pixels, so the catch feels the same at every zoom. */
  private threshold() {
    return 6 / (this.host.engine.camera.scale || 1);
  }

  private anchors() {
    const scene = this.host.engine.scene;
    if (!scene || this.alt) return { xs: [], ys: [] };
    const g = this.gesture;
    const skip =
      g.kind === "move"
        ? this.host.selection()
        : g.kind === "vertex"
          ? new Set([keyOf("s", g.sectionId)])
          : new Set<string>();
    const seats = this.tool === "row" || this.tool === "curved-row" || this.tool === "row-block";
    return objectAnchors(scene, skip, seats);
  }

  /** `show` keeps the alignment lines. A click that only starts a stroke snaps, without painting a line yet. */
  private snapped(p: PointerInfo, show = true): Point {
    if (this.alt) {
      if (show) this.guides = [];
      return [p.wx, p.wy];
    }
    const aligned = snapPoint(p.wx, p.wy, this.anchors(), this.threshold(), this.step());
    if (show) this.guides = aligned.guides;
    return [aligned.x, aligned.y];
  }

  /** True once a stroke is actually underway, so idle hovering never paints a guide. */
  private drawing() {
    if (this.polygon.length || this.phase) return true;
    const g = this.gesture;
    return g.kind === "box" || g.kind === "segment" || g.kind === "vertex" || g.kind === "rotate" || (g.kind === "move" && g.started);
  }

  private syncAssist() {
    const chips = this.assistChips();
    const key = chips.map((c) => c.id).join("|");
    if (key === this.assistKey) return;
    this.assistKey = key;
    this.host.assist(chips);
  }

  /** Keys that change the stroke. The bar owns the wording and the icon. */
  private assistChips(): AssistChip[] {
    if (!this.drawing()) return [];
    const chips: AssistChip[] = [{ id: "snap" }];
    if (this.gesture.kind === "rotate" && !this.host.snapAngle()) chips.push({ id: "angle" });
    if (this.tool === "section" && this.polygon.length >= 3) chips.push({ id: "finish" });
    if (this.tool === "section" && this.polygon.length) chips.push({ id: "point" });
    chips.push({ id: "cancel" });
    return chips;
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
      const size = { stage: [240, 90], field: [1050, 680], rect: [120, 80], ellipse: [120, 80], wall: [80, 30], column: [30, 30], venue: [600, 400] }[kind];
      [w, h] = size;
      cx = g.x0;
      cy = g.y0;
    }
    const plain = kind === "wall" || kind === "column";
    const decoration = {
      id: newId("d"),
      kind,
      x: cx,
      y: cy,
      w,
      h,
      rotation: 0,
      label: kind === "stage" ? "Stage" : kind === "rect" ? "Area" : kind === "ellipse" ? "Circle" : "",
      color: kind === "field" ? "#7cb36b" : kind === "venue" ? "#f0a77a" : plain ? "#d4d4d4" : kind === "rect" || kind === "ellipse" ? "#86efac" : "#737373",
      radius: kind === "venue" ? Math.round(Math.min(w, h) * 0.3) : 0,
    };
    this.host.commit({ ...doc, decorations: [...doc.decorations, decoration] }, new Set([keyOf("d", decoration.id)]));
    this.host.setTool("select");
  }

  /** Keeps the open row's far end under the pointer. Returns false when no line is open. */
  private trackLine(p: PointerInfo) {
    const ph = this.phase;
    if (ph?.kind !== "line") return false;
    const point = this.snapped(p);
    const [x, y] = this.guides.length || this.alt ? point : snapSegmentEnd(ph.x0, ph.y0, point[0], point[1], this.angleStep(), this.step());
    this.cursor = [x, y];
    ph.x1 = x;
    ph.y1 = y;
    return true;
  }

  private finishLine() {
    const ph = this.phase;
    if (ph?.kind !== "line") return;
    const length = Math.hypot(ph.x1 - ph.x0, ph.y1 - ph.y0);
    if (length < SEAT_RADIUS * 2) {
      this.host.notify("Click the other end of the row.");
      return;
    }
    this.phase = null;
    this.guides = [];
    this.host.engine.invalidate();
    this.placeRows([{ ...rowFromSegment(ph.x0, ph.y0, ph.x1, ph.y1) }]);
  }

  /** Second click of a curved row: the ends stay put and the pointer starts bending it. */
  private beginBend() {
    const ph = this.phase;
    if (ph?.kind !== "line") return;
    const length = Math.hypot(ph.x1 - ph.x0, ph.y1 - ph.y0);
    if (length < SEAT_RADIUS * 2) {
      this.host.notify("Click the other end of the row.");
      return;
    }
    this.phase = { kind: "bend", x0: ph.x0, y0: ph.y0, x1: ph.x1, y1: ph.y1 };
    this.guides = [];
    this.host.engine.invalidate();
  }

  private finishSegment(g: Extract<Gesture, { kind: "segment" }>) {
    this.host.engine.invalidate();
    if (this.tool === "poi:exit") this.placeGate(g, "exit");
  }

  private finishPhase() {
    const ph = this.phase;
    const rows = this.phaseRows();
    this.phase = null;
    this.host.engine.invalidate();
    if (ph?.kind === "block" && this.cursor) {
      const w = Math.abs(this.cursor[0] - ph.x0);
      const h = Math.abs(this.cursor[1] - ph.y0);
      if (w < SEAT_RADIUS && h < SEAT_RADIUS) return;
    }
    if (rows.length) this.placeRows(rows);
  }

  /** Rows the stroke in progress would create, given where the pointer is. */
  private phaseRows(): Omit<SeatMapRow, "id" | "label">[] {
    const ph = this.phase;
    if (!ph) return [];
    if (ph.kind === "line") return [rowFromSegment(ph.x0, ph.y0, ph.x1, ph.y1)];
    const c = this.cursor;
    if (!c) return [];
    if (ph.kind === "block") return this.blockRows(ph.x0, ph.y0, c[0], c[1]);
    const dx = ph.x1 - ph.x0;
    const dy = ph.y1 - ph.y0;
    const len = Math.hypot(dx, dy) || 1;
    // Left-hand normal of start → end; screen y points down.
    const nx = dy / len;
    const ny = -dx / len;
    const mx = (ph.x0 + ph.x1) / 2;
    const my = (ph.y0 + ph.y1) / 2;
    const sag = (c[0] - mx) * nx + (c[1] - my) * ny;
    return [curvedRow(ph.x0, ph.y0, ph.x1, ph.y1, sag)];
  }

  /**
   * A straight grid anchored at the first click. A new column or row appears
   * only once its whole circle fits inside the box, so the count never skips.
   */
  private blockRows(x0: number, y0: number, x1: number, y1: number): Omit<SeatMapRow, "id" | "label">[] {
    const dx = x1 >= x0 ? 1 : -1;
    const dy = y1 >= y0 ? 1 : -1;
    const cols = fitCount(Math.abs(x1 - x0), DEFAULT_SEAT_PITCH, BLOCK_PAD, MAX_SEATS_PER_ROW);
    const count = fitCount(Math.abs(y1 - y0), DEFAULT_ROW_PITCH, BLOCK_PAD, MAX_ROWS_PER_SECTION);
    if (!cols || !count) return [];
    const fromX = x0 + dx * BLOCK_PAD;
    const toX = fromX + dx * (cols - 1) * DEFAULT_SEAT_PITCH;
    return Array.from({ length: count }, (_, i) => ({
      seats: cols,
      x: (fromX + toX) / 2,
      y: y0 + dy * (BLOCK_PAD + i * DEFAULT_ROW_PITCH),
      rotation: dx < 0 ? 180 : 0,
      curve: 0,
      pitch: DEFAULT_SEAT_PITCH,
      start: 1,
      reverse: false,
      gaps: [],
      spread: "packed" as const,
      layout: "line" as const,
      boxW: 0,
      boxH: 0,
      wheelchair: [],
      removed: [],
      numbers: [],
      step: 1,
    }));
  }

  private placeRows(rows: Omit<SeatMapRow, "id" | "label">[]) {
    const doc = this.host.doc();
    const first = rows[0];
    const section =
      doc.sections.findLast((s) => !s.loose && pointInPolygon(first.x, first.y, s.points)) ??
      doc.sections.findLast((s) => !s.loose && rows.some((r) => pointInPolygon(r.x, r.y, s.points)));
    const { numbering } = doc;
    const seatsFrom = seatDefaults(numbering);
    const labelRows = (start: string, taken: Set<string>) => {
      let label = start;
      const labels = rows.map((_, i) => {
        if (i > 0) {
          do label = stepLabel(label, numbering.rows.step, numbering.rows.style);
          while (taken.has(label));
        }
        taken.add(label);
        return label;
      });
      if (numbering.rows.reverse) labels.reverse();
      return rows.map((r, i) => makeRow({ ...r, ...seatsFrom, label: labels[i] }));
    };
    if (!section) {
      const pts: Point[] = [];
      const xs = new Float32Array(512);
      const ys = new Float32Array(512);
      for (const r of rows) {
        const probe = makeRow({ ...r, label: "1" });
        const n = placeRow(probe, xs, ys);
        for (let i = 0; i < n; i++) pts.push([xs[i], ys[i]]);
      }
      const points = outlineAround(pts);
      if (points.length < 3) return;
      const made = labelRows(rowLabelAt(numbering, 0), new Set());
      const loose = { ...makeSection(doc, points, this.host.defaultCategory()), loose: true, rows: made };
      this.host.commit({ ...doc, sections: [...doc.sections, loose] }, new Set(made.map((r) => keyOf("r", r.id))));
      return;
    }
    if (section.rows.length + rows.length > MAX_ROWS_PER_SECTION) {
      this.host.notify(`A section holds up to ${MAX_ROWS_PER_SECTION} rows.`);
      return;
    }
    const made = labelRows(nextRowLabel(section, numbering), new Set(section.rows.map((r) => r.label)));
    this.host.commit(addRows(doc, section.id, made), new Set(made.map((r) => keyOf("r", r.id))));
  }

  private addText(x: number, y: number) {
    const doc = this.host.doc();
    const d = { id: newId("d"), kind: "text" as const, x, y, w: 80, h: 16, rotation: 0, label: "Label", color: "#404040", radius: 0 };
    this.host.commit({ ...doc, decorations: [...doc.decorations, d] }, new Set([keyOf("d", d.id)]));
    this.host.setTool("select");
  }

  private addPoi(kind: PoiKind, x: number, y: number, size?: { w: number; h: number; rotation: number; label: string }) {
    const doc = this.host.doc();
    const p = { id: newId("p"), kind, x, y, label: size?.label ?? POI_LABEL[kind], w: size?.w ?? 0, h: size?.h ?? 0, rotation: size?.rotation ?? 0 };
    this.host.commit({ ...doc, pois: [...doc.pois, p] }, new Set([keyOf("p", p.id)]));
    this.host.setTool("select");
  }

  /** A drag sets where the arrow points. A click leaves it pointing up the map. */
  private placeGate(g: Extract<Gesture, { kind: "segment" }>, kind: "entrance" | "exit") {
    const doc = this.host.doc();
    const dx = g.x1 - g.x0;
    const dy = g.y1 - g.y0;
    const len = Math.hypot(dx, dy);
    const dragged = len > 8;
    const rotation = dragged ? normalizeAngle(toDeg(Math.atan2(dx, -dy))) : 0;
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

  /** Drops a neighbour against the section edge. It stays its own object. */
  placeBeside(slot: AttachSlot, kind: AttachKind) {
    this.closeAttach();
    const doc = this.host.doc();
    const thick = { stairs: 14, wall: 8, entrance: 18, exit: 18, column: 16 }[kind];
    const edgeX = slot.x - slot.nx * (slot.thick / 2);
    const edgeY = slot.y - slot.ny * (slot.thick / 2);
    const x = Math.round((edgeX + slot.nx * (thick / 2)) * 100) / 100;
    const y = Math.round((edgeY + slot.ny * (thick / 2)) * 100) / 100;
    if (kind === "wall" || kind === "column") {
      const decoration = {
        id: newId("d"),
        kind,
        x,
        y,
        w: Math.round((kind === "column" ? thick : slot.span) * 100) / 100,
        h: Math.round(thick * 100) / 100,
        rotation: kind === "column" ? 0 : slot.rotation,
        label: "",
        color: "#d4d4d4",
        radius: 0,
      };
      this.host.commit({ ...doc, decorations: [...doc.decorations, decoration] }, new Set([keyOf("d", decoration.id)]));
      return;
    }
    const label = kind === "stairs" ? "" : this.nextGateLabel(doc);
    this.addPoi(kind, x, y, { w: Math.round(slot.span * 100) / 100, h: Math.round(thick * 100) / 100, rotation: slot.rotation, label });
  }

  closeAttach() {
    if (!this.menu) return;
    this.menu = null;
    this.hotHost = null;
    this.host.onAttachMenu(null);
    this.host.engine.invalidate();
  }

  private nextGateLabel(doc: SeatMapDoc) {
    const used = new Set(doc.pois.filter((p) => p.kind === "entrance" || p.kind === "exit").map((p) => p.label));
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      if (!used.has(letter)) return letter;
    }
    return "A";
  }

  private openAttach(slot: AttachSlot) {
    const cam = this.host.engine.camera;
    const shown = presentSlot(slot, cam.scale);
    const [sx, sy] = cam.toScreen(shown.x, shown.y);
    this.menu = { sx, sy, slot };
    this.hotHost = slot.host;
    this.host.onAttachMenu(this.menu);
    this.host.engine.invalidate();
  }

  private trackAttach(p: PointerInfo) {
    if (this.tool !== "select" || this.gesture.kind !== "none") return;
    const under = this.hostUnder(p);
    const next = this.menu ? this.menu.slot.host : (under ?? (this.attachSlotAt(p) ? this.hotHost : null));
    if (sameHost(next, this.hotHost)) return;
    this.hotHost = next;
    this.host.engine.invalidate();
  }

  private hostUnder(p: PointerInfo): AttachHost | null {
    const scene = this.host.engine.scene;
    if (!scene) return null;
    const hit = this.host.engine.hitAt(p.sx, p.sy);
    if (hit?.kind === "decoration") {
      const decoration = scene.decorations.find((item) => item.id === hit.id);
      if (decoration && (decoration.kind === "wall" || decoration.kind === "column")) return { kind: "decoration", id: decoration.id };
    }
    if (hit?.kind === "poi") {
      const poi = scene.pois.find((item) => item.id === hit.id);
      if (poi && poi.w > 0 && poi.h > 0 && (poi.kind === "stairs" || poi.kind === "entrance" || poi.kind === "exit")) return { kind: "poi", id: poi.id };
    }
    const usable = (index: number) => {
      const shape = scene.sections[index];
      return shape && !shape.loose && shape.display !== "round-table" && shape.display !== "rect-table";
    };
    if (hit?.kind === "section" && usable(hit.section)) {
      const shape = scene.sections[hit.section];
      return { kind: "section", id: shape.id, index: hit.section };
    }
    if (hit?.kind === "seat") {
      const index = scene.rows[hit.row]?.section;
      if (index !== undefined && usable(index)) return { kind: "section", id: scene.sections[index].id, index };
    }
    for (let i = scene.sections.length - 1; i >= 0; i--) {
      if (usable(i) && pointInPolygon(p.wx, p.wy, scene.sections[i].points)) return { kind: "section", id: scene.sections[i].id, index: i };
    }
    return null;
  }

  /** The slot under the pointer, for the shape that is currently showing them. */
  private attachSlotAt(p: PointerInfo): AttachSlot | null {
    if (this.tool !== "select" || !this.hotHost) return null;
    const scene = this.host.engine.scene;
    if (!scene) return null;
    const host = this.menu?.slot.host ?? this.hotHost;
    const scale = this.host.engine.camera.scale;
    for (const slot of attachSlots(scene)) {
      if (!sameHost(slot.host, host)) continue;
      const shown = presentSlot(slot, scale);
      if (!inAttachSlot(shown, p.wx, p.wy)) continue;
      if (hostContains(scene, host, p.wx, p.wy)) continue;
      return slot;
    }
    return null;
  }

  private drawAttach(ctx: CanvasRenderingContext2D) {
    if (this.tool !== "select" || this.gesture.kind !== "none") return;
    const scene = this.host.engine.scene;
    const host = this.menu?.slot.host ?? this.hotHost;
    if (!scene || !host) return;
    const cam = this.host.engine.camera;
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.fillStyle = "rgba(96,165,250,0.22)";
    ctx.lineCap = "round";
    for (const slot of attachSlots(scene)) {
      if (!sameHost(slot.host, host)) continue;
      const shown = presentSlot(slot, cam.scale);
      const corners = boxCorners(shown.x, shown.y, shown.span, shown.thick, shown.rotation);
      ctx.beginPath();
      corners.forEach((pt, i) => {
        const [sx, sy] = cam.toScreen(pt[0], pt[1]);
        if (i) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
      });
      ctx.closePath();
      ctx.fill();
      ctx.setLineDash([0.8, 3.2]);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);
      const [cx, cy] = cam.toScreen(shown.x, shown.y);
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy);
      ctx.lineTo(cx + 5, cy);
      ctx.moveTo(cx, cy - 5);
      ctx.lineTo(cx, cy + 5);
      ctx.lineWidth = 1.75;
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- overlay ---------- */

  /** Drawn by the engine after the map, in CSS-pixel screen space. */
  overlay = (ctx: CanvasRenderingContext2D) => {
    const engine = this.host.engine;
    const cam = engine.camera;
    this.syncAssist();
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
      if (this.tool === "shape:ellipse" || this.tool === "shape:column" || this.tool === "table-round") {
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
    const blocking = this.phase?.kind === "block" && this.cursor;
    if (blocking) {
      const [ax, ay] = cam.toScreen(this.phase!.x0, this.phase!.y0);
      const [bx, by] = cam.toScreen(this.cursor![0], this.cursor![1]);
      const left = Math.min(ax, bx);
      const top = Math.min(ay, by);
      const width = Math.abs(bx - ax);
      const height = Math.abs(by - ay);
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(left, top, width, height);
      ctx.setLineDash([]);
      if (preview.length) this.drawBlockRulers(ctx, preview, left, top, width, height);
    }
    if (preview.length) {
      const seats = this.drawRowPreview(ctx, preview);
      if (!blocking) {
        const at = this.cursor ? cam.toScreen(this.cursor[0], this.cursor[1]) : [0, 0];
        const text = preview.length > 1 ? `${preview.length} rows · ${seats} seats` : `${seats} seat${seats === 1 ? "" : "s"}`;
        this.badge(ctx, at[0], at[1], text);
      }
    }
    this.drawGuides(ctx);
    this.drawAttach(ctx);
    ctx.restore();
  };

  private drawGuides(ctx: CanvasRenderingContext2D) {
    if (!this.guides.length || !this.drawing()) return;
    const cam = this.host.engine.camera;
    const pad = 8;
    ctx.save();
    ctx.strokeStyle = "#ff2bd6";
    ctx.lineWidth = 1;
    for (const guide of this.guides) {
      const vertical = guide.axis === "x";
      const at = vertical ? cam.toScreen(guide.at, 0)[0] : cam.toScreen(0, guide.at)[1];
      const s0 = vertical ? cam.toScreen(0, guide.lo)[1] : cam.toScreen(guide.lo, 0)[0];
      const s1 = vertical ? cam.toScreen(0, guide.hi)[1] : cam.toScreen(guide.hi, 0)[0];
      const a = Math.min(s0, s1) - pad;
      const b = Math.max(s0, s1) + pad;
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(at + 0.5, a);
        ctx.lineTo(at + 0.5, b);
      } else {
        ctx.moveTo(a, at + 0.5);
        ctx.lineTo(b, at + 0.5);
      }
      ctx.stroke();
      this.guideCross(ctx, vertical ? at : a + pad, vertical ? a + pad : at);
      this.guideCross(ctx, vertical ? at : b - pad, vertical ? b - pad : at);
      if (guide.gap === undefined || guide.mark === undefined) continue;
      const mark = vertical ? cam.toScreen(0, guide.mark)[1] : cam.toScreen(guide.mark, 0)[0];
      if (guide.gap * cam.scale < 28) continue;
      this.guideLabel(ctx, vertical ? at : mark, vertical ? mark : at, formatLength(guide.gap));
    }
    ctx.restore();
  }

  private guideCross(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const t = 3.5;
    ctx.beginPath();
    ctx.moveTo(x - t, y + 0.5);
    ctx.lineTo(x + t, y + 0.5);
    ctx.moveTo(x + 0.5, y - t);
    ctx.lineTo(x + 0.5, y + t);
    ctx.stroke();
  }

  private guideLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    const w = ctx.measureText(text).width + 10;
    const h = 16;
    const left = x - w / 2;
    const top = y - h / 2;
    ctx.fillStyle = "#ff2bd6";
    ctx.beginPath();
    ctx.roundRect(left, top, w, h, 3);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, left + 5, top + h / 2 + 0.5);
  }

  /** Dashed frame around the selected seats. It follows their outline, including while they bend. */
  private strokeSelection(ctx: CanvasRenderingContext2D, shape: Point[] | null) {
    if (!shape || shape.length < 3) return;
    const cam = this.host.engine.camera;
    ctx.beginPath();
    shape.forEach(([x, y], i) => {
      const [sx, sy] = cam.toScreen(x, y);
      if (i) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
    });
    ctx.closePath();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = "rgba(59,130,246,0.9)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** The one selected box that can be resized from its edges, or null. */
  private scaleTarget(): { key: string; kind: "decoration" | "poi" | "table"; x: number; y: number; w: number; h: number; rotation: number; lock: boolean; text: boolean } | null {
    if (this.tool !== "select") return null;
    const sel = this.host.selection();
    if (sel.size !== 1) return null;
    const [key] = sel;
    const doc = this.host.doc();
    if (key.startsWith("d:")) {
      const decoration = doc.decorations.find((item) => item.id === key.slice(2));
      if (!decoration) return null;
      return {
        key,
        kind: "decoration",
        x: decoration.x,
        y: decoration.y,
        w: decoration.kind === "text" ? decorationWidth(decoration) : decoration.w,
        h: decoration.h,
        rotation: decoration.rotation,
        lock: false,
        text: decoration.kind === "text",
      };
    }
    if (key.startsWith("p:")) {
      const poi = doc.pois.find((item) => item.id === key.slice(2));
      if (!poi || poi.w <= 0 || poi.h <= 0) return null;
      return { key, kind: "poi", x: poi.x, y: poi.y, w: poi.w, h: poi.h, rotation: poi.rotation, lock: false, text: false };
    }
    if (key.startsWith("s:")) {
      const section = doc.sections.find((item) => item.id === key.slice(2));
      const row = section?.rows[0];
      if (!section || !row || (section.display !== "round-table" && section.display !== "rect-table")) return null;
      return { key, kind: "table", x: row.x, y: row.y, w: row.boxW, h: row.boxH, rotation: row.rotation, lock: section.display === "round-table", text: false };
    }
    return null;
  }

  private scaleHandleAt(p: PointerInfo): { handle: ScaleHandle; box: NonNullable<ReturnType<ToolController["scaleTarget"]>>; sx: number; sy: number; cx: number; cy: number } | null {
    const box = this.scaleTarget();
    if (!box) return null;
    const cam = this.host.engine.camera;
    const [cx, cy] = cam.toScreen(box.x, box.y);
    let best: { handle: ScaleHandle; sx: number; sy: number; d: number } | null = null;
    for (const handle of SCALE_HANDLES) {
      const [x, y] = cam.toScreen(...this.scalePoint(box, handle.lx, handle.ly));
      const d = Math.hypot(x - p.sx, y - p.sy);
      if (d > HANDLE + 2) continue;
      if (!best || Math.abs(handle.lx) + Math.abs(handle.ly) > 1 || d < best.d) best = { handle: handle.id, sx: x, sy: y, d };
    }
    return best && box ? { handle: best.handle, box, sx: best.sx, sy: best.sy, cx, cy } : null;
  }

  private scalePoint(box: { x: number; y: number; w: number; h: number; rotation: number }, lx: number, ly: number): Point {
    const c = Math.cos(toRad(box.rotation));
    const s = Math.sin(toRad(box.rotation));
    const x = lx * box.w / 2;
    const y = ly * box.h / 2;
    return [box.x + x * c - y * s, box.y + x * s + y * c];
  }

  /** New box from the pointer, with the opposite edge staying put. Shift keeps the proportions. */
  private scaledBox(g: Extract<Gesture, { kind: "scale" }>, p: PointerInfo) {
    const rot = toRad(g.rotation);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const signs = SCALE_HANDLES.find((handle) => handle.id === g.handle) ?? { lx: 1, ly: 1 };
    let lx = (p.wx - g.x0) * c + (p.wy - g.y0) * s;
    let ly = -(p.wx - g.x0) * s + (p.wy - g.y0) * c;
    const step = this.step();
    if (step > 0) {
      lx = snap(lx, step);
      ly = snap(ly, step);
    }
    const min = g.text ? 4 : g.key.startsWith("s:") ? 16 : 8;
    let left = -g.w0 / 2;
    let right = g.w0 / 2;
    let top = -g.h0 / 2;
    let bottom = g.h0 / 2;
    if (signs.lx === 1) right = Math.max(left + min, lx);
    if (signs.lx === -1) left = Math.min(right - min, lx);
    if (signs.ly === 1) bottom = Math.max(top + min, ly);
    if (signs.ly === -1) top = Math.min(bottom - min, ly);
    let w = right - left;
    let h = bottom - top;
    const uniform = g.lock || g.text || (p.shift && signs.lx !== 0 && signs.ly !== 0);
    if (uniform && g.w0 > 0 && g.h0 > 0) {
      const rw = w / g.w0;
      const rh = h / g.h0;
      const ratio = signs.lx !== 0 && signs.ly !== 0 ? Math.max(rw, rh) : signs.lx !== 0 ? rw : rh;
      w = Math.max(min, g.w0 * ratio);
      h = g.lock ? w : Math.max(min, g.h0 * ratio);
      if (signs.lx === 1) right = left + w;
      else if (signs.lx === -1) left = right - w;
      else {
        const mid = (left + right) / 2;
        left = mid - w / 2;
        right = mid + w / 2;
      }
      if (signs.ly === 1) bottom = top + h;
      else if (signs.ly === -1) top = bottom - h;
      else {
        const mid = (top + bottom) / 2;
        top = mid - h / 2;
        bottom = mid + h / 2;
      }
    }
    const clx = (left + right) / 2;
    const cly = (top + bottom) / 2;
    return { x: g.x0 + clx * c - cly * s, y: g.y0 + clx * s + cly * c, w, h: g.lock ? w : h };
  }

  private commitScale(g: Extract<Gesture, { kind: "scale" }>) {
    const engine = this.host.engine;
    engine.state.resize = null;
    engine.invalidate();
    if (Math.abs(g.w - g.w0) < 0.05 && Math.abs(g.h - g.h0) < 0.05 && Math.abs(g.x - g.x0) < 0.05 && Math.abs(g.y - g.y0) < 0.05) return;
    const round = (n: number) => Math.round(n * 100) / 100;
    const doc = this.host.doc();
    const x = round(g.x);
    const y = round(g.y);
    const w = round(g.w);
    const h = round(g.lock ? g.w : g.h);
    if (g.key.startsWith("d:")) {
      const id = g.key.slice(2);
      this.host.commit({
        ...doc,
        decorations: doc.decorations.map((d) => (d.id === id ? { ...d, x, y, w: g.text ? d.w : w, h } : d)),
      });
      return;
    }
    if (g.key.startsWith("p:")) {
      const id = g.key.slice(2);
      this.host.commit({ ...doc, pois: doc.pois.map((p) => (p.id === id ? { ...p, x, y, w, h } : p)) });
      return;
    }
    const id = g.key.slice(2);
    this.host.commit({ ...doc, sections: doc.sections.map((s) => (s.id === id ? resizeTable(s, x, y, w, h) : s)) });
  }

  private paintScaleHandles(ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number; rotation: number }) {
    const cam = this.host.engine.camera;
    for (const handle of SCALE_HANDLES) {
      const [x, y] = cam.toScreen(...this.scalePoint(box, handle.lx, handle.ly));
      this.square(ctx, x, y, 4);
    }
  }

  private drawHandles(ctx: CanvasRenderingContext2D, g: Gesture) {
    const engine = this.host.engine;
    const scene = engine.scene;
    if (!scene) return;
    const cam = engine.camera;

    if (g.kind === "rotate") {
      const [px, py] = cam.toScreen(g.px, g.py);
      this.badge(ctx, px, py, `${g.angle}°`, true);
      return;
    }
    if (g.kind === "move" && g.started) {
      this.strokeSelection(ctx, this.selectionShape());
      return;
    }
    if (g.kind === "scale") {
      this.paintScaleHandles(ctx, g);
      return;
    }

    const target = this.scaleTarget();
    if (target) this.paintScaleHandles(ctx, target);

    const sel = this.host.selection();
    if (g.kind !== "vertex") {
      const shape = this.selectionShape();
      const rotate = this.rotateHandle();
      if (shape && shape.length >= 3) this.strokeSelection(ctx, shape);
      else if (rotate) {
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = "rgba(59,130,246,0.6)";
        ctx.strokeRect(rotate.x0 - 4, rotate.y0 - 4, rotate.x1 - rotate.x0 + 8, rotate.y1 - rotate.y0 + 8);
        ctx.setLineDash([]);
      }
      if (rotate) {
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(rotate.stemX, rotate.stemY);
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
    if (!key.startsWith("s:") || target?.kind === "table") return;
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

  /** Tick marks on the box edges, one per column and one per row, with the count outside. */
  private drawBlockRulers(
    ctx: CanvasRenderingContext2D,
    rows: Omit<SeatMapRow, "id" | "label">[],
    left: number,
    top: number,
    width: number,
    height: number,
  ) {
    const cam = this.host.engine.camera;
    const xs = new Float32Array(MAX_SEATS_PER_ROW);
    const ys = new Float32Array(MAX_SEATS_PER_ROW);
    const seats = placeRow({ ...rows[0], id: "", label: "" }, xs, ys);
    const seatX: number[] = [];
    for (let i = 0; i < seats; i++) seatX.push(cam.toScreen(xs[i], ys[i])[0]);
    const rowY = rows.map((row) => cam.toScreen(row.x, row.y)[1]);
    const right = left + width;
    const cols = rows[0].seats;
    const hEdge = top;
    const hDir = -1;
    const vEdge = right;
    const vDir = 1;

    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1;
    ctx.lineCap = "butt";
    const colGap = seatX.length > 1 ? Math.abs(seatX[1] - seatX[0]) : 99;
    if (colGap >= 6) {
      for (const x of seatX) {
        ctx.beginPath();
        ctx.moveTo(x, hEdge);
        ctx.lineTo(x, hEdge + hDir * 6);
        ctx.stroke();
      }
    }
    const rowGap = rowY.length > 1 ? Math.abs(rowY[1] - rowY[0]) : 99;
    if (rowGap >= 6) {
      for (const y of rowY) {
        ctx.beginPath();
        ctx.moveTo(vEdge, y);
        ctx.lineTo(vEdge + vDir * 6, y);
        ctx.stroke();
      }
    }
    ctx.restore();

    this.rulerLabel(ctx, left + width / 2, hEdge, `${cols} seat${cols === 1 ? "" : "s"}`, "above");
    this.rulerLabel(ctx, vEdge, top + height / 2, `${rows.length} row${rows.length === 1 ? "" : "s"}`, "right");
  }

  private rulerLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, side: "below" | "above" | "left" | "right") {
    ctx.font = "500 11px ui-sans-serif, system-ui, sans-serif";
    const w = ctx.measureText(text).width + 10;
    const h = 18;
    const left = side === "left" ? x - w - 10 : side === "right" ? x + 10 : x - w / 2;
    const top = side === "below" ? y + 10 : side === "above" ? y - h - 10 : y - h / 2;
    ctx.fillStyle = "#171717";
    ctx.beginPath();
    ctx.roundRect(left, top, w, h, 9);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, left + 5, top + h / 2);
  }

  private drawRowPreview(ctx: CanvasRenderingContext2D, rows: Omit<SeatMapRow, "id" | "label">[]): number {
    const cam = this.host.engine.camera;
    // Never draw a preview circle larger than the real seat, or the outline appears to cut it.
    const r = Math.min(Math.max(0.6, SEAT_RADIUS * cam.scale), DEFAULT_SEAT_PITCH * cam.scale * 0.42);
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

  private badge(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, centered = false) {
    ctx.font = "500 12px ui-sans-serif, system-ui, sans-serif";
    const w = ctx.measureText(text).width + 12;
    const left = centered ? x - w / 2 : x + 12;
    const top = centered ? y - 11 : y + 12;
    ctx.fillStyle = "#171717";
    ctx.beginPath();
    ctx.roundRect(left, top, w, 22, 11);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, left + 6, top + 11);
  }
}
