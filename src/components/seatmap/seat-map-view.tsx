"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m, useMotionValue, type MotionValue } from "framer-motion";
import { Maximize, Minus, Plus } from "lucide-react";
import { SPRING } from "@/components/motion/variants";
import { SeatMapEngine, type PointerInfo } from "@/lib/seatmap/engine/engine";
import { cardHit, type MapHit } from "@/lib/seatmap/engine/hit";
import { buildScene, type Scene, type SeatStatus } from "@/lib/seatmap/engine/scene";
import type { SeatMapDoc } from "@/lib/seatmap/schema";
import { cn } from "@/lib/utils";

type Props = {
  doc: SeatMapDoc;
  /** Live sales hook: seats keyed by id (`101-4-12`). Unlisted seats are available. */
  seatState?: ReadonlyMap<string, SeatStatus>;
  onSeatTap?: (seat: { id: string; section: string; row: string; number: number }) => void;
  className?: string;
};

export type Tip = { hit: MapHit; scene: Scene };

/** Read-only venue map. Pan, pinch and wheel zoom; hover or tap for details. */
export function SeatMapView({ doc, seatState, onSeatTap, className }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<SeatMapEngine | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const tipRef = useRef<Tip | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const tapRef = useRef(onSeatTap);

  useEffect(() => {
    tapRef.current = onSeatTap;
  }, [onSeatTap]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const place = (p: PointerInfo | null) => {
      if (!p) return;
      x.set(p.sx);
      y.set(p.sy);
    };
    const show = (hit: MapHit | null) => {
      const e = engine.current;
      const shown = cardHit(hit, e?.camera.scale ?? 1);
      const next = !shown || !e?.scene ? null : { hit: shown, scene: e.scene };
      const prev = tipRef.current;
      if (prev === next || (prev && next && prev.scene === next.scene && sameTip(prev.hit, next.hit))) return;
      tipRef.current = next;
      setTip(next);
    };
    const e = new SeatMapEngine(el, {
      onHover: (hit, p) => {
        place(p);
        show(hit);
      },
      onTap: (hit, p) => {
        place(p);
        show(hit);
        const scene = engine.current?.scene;
        if (hit?.kind === "seat" && scene && tapRef.current) {
          const row = scene.rows[hit.row];
          const section = scene.sections[row.section];
          const number = scene.seatNumber[hit.seat];
          tapRef.current({ id: `${section.code}-${row.label}-${number}`, section: section.code, row: row.label, number });
        }
      },
      onCamera: () => {
        if (!tipRef.current) return;
        tipRef.current = null;
        setTip(null);
      },
    });
    engine.current = e;
    return () => {
      e.destroy();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    engine.current?.setScene(buildScene(doc));
  }, [doc]);

  useEffect(() => {
    engine.current?.setSeatStatus(seatState);
  }, [seatState]);

  return (
    <div className={cn("relative overflow-hidden bg-[#f4f4f2]", className)}>
      <canvas ref={canvas} className="absolute inset-0 size-full select-none" aria-label="Venue map" role="img" />
      <Tooltip tip={tip && tip.scene.doc === doc ? tip : null} x={x} y={y} />
      <ZoomControls
        onZoomIn={() => engine.current?.zoomBy(1.6)}
        onZoomOut={() => engine.current?.zoomBy(1 / 1.6)}
        onFit={() => engine.current?.fit()}
      />
    </div>
  );
}

export function ZoomControls({ onZoomIn, onZoomOut, onFit, className }: { onZoomIn: () => void; onZoomOut: () => void; onFit: () => void; className?: string }) {
  const button =
    "grid size-10 place-items-center bg-white! text-neutral-700 transition-colors duration-150 hover:bg-neutral-50! hover:text-neutral-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500";
  return (
    <div className={cn("absolute right-3 bottom-3 flex flex-col items-center gap-2", className)}>
      <div className="flex flex-col overflow-hidden rounded-full border border-neutral-200 shadow-[0_4px_12px_-4px_rgba(17,17,17,0.15)]">
        <button type="button" onClick={onZoomIn} aria-label="Zoom in" className={button}>
          <Plus className="size-4" aria-hidden />
        </button>
        <span className="h-px bg-neutral-200" aria-hidden />
        <button type="button" onClick={onZoomOut} aria-label="Zoom out" className={button}>
          <Minus className="size-4" aria-hidden />
        </button>
      </div>
      <button
        type="button"
        onClick={onFit}
        aria-label="Show whole venue"
        title="Show whole venue"
        className={cn(button, "rounded-full border border-neutral-200 shadow-[0_4px_12px_-4px_rgba(17,17,17,0.15)]")}
      >
        <Maximize className="size-4" aria-hidden />
      </button>
    </div>
  );
}

function sameTip(a: MapHit, b: MapHit) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "seat" && b.kind === "seat") return a.seat === b.seat;
  if (a.kind === "section" && b.kind === "section") return a.section === b.section;
  return false;
}

function tipKey(tip: Tip) {
  const { hit } = tip;
  if (hit.kind === "seat") return `seat-${hit.seat}`;
  if (hit.kind === "section") return `section-${hit.section}`;
  return hit.kind;
}

/** Light card that tracks the pointer. Position is a motion value, so moving it does not re-render. */
export function Tooltip({ tip, x, y }: { tip: Tip | null; x: MotionValue<number>; y: MotionValue<number> }) {
  return (
    <m.div className="pointer-events-none absolute top-0 left-0 z-10" style={{ x, y }}>
      <AnimatePresence>
        {tip ? (
          <m.div
            key={tipKey(tip)}
            role="tooltip"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1 } }}
            transition={SPRING}
            style={{ originX: 0, originY: 1 }}
            className="absolute bottom-5 left-4 w-max max-w-60 rounded-xl bg-white px-3 py-2.5 text-neutral-900 shadow-[0_14px_32px_-16px_rgba(17,17,17,0.45)]"
          >
            <TipBody tip={tip} />
          </m.div>
        ) : null}
      </AnimatePresence>
    </m.div>
  );
}

function TipBody({ tip }: { tip: Tip }) {
  const { hit, scene } = tip;
  if (hit.kind !== "seat" && hit.kind !== "section") return null;
  const section = scene.sections[hit.section];
  const tone = scene.colors[section.color];
  const heading = sectionHeading(section);
  const category = categoryAside(section, heading);

  if (hit.kind === "seat") {
    const row = scene.rows[hit.row];
    return (
      <div className="min-w-40">
        <p className="truncate text-[18px] leading-none font-semibold tracking-[-0.02em] text-neutral-950">{heading}</p>
        <dl className="mt-3 grid grid-cols-2 divide-x divide-neutral-200">
          <Fact label="Row" value={row.label} />
          <Fact label="Seat" value={scene.seatNumber[hit.seat]} />
        </dl>
        {scene.seatWheelchair[hit.seat] ? <p className="mt-2.5 text-[13px] font-medium text-neutral-600">Wheelchair access</p> : null}
        {category ? <CategoryLine fill={tone.base} stroke={tone.disc} label={category} /> : null}
      </div>
    );
  }

  const seats = section.seatEnd - section.seatStart;
  const block = section.display === "block";
  return (
    <div className="min-w-40">
      <p className="truncate text-[18px] leading-none font-semibold tracking-[-0.02em] text-neutral-950">{heading}</p>
      {block ? null : (
        <dl className="mt-3">
          <div className="flex items-baseline justify-between gap-6">
            <dt className="text-[11px] font-medium tracking-[0.08em] text-neutral-500 uppercase">Seats</dt>
            <dd className="text-[15px] leading-none font-semibold tabular-nums">{seats.toLocaleString("en")}</dd>
          </div>
        </dl>
      )}
      {category ? <CategoryLine fill={tone.base} stroke={tone.disc} label={category} /> : null}
    </div>
  );
}

/** The section people are aiming at. A generated name like "Upper tier 326" becomes "Section 326". */
function sectionHeading(section: { name: string; code: string; categoryLabel: string; display: string; label: { text: string } }) {
  if (section.display === "block" && section.label.text.trim()) return section.label.text.trim();
  const { name, code, categoryLabel } = section;
  const generated = name === `${categoryLabel} ${code}` || name === `Section ${code}` || name === code;
  return generated && code ? `Section ${code}` : name;
}

/** Category, unless the heading already says it. */
function categoryAside(section: { categoryLabel: string }, heading: string) {
  const label = section.categoryLabel.trim();
  if (!label) return "";
  if (heading.toLowerCase().includes(label.toLowerCase())) return "";
  return label;
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <dt className="text-[11px] leading-none font-medium tracking-[0.08em] text-neutral-500 uppercase">{label}</dt>
      <dd className="mt-1.5 truncate text-[20px] leading-none font-semibold tracking-[-0.03em] text-neutral-950 tabular-nums">{value}</dd>
    </div>
  );
}

function CategoryLine({ fill, stroke, label }: { fill: string; stroke: string; label: string }) {
  return (
    <p className="mt-3 flex items-center gap-2 border-t border-neutral-100 pt-2.5 text-[14px] font-medium text-neutral-800">
      <span className="size-3 shrink-0 rounded-full" style={{ background: fill, boxShadow: `inset 0 0 0 1.5px ${stroke}` }} aria-hidden />
      <span className="truncate">{label}</span>
    </p>
  );
}
