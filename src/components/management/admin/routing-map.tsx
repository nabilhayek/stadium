"use client";

import { useMemo, useRef, useState } from "react";
import { centroid, fieldOf, sectionSeatCount } from "@/lib/seatmap/geometry";
import type { SeatMapDoc } from "@/lib/seatmap/schema";
import { cn } from "@/lib/utils";
import { kitchenColor, mapBounds, type Kitchen } from "./model";

type Props = {
  doc: SeatMapDoc;
  kitchens: Kitchen[];
  routes: Record<string, string>;
  selected: ReadonlySet<string>;
  onSelect: (next: Set<string>) => void;
  /** Sends these sections to a kitchen. */
  onRoute: (sections: string[], kitchen: string) => void;
  onMoveKitchen: (id: string, x: number, y: number) => void;
};

type Drag = { kind: "link"; from: string[]; x: number; y: number; moved: boolean } | { kind: "kitchen"; id: string; dx: number; dy: number };

/**
 * A flat drawing of the published seat map for routing. Click sections to select them, then drag
 * from a section onto a kitchen to connect. Kitchens drag to where they really are.
 */
export function RoutingMap({ doc, kitchens, routes, selected, onSelect, onRoute, onMoveKitchen }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const view = useMemo(() => {
    const b = mapBounds({ ...doc, pois: [] });
    const pad = Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.08;
    return { x: b.minX - pad, y: b.minY - pad, w: b.maxX - b.minX + pad * 2, h: b.maxY - b.minY + pad * 2 };
  }, [doc]);
  const unit = Math.max(view.w, view.h) / 100;
  const centers = useMemo(() => new Map(doc.sections.map((s) => [s.id, centroid(s.points)])), [doc]);
  const field = fieldOf(doc);
  const venues = doc.decorations.filter((d) => d.kind === "venue");

  const toWorld = (e: React.PointerEvent): [number, number] => {
    const m = svg.current?.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };

  function kitchenAt(x: number, y: number) {
    return kitchens.find((k) => Math.hypot(k.x - x, k.y - y) < unit * 3.2) ?? null;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const [x, y] = toWorld(e);
    if (drag.kind === "kitchen") onMoveKitchen(drag.id, x - drag.dx, y - drag.dy);
    else {
      setDrag({ ...drag, x, y, moved: true });
      setOver(kitchenAt(x, y)?.id ?? null);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (drag?.kind === "link") {
      const [x, y] = toWorld(e);
      const target = kitchenAt(x, y);
      if (target && drag.moved) onRoute(drag.from, target.id);
      else if (!drag.moved) {
        const id = drag.from[drag.from.length - 1];
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onSelect(next);
      }
    }
    setDrag(null);
    setOver(null);
  }

  const linkFrom = drag?.kind === "link" && drag.moved ? drag : null;

  return (
    <div className="relative overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
      <svg
        ref={svg}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className={cn("block aspect-[4/3] w-full touch-none select-none", drag?.kind === "kitchen" && "cursor-grabbing")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setDrag(null);
          setOver(null);
        }}
        onPointerDown={(e) => {
          if (e.target === svg.current) onSelect(new Set());
        }}
        role="application"
        aria-label="Section routing map"
      >
        {venues.map((v) => (
          <rect
            key={v.id}
            x={v.x - v.w / 2}
            y={v.y - v.h / 2}
            width={v.w}
            height={v.h}
            rx={Math.min(v.radius, v.w / 2, v.h / 2)}
            transform={`rotate(${v.rotation} ${v.x} ${v.y})`}
            fill="#ffffff"
            stroke="#e5e5e5"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ))}
        {field ? (
          <rect
            x={field.x - field.w / 2}
            y={field.y - field.h / 2}
            width={field.w}
            height={field.h}
            rx={unit * 0.6}
            transform={`rotate(${field.rotation} ${field.x} ${field.y})`}
            fill="#e6f4ea"
            stroke="#b7dfc2"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ) : null}

        {doc.sections.map((s) => {
          const color = kitchenColor(kitchens, routes[s.id]);
          const on = selected.has(s.id);
          return (
            <polygon
              key={s.id}
              points={s.points.map((p) => p.join(",")).join(" ")}
              fill={color ?? "#e5e5e5"}
              fillOpacity={on ? 0.55 : 0.28}
              stroke={on ? "#0a0a0a" : (color ?? "#a3a3a3")}
              strokeWidth={on ? 2 : 1}
              vectorEffect="non-scaling-stroke"
              className="cursor-pointer"
              onPointerDown={(e) => {
                e.stopPropagation();
                const [x, y] = toWorld(e);
                setDrag({ kind: "link", from: on ? [...[...selected].filter((id) => id !== s.id), s.id] : [s.id], x, y, moved: false });
              }}
            >
              <title>{`${s.name || s.code} · ${sectionSeatCount(s)} seats`}</title>
            </polygon>
          );
        })}

        {doc.sections.map((s) => {
          const k = kitchens.find((k) => k.id === routes[s.id]);
          const c = centers.get(s.id);
          if (!k || !c) return null;
          return (
            <line
              key={s.id}
              x1={c[0]}
              y1={c[1]}
              x2={k.x}
              y2={k.y}
              stroke={kitchenColor(kitchens, k.id) ?? "#a3a3a3"}
              strokeOpacity={selected.has(s.id) ? 0.9 : 0.35}
              strokeWidth={selected.has(s.id) ? 2 : 1.25}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          );
        })}

        {doc.sections.map((s) => {
          const c = centers.get(s.id);
          if (!c) return null;
          return (
            <text
              key={s.id}
              x={c[0]}
              y={c[1]}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={unit * 2}
              fontWeight={600}
              fill="#404040"
              pointerEvents="none"
            >
              {s.code}
            </text>
          );
        })}

        {linkFrom
          ? linkFrom.from.map((id) => {
              const c = centers.get(id);
              return c ? (
                <line
                  key={id}
                  x1={c[0]}
                  y1={c[1]}
                  x2={linkFrom.x}
                  y2={linkFrom.y}
                  stroke="#0a0a0a"
                  strokeOpacity={0.6}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                />
              ) : null;
            })
          : null}

        {kitchens.map((k, i) => {
          const color = kitchenColor(kitchens, k.id) ?? "#a3a3a3";
          const r = unit * 2.4;
          return (
            <g
              key={k.id}
              transform={`translate(${k.x} ${k.y})`}
              className={drag?.kind === "kitchen" ? "cursor-grabbing" : "cursor-grab"}
              onPointerDown={(e) => {
                e.stopPropagation();
                const [x, y] = toWorld(e);
                setDrag({ kind: "kitchen", id: k.id, dx: x - k.x, dy: y - k.y });
              }}
            >
              <title>{`${k.name}${k.open ? "" : " · paused"}`}</title>
              {over === k.id ? <circle r={r * 1.55} fill={color} fillOpacity={0.2} /> : null}
              <circle r={r} fill={k.open ? color : "#ffffff"} stroke={k.open ? "#ffffff" : color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
              <text textAnchor="middle" dominantBaseline="central" fontSize={unit * 2} fontWeight={700} fill={k.open ? "#ffffff" : color} pointerEvents="none">
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
      {!doc.sections.length ? (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-neutral-500">
          Publish a seat map with sections to route orders.
        </p>
      ) : null}
    </div>
  );
}
