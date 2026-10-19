import type { Bounds, Rigid } from "../geometry";
import { Camera } from "./camera";
import { CanvasRenderer, lodFor, type Renderer, type RenderState, type Transient } from "./canvas-renderer";
import { hitTest, seatLabelsVisible, type MapHit } from "./hit";
import { seatStatusArray, type Scene, type SeatStatus } from "./scene";

export type PointerInfo = {
  sx: number;
  sy: number;
  wx: number;
  wy: number;
  button: number;
  shift: boolean;
  alt: boolean;
  /** Ctrl on Windows/Linux, Cmd on macOS. */
  mod: boolean;
  pointerType: string;
};

/** Designer tools plug in here. Returning false from `down` lets the engine pan instead. */
export interface Interaction {
  down(p: PointerInfo): boolean;
  move(p: PointerInfo): void;
  up(p: PointerInfo): void;
  cancel(): void;
  hover?(p: PointerInfo): void;
  dblclick?(p: PointerInfo): void;
}

export type EngineOptions = {
  onHover?: (hit: MapHit | null, p: PointerInfo | null) => void;
  onTap?: (hit: MapHit | null, p: PointerInfo) => void;
  onCamera?: () => void;
};

type Mode = "idle" | "pan" | "pinch" | "interact";

const MAX_DPR = 2;
const TAP_SLOP = 6;

/**
 * Owns the canvas, camera and gestures. React never re-renders during a pan or
 * pinch: pointer events only move the camera and schedule one frame.
 */
export class SeatMapEngine {
  readonly camera = new Camera();
  readonly state: RenderState = {
    selection: new Set(),
    hover: null,
    seatStatus: null,
    transient: null,
    outline: null,
    moving: false,
    grid: 0,
    design: false,
    focalDrag: null,
    overlay: null,
    seatPop: [],
  };
  scene: Scene | null = null;
  lastFrameMs = 0;

  private ctx: CanvasRenderingContext2D;
  private renderer: Renderer = new CanvasRenderer();
  private width = 0;
  private height = 0;
  private dpr = 1;
  private frame = 0;
  private font: string;
  private interaction: Interaction | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private mode: Mode = "idle";
  private last = { x: 0, y: 0 };
  private pinch = { dist: 0, x: 0, y: 0 };
  private tap = { x: 0, y: 0, time: 0, moved: false };
  private samples: { x: number; y: number; t: number }[] = [];
  private velocity = { x: 0, y: 0 };
  private inertia = 0;
  private settle: ReturnType<typeof setTimeout> | null = null;
  private animation = 0;
  private pops: { index: number; scale: number; v: number }[] = [];
  private popClock = 0;
  private space = false;
  private fitted = false;
  private seatStatusMap: ReadonlyMap<string, SeatStatus> | undefined;
  private observer: ResizeObserver;
  private cleanup: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private options: EngineOptions = {},
  ) {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("Canvas 2D is not available.");
    this.ctx = ctx;
    this.font = getComputedStyle(canvas).fontFamily || "ui-sans-serif, system-ui, sans-serif";
    canvas.style.touchAction = "none";

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();

    this.listen(canvas, "pointerdown", this.onDown as EventListener);
    this.listen(canvas, "pointermove", this.onMove as EventListener);
    this.listen(canvas, "pointerup", this.onUp as EventListener);
    this.listen(canvas, "pointercancel", this.onUp as EventListener);
    this.listen(canvas, "pointerleave", this.onLeave as EventListener);
    this.listen(canvas, "wheel", this.onWheel as EventListener, { passive: false });
    this.listen(canvas, "dblclick", this.onDblClick as EventListener);
    this.listen(canvas, "contextmenu", ((e: Event) => e.preventDefault()) as EventListener);
    this.listen(window, "keydown", this.onKey as EventListener);
    this.listen(window, "keyup", this.onKey as EventListener);
    this.listen(window, "blur", (() => (this.space = false)) as EventListener);

    if (process.env.NODE_ENV !== "production") (canvas as HTMLCanvasElement & { __engine?: SeatMapEngine }).__engine = this;
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.inertia);
    cancelAnimationFrame(this.animation);
    if (this.settle) clearTimeout(this.settle);
    this.observer.disconnect();
    for (const off of this.cleanup) off();
  }

  setScene(scene: Scene, fit = false) {
    this.scene = scene;
    this.state.seatStatus = seatStatusArray(scene, this.seatStatusMap);
    this.pops = [];
    this.state.seatPop = [];
    if (this.state.hover && !this.hoverStillValid(scene)) this.state.hover = null;
    if (fit || !this.fitted) this.fit(false);
    this.invalidate();
  }

  setSeatStatus(status: ReadonlyMap<string, SeatStatus> | undefined) {
    this.seatStatusMap = status;
    if (this.scene) this.state.seatStatus = seatStatusArray(this.scene, status);
    this.invalidate();
  }

  setInteraction(interaction: Interaction | null) {
    if (this.mode === "interact") this.interaction?.cancel();
    this.interaction = interaction;
    this.mode = "idle";
  }

  setCursor(cursor: string) {
    if (!this.space && this.mode !== "pan") this.canvas.style.cursor = cursor;
  }

  get size() {
    return { width: this.width, height: this.height };
  }

  seatsVisible() {
    return lodFor(this.camera.scale) !== "overview";
  }

  hitAt(sx: number, sy: number): MapHit | null {
    if (!this.scene) return null;
    const [wx, wy] = this.camera.toWorld(sx, sy);
    return hitTest(this.scene, wx, wy, this.camera.scale, this.seatsVisible());
  }

  invalidate() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  /** Marks the map as moving so labels drop out until it rests. */
  touch() {
    this.state.moving = true;
    if (this.settle) clearTimeout(this.settle);
    this.settle = setTimeout(() => {
      this.state.moving = false;
      this.invalidate();
    }, 140);
    this.options.onCamera?.();
    this.invalidate();
  }

  fit(animate = true) {
    if (!this.scene || !this.width) return;
    this.fitted = true;
    this.focus(this.scene.bounds, animate, 32);
  }

  focus(b: Bounds, animate = true, padding = 48) {
    if (!this.width) return;
    const target = new Camera();
    target.fit(b, this.width, this.height, padding);
    if (b === this.scene?.bounds) this.camera.minScale = target.minScale;
    if (!animate) {
      Object.assign(this.camera, { scale: target.scale, tx: target.tx, ty: target.ty });
      this.touch();
      return;
    }
    this.animateTo(target.scale, target.tx, target.ty);
  }

  zoomBy(factor: number) {
    const target = new Camera();
    Object.assign(target, this.camera.snapshot(), { minScale: this.camera.minScale, maxScale: this.camera.maxScale });
    target.zoomAt(this.width / 2, this.height / 2, factor);
    this.animateTo(target.scale, target.tx, target.ty);
  }

  /** Moves seats/sections by `transform` without rebuilding the scene. */
  beginTransient(sel: { sections: Set<number>; rows: Set<number>; decorations: Set<string>; pois: Set<string> }) {
    const scene = this.scene;
    if (!scene) return;
    const mask = new Uint8Array(scene.seatCount);
    const list: number[] = [];
    const mark = (from: number, to: number) => {
      for (let i = from; i < to; i++) {
        if (!mask[i]) {
          mask[i] = 1;
          list.push(i);
        }
      }
    };
    for (const s of sel.sections) mark(scene.sections[s].seatStart, scene.sections[s].seatEnd);
    for (const r of sel.rows) mark(scene.rows[r].seatStart, scene.rows[r].seatEnd);
    const t: Transient = {
      transform: { angle: 0, px: 0, py: 0, dx: 0, dy: 0 },
      ...sel,
      seatMask: mask,
      seats: Int32Array.from(list),
    };
    this.state.transient = t;
  }

  updateTransient(transform: Rigid) {
    if (!this.state.transient) return;
    this.state.transient.transform = transform;
    this.touch();
  }

  endTransient() {
    this.state.transient = null;
    this.invalidate();
  }

  private listen(target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) {
    target.addEventListener(type, fn, opts);
    this.cleanup.push(() => target.removeEventListener(type, fn, opts));
  }

  private hoverStillValid(scene: Scene) {
    const h = this.state.hover;
    if (!h) return true;
    if (h.kind === "seat") return h.seat < scene.seatCount;
    if (h.kind === "section") return h.section < scene.sections.length;
    return true;
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (!w || !h) return;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    if (this.width) {
      this.camera.tx += (w - this.width) / 2;
      this.camera.ty += (h - this.height) / 2;
    }
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (!this.fitted && this.scene) this.fit(false);
    this.render();
  }

  /**
   * Grows the hovered seat and settles the one just left. Same spring as the
   * tooltip (stiffness 420, damping 34, mass 0.9). Two seats at most, and the
   * loop stops once both are at rest, so a hover does not keep redrawing.
   */
  private stepSeatPop() {
    const now = performance.now();
    const dt = Math.min(1 / 30, this.popClock ? (now - this.popClock) / 1000 : 1 / 60);
    this.popClock = now;
    const close = seatLabelsVisible(this.camera.scale);
    const target = close && this.state.hover?.kind === "seat" ? this.state.hover.seat : -1;
    if (target < 0 && this.pops.length === 0) return;
    if (target >= 0 && !this.pops.some((p) => p.index === target)) {
      if (this.pops.length >= 2) {
        const drop = Math.abs(this.pops[0].scale - 1) <= Math.abs(this.pops[1].scale - 1) ? 0 : 1;
        this.pops.splice(drop, 1);
      }
      this.pops.push({ index: target, scale: 1, v: 0 });
    }
    let moving = false;
    const next: { index: number; scale: number; v: number }[] = [];
    for (const p of this.pops) {
      const goal = p.index === target ? 1.12 : 1;
      const a = (-420 * (p.scale - goal) - 34 * p.v) / 0.9;
      p.v += a * dt;
      p.scale += p.v * dt;
      if (Math.abs(p.scale - goal) < 0.003 && Math.abs(p.v) < 0.02) {
        if (goal === 1) continue;
        p.scale = goal;
        p.v = 0;
      } else moving = true;
      next.push(p);
    }
    this.pops = next;
    this.state.seatPop = next;
    if (moving) this.invalidate();
  }

  private render() {
    if (!this.scene || !this.width) return;
    this.stepSeatPop();
    const start = performance.now();
    this.renderer.draw({
      ctx: this.ctx,
      width: this.width,
      height: this.height,
      dpr: this.dpr,
      camera: this.camera,
      scene: this.scene,
      state: this.state,
      font: this.font,
    });
    this.lastFrameMs = performance.now() - start;
  }

  private info(e: PointerEvent | MouseEvent): PointerInfo {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const [wx, wy] = this.camera.toWorld(sx, sy);
    return {
      sx,
      sy,
      wx,
      wy,
      button: e.button,
      shift: e.shiftKey,
      alt: e.altKey,
      mod: e.ctrlKey || e.metaKey,
      pointerType: "pointerType" in e ? e.pointerType : "mouse",
    };
  }

  private stopMotion() {
    cancelAnimationFrame(this.inertia);
    cancelAnimationFrame(this.animation);
    this.inertia = 0;
    this.animation = 0;
  }

  private onDown = (e: PointerEvent) => {
    this.stopMotion();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events have no active pointer */
    }
    const p = this.info(e);
    this.pointers.set(e.pointerId, { x: p.sx, y: p.sy });

    if (this.pointers.size === 2) {
      if (this.mode === "interact") this.interaction?.cancel();
      this.startPinch();
      return;
    }
    if (this.pointers.size > 2) return;

    this.last = { x: p.sx, y: p.sy };
    this.tap = { x: p.sx, y: p.sy, time: performance.now(), moved: false };
    this.samples = [{ x: p.sx, y: p.sy, t: performance.now() }];
    const panGesture = this.space || e.button === 1 || e.button === 2;
    if (!panGesture && this.interaction && e.button === 0 && this.interaction.down(p)) {
      this.mode = "interact";
    } else {
      this.mode = "pan";
      if (this.state.hover) {
        this.state.hover = null;
        this.options.onHover?.(null, null);
      }
    }
  };

  private startPinch() {
    const [a, b] = [...this.pointers.values()];
    this.mode = "pinch";
    this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.tap.moved = true;
  }

  private onMove = (e: PointerEvent) => {
    const p = this.info(e);
    const tracked = this.pointers.get(e.pointerId);
    if (tracked) {
      tracked.x = p.sx;
      tracked.y = p.sy;
    }
    if (Math.hypot(p.sx - this.tap.x, p.sy - this.tap.y) > TAP_SLOP) this.tap.moved = true;

    switch (this.mode) {
      case "pan": {
        if (!tracked) return;
        this.camera.panBy(p.sx - this.last.x, p.sy - this.last.y);
        this.last = { x: p.sx, y: p.sy };
        const now = performance.now();
        this.samples.push({ x: p.sx, y: p.sy, t: now });
        while (this.samples.length > 2 && now - this.samples[0].t > 90) this.samples.shift();
        this.touch();
        return;
      }
      case "pinch": {
        if (this.pointers.size < 2) return;
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        this.camera.panBy(mx - this.pinch.x, my - this.pinch.y);
        if (this.pinch.dist > 0) this.camera.zoomAt(mx, my, dist / this.pinch.dist);
        this.pinch = { dist, x: mx, y: my };
        this.touch();
        return;
      }
      case "interact":
        this.interaction?.move(p);
        return;
      default:
        if (e.pointerType === "mouse") this.hover(p);
    }
  };

  private hover(p: PointerInfo) {
    this.interaction?.hover?.(p);
    const hit = this.hitAt(p.sx, p.sy);
    if (!sameHit(hit, this.state.hover)) {
      this.state.hover = hit;
      this.invalidate();
    }
    this.options.onHover?.(hit, p);
  }

  private onUp = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.info(e);
    this.pointers.delete(e.pointerId);
    const mode = this.mode;

    if (mode === "pinch") {
      if (this.pointers.size === 1) {
        const [rest] = [...this.pointers.values()];
        this.mode = "pan";
        this.last = { x: rest.x, y: rest.y };
        this.samples = [];
      } else if (this.pointers.size === 0) this.mode = "idle";
      return;
    }
    if (this.pointers.size) return;
    this.mode = "idle";

    if (mode === "interact") {
      if (e.type === "pointercancel") this.interaction?.cancel();
      else this.interaction?.up(p);
      return;
    }
    if (mode === "pan") {
      const quick = !this.tap.moved && performance.now() - this.tap.time < 500;
      if (quick && e.type !== "pointercancel") {
        this.options.onTap?.(this.hitAt(p.sx, p.sy), p);
        return;
      }
      this.fling();
    }
  };

  private onLeave = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || this.mode !== "idle") return;
    if (this.state.hover) {
      this.state.hover = null;
      this.invalidate();
    }
    this.options.onHover?.(null, null);
  };

  private fling() {
    const s = this.samples;
    if (s.length < 2) return;
    const a = s[0];
    const b = s[s.length - 1];
    const dt = b.t - a.t;
    if (dt <= 0 || performance.now() - b.t > 60) return;
    this.velocity = { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
    if (Math.hypot(this.velocity.x, this.velocity.y) < 0.25) return;
    let prev = performance.now();
    const step = (now: number) => {
      const elapsed = Math.min(48, now - prev);
      prev = now;
      this.camera.panBy(this.velocity.x * elapsed, this.velocity.y * elapsed);
      const decay = Math.pow(0.94, elapsed / 16);
      this.velocity.x *= decay;
      this.velocity.y *= decay;
      this.touch();
      if (Math.hypot(this.velocity.x, this.velocity.y) > 0.02) this.inertia = requestAnimationFrame(step);
      else this.inertia = 0;
    };
    this.inertia = requestAnimationFrame(step);
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.stopMotion();
    const p = this.info(e);
    if (e.shiftKey && !e.ctrlKey) {
      this.camera.panBy(-e.deltaY, -e.deltaX);
    } else {
      const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.height : 1;
      // Trackpad pinches arrive as ctrl+wheel with small deltas.
      const k = e.ctrlKey ? 0.01 : 0.0018;
      this.camera.zoomAt(p.sx, p.sy, Math.exp(-e.deltaY * lines * k));
    }
    this.touch();
  };

  private onDblClick = (e: MouseEvent) => {
    const p = this.info(e);
    if (this.interaction?.dblclick) {
      this.interaction.dblclick(p);
      return;
    }
    const target = new Camera();
    Object.assign(target, this.camera.snapshot(), { minScale: this.camera.minScale, maxScale: this.camera.maxScale });
    target.zoomAt(p.sx, p.sy, 2.2);
    this.animateTo(target.scale, target.tx, target.ty);
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.code !== "Space") return;
    const el = e.target as HTMLElement | null;
    if (el?.closest("input, textarea, select, [contenteditable=true], button, [role=combobox]")) return;
    this.space = e.type === "keydown";
    this.canvas.style.cursor = this.space ? "grab" : "";
    if (this.space) e.preventDefault();
  };

  private animateTo(scale: number, tx: number, ty: number, duration = 260) {
    this.stopMotion();
    const from = this.camera.snapshot();
    const start = performance.now();
    // Interpolate the zoom in log space so it feels even.
    const ls0 = Math.log(from.scale);
    const ls1 = Math.log(scale);
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const k = 1 - Math.pow(1 - t, 3);
      const s = Math.exp(ls0 + (ls1 - ls0) * k);
      // Keep the screen-space path straight by interpolating the world point at the centre.
      const cx0 = (this.width / 2 - from.tx) / from.scale;
      const cy0 = (this.height / 2 - from.ty) / from.scale;
      const cx1 = (this.width / 2 - tx) / scale;
      const cy1 = (this.height / 2 - ty) / scale;
      const cx = cx0 + (cx1 - cx0) * k;
      const cy = cy0 + (cy1 - cy0) * k;
      this.camera.scale = s;
      this.camera.tx = this.width / 2 - cx * s;
      this.camera.ty = this.height / 2 - cy * s;
      this.touch();
      this.animation = t < 1 ? requestAnimationFrame(step) : 0;
    };
    this.animation = requestAnimationFrame(step);
  }
}

function sameHit(a: MapHit | null, b: MapHit | null) {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case "seat":
      return a.seat === (b as typeof a).seat;
    case "section":
      return a.section === (b as typeof a).section;
    default:
      return a.id === (b as typeof a).id;
  }
}
