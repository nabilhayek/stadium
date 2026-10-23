"use client";

import { useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { useMotionValue } from "framer-motion";
import { Circle, DoorOpen, Footprints, LogOut, Square } from "lucide-react";
import { Tooltip, ZoomControls, type Tip } from "@/components/seatmap/seat-map-view";
import { SeatMapEngine, type PointerInfo } from "@/lib/seatmap/engine/engine";
import { cardHit, type MapHit } from "@/lib/seatmap/engine/hit";
import { buildScene } from "@/lib/seatmap/engine/scene";
import type { Bounds } from "@/lib/seatmap/geometry";
import type { SeatMapDoc } from "@/lib/seatmap/schema";
import { ATTACH_OPTIONS, type AttachKind, type AttachSlot } from "./attach";
import { selectionBounds, type Selection } from "./ops";
import { ToolController, type AssistChip, type ToolHost, type ToolId } from "./tools";

type AttachMenuState = { sx: number; sy: number; slot: AttachSlot };

const ATTACH_ICON: Record<AttachKind, ReactNode> = {
  stairs: <Footprints className="size-4" />,
  wall: <Square className="size-4" />,
  entrance: <DoorOpen className="size-4" />,
  exit: <LogOut className="size-4" />,
  column: <Circle className="size-4" />,
};

export type CanvasApi = {
  fit(): void;
  /** Zooms out until the drawing is on screen. Never zooms in. */
  reveal(): void;
  zoomBy(factor: number): void;
  focusSelection(selection: Selection): void;
  focus(bounds: Bounds): void;
  /** Forwards a key to the active tool. True when the tool used it. */
  key(e: KeyboardEvent): boolean;
  zoom(): number;
};

type Props = {
  doc: SeatMapDoc;
  selection: Selection;
  tool: ToolId;
  snapStep: number;
  snapAngle: number;
  defaultCategory: string | null;
  onCommit: (doc: SeatMapDoc, selection?: Set<string>) => void;
  onSelect: (selection: Set<string>) => void;
  onTool: (tool: ToolId) => void;
  onNotify: (message: string) => void;
  onAssist: (chips: AssistChip[]) => void;
  apiRef: React.Ref<CanvasApi>;
  /** Assistant turn in progress. Objects it places stay grey placeholders until this turns false. */
  crafting: boolean;
};

/** The editable map. Props flow into the engine through refs so a drag never waits on React. */
export function DesignerCanvas(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SeatMapEngine | null>(null);
  const toolsRef = useRef<ToolController | null>(null);
  const latest = useRef(props);
  const frame = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0);
  const [tip, setTip] = useState<Tip | null>(null);
  const [attach, setAttach] = useState<AttachMenuState | null>(null);
  const tipRef = useRef<Tip | null>(null);
  const tipX = useMotionValue(0);
  const tipY = useMotionValue(0);

  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let raf = 0;
    const engine = new SeatMapEngine(el, {
      opening: "metres",
      onHover: (hit, p) => {
        placeTip(p, tipX, tipY);
        const shown = cardHit(hit, engine.camera.scale);
        const next =
          latest.current.tool !== "select" || !shown || !engine.scene || (shown.kind !== "seat" && shown.kind !== "section")
            ? null
            : { hit: shown, scene: engine.scene };
        const prev = tipRef.current;
        if (prev === next || (prev && next && prev.scene === next.scene && sameHit(prev.hit, next.hit))) return;
        tipRef.current = next;
        setTip(next);
      },
      onCamera: () => {
        toolsRef.current?.closeAttach();
        if (tipRef.current) {
          tipRef.current = null;
          setTip(null);
        }
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          setZoom(engine.camera.scale);
        });
      },
    });
    engine.state.design = true;
    const host: ToolHost = {
      engine,
      doc: () => latest.current.doc,
      selection: () => latest.current.selection,
      select: (keys) => latest.current.onSelect(keys),
      commit: (doc, selection) => latest.current.onCommit(doc, selection),
      setTool: (tool) => latest.current.onTool(tool),
      snapStep: () => latest.current.snapStep,
      snapAngle: () => latest.current.snapAngle,
      defaultCategory: () => latest.current.defaultCategory,
      notify: (m) => latest.current.onNotify(m),
      assist: (chips) => latest.current.onAssist(chips),
      onAttachMenu: (menu) => setAttach(menu),
    };
    const tools = new ToolController(host);
    engine.setInteraction(tools);
    engine.state.overlay = tools.overlay;
    engineRef.current = engine;
    toolsRef.current = tools;
    return () => {
      cancelAnimationFrame(raf);
      engine.destroy();
      latest.current.onAssist([]);
      engineRef.current = null;
      toolsRef.current = null;
    };
  }, []);

  useImperativeHandle(
    props.apiRef,
    () => ({
      fit: () => engineRef.current?.fit(),
      reveal: () => engineRef.current?.reveal(),
      zoomBy: (f) => engineRef.current?.zoomBy(f),
      focusSelection: (sel) => {
        const engine = engineRef.current;
        const b = engine?.scene && selectionBounds(engine.scene, sel);
        if (b) engine.focus(b, true, 80);
      },
      focus: (b) => engineRef.current?.focus(b, true, 80),
      key: (e) => toolsRef.current?.key(e) ?? false,
      zoom: () => engineRef.current?.camera.scale ?? 1,
    }),
    [],
  );

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    // Note new objects before the scene swaps, so the baseline is the map already on screen.
    engine.syncCraft(props.crafting, props.doc);
    // Same document: the assistant only flipped between working and idle. Keep the scene.
    if (engine.scene?.doc === props.doc) return;
    toolsRef.current?.closeAttach();
    // A finished drag keeps its preview until the moved geometry lands here, so nothing flickers back.
    engine.state.transient = null;
    engine.state.outline = null;
    engine.setScene(buildScene(props.doc));
  }, [props.crafting, props.doc]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.state.selection = props.selection;
    engine.invalidate();
  }, [props.selection]);

  useEffect(() => {
    toolsRef.current?.setTool(props.tool);
    if (props.tool !== "select" && tipRef.current) {
      tipRef.current = null;
      setTip(null);
    }
  }, [props.tool]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.state.grid = props.snapStep;
    engine.invalidate();
  }, [props.snapStep]);

  useEffect(() => {
    if (attach) menuRef.current?.focus();
  }, [attach]);

  useEffect(() => {
    if (!attach) return;
    function onPointer(e: PointerEvent) {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("[data-attach-menu], canvas")) return;
      toolsRef.current?.closeAttach();
    }
    window.addEventListener("pointerdown", onPointer, true);
    return () => window.removeEventListener("pointerdown", onPointer, true);
  }, [attach]);

  const menuAt = attach ? placeMenu(attach.sx, attach.sy, frame.current) : null;

  return (
    <div ref={frame} className="relative min-h-0 flex-1 overflow-hidden bg-[#f4f4f2]">
      <canvas ref={canvas} className="absolute inset-0 size-full select-none outline-none" aria-label="Seat map canvas" />
      {attach && menuAt ? (
        <div
          data-attach-menu
          role="menu"
          aria-label="Add beside section"
          tabIndex={-1}
          ref={menuRef}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            toolsRef.current?.closeAttach();
          }}
          className="absolute z-30 w-44 rounded-lg border border-neutral-200 bg-white py-1 shadow-[0_8px_24px_rgba(17,17,17,0.12)] outline-none"
          style={{ left: menuAt.left, top: menuAt.top }}
        >
          <p className="px-2.5 pt-1 pb-0.5 text-[11px] font-medium text-neutral-400">Add beside</p>
          {ATTACH_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] text-neutral-800 hover:bg-neutral-100"
              onClick={() => toolsRef.current?.placeBeside(attach.slot, option.id)}
            >
              <span className="text-neutral-500">{ATTACH_ICON[option.id]}</span>
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      <Tooltip tip={tip && tip.scene.doc === props.doc ? tip : null} x={tipX} y={tipY} />
      <ZoomControls
        onZoomIn={() => engineRef.current?.zoomBy(1.6)}
        onZoomOut={() => engineRef.current?.zoomBy(1 / 1.6)}
        onFit={() => engineRef.current?.fit()}
      />
      <span className="pointer-events-none absolute right-3 bottom-40 rounded-full bg-white/90 px-2 py-0.5 text-[12px] text-neutral-500 tabular-nums shadow-[0_1px_2px_rgba(17,17,17,0.08)]">
        {zoom ? `1 m = ${(zoom * 10).toFixed(zoom * 10 < 10 ? 1 : 0)} px` : ""}
      </span>
    </div>
  );
}

function placeMenu(sx: number, sy: number, frame: HTMLElement | null) {
  const width = frame?.clientWidth ?? 0;
  const height = frame?.clientHeight ?? 0;
  const menuWidth = 176;
  const menuHeight = 196;
  let left = sx + 16;
  let top = sy - menuHeight / 2;
  if (width) {
    if (left + menuWidth > width - 8) left = Math.max(8, sx - menuWidth - 16);
    if (left < 8) left = 8;
  }
  if (height) {
    if (top + menuHeight > height - 8) top = Math.max(8, height - menuHeight - 8);
    if (top < 8) top = 8;
  }
  return { left, top };
}

function placeTip(p: PointerInfo | null, x: { set: (v: number) => void }, y: { set: (v: number) => void }) {
  if (!p) return;
  x.set(p.sx);
  y.set(p.sy);
}

function sameHit(a: MapHit, b: MapHit) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "seat" && b.kind === "seat") return a.seat === b.seat;
  if (a.kind === "section" && b.kind === "section") return a.section === b.section;
  return false;
}
