"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { useMotionValue } from "framer-motion";
import { Tooltip, ZoomControls, type Tip } from "@/components/seatmap/seat-map-view";
import { SeatMapEngine, type PointerInfo } from "@/lib/seatmap/engine/engine";
import { cardHit, type MapHit } from "@/lib/seatmap/engine/hit";
import { buildScene } from "@/lib/seatmap/engine/scene";
import type { Bounds } from "@/lib/seatmap/geometry";
import type { SeatMapDoc } from "@/lib/seatmap/schema";
import { selectionBounds, type Selection } from "./ops";
import { ToolController, type ToolHost, type ToolId } from "./tools";

export type CanvasApi = {
  fit(): void;
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
  defaultCategory: string | null;
  onCommit: (doc: SeatMapDoc, selection?: Set<string>) => void;
  onSelect: (selection: Set<string>) => void;
  onTool: (tool: ToolId) => void;
  onNotify: (message: string) => void;
  apiRef: React.Ref<CanvasApi>;
};

/** The editable map. Props flow into the engine through refs so a drag never waits on React. */
export function DesignerCanvas(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SeatMapEngine | null>(null);
  const toolsRef = useRef<ToolController | null>(null);
  const latest = useRef(props);
  const [zoom, setZoom] = useState(0);
  const [tip, setTip] = useState<Tip | null>(null);
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
      defaultCategory: () => latest.current.defaultCategory,
      notify: (m) => latest.current.onNotify(m),
    };
    const tools = new ToolController(host);
    engine.setInteraction(tools);
    engine.state.overlay = tools.overlay;
    engineRef.current = engine;
    toolsRef.current = tools;
    return () => {
      cancelAnimationFrame(raf);
      engine.destroy();
      engineRef.current = null;
      toolsRef.current = null;
    };
  }, []);

  useImperativeHandle(
    props.apiRef,
    () => ({
      fit: () => engineRef.current?.fit(),
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
    // A finished drag keeps its preview until the moved geometry lands here, so nothing flickers back.
    engine.state.transient = null;
    engine.state.outline = null;
    engine.setScene(buildScene(props.doc));
  }, [props.doc]);

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

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-[#f4f4f2]">
      <canvas ref={canvas} className="absolute inset-0 size-full select-none outline-none" aria-label="Seat map canvas" />
      <Tooltip tip={tip && tip.scene.doc === props.doc ? tip : null} x={tipX} y={tipY} />
      <ZoomControls
        onZoomIn={() => engineRef.current?.zoomBy(1.6)}
        onZoomOut={() => engineRef.current?.zoomBy(1 / 1.6)}
        onFit={() => engineRef.current?.fit()}
      />
      <span className="pointer-events-none absolute right-16 bottom-4 rounded-full bg-white/90 px-2 py-0.5 text-[12px] text-neutral-500 tabular-nums shadow-[0_1px_2px_rgba(17,17,17,0.08)]">
        {zoom ? `1 m = ${(zoom * 10).toFixed(zoom * 10 < 10 ? 1 : 0)} px` : ""}
      </span>
    </div>
  );
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
