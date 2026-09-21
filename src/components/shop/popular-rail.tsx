"use client";

import { useRef, useState } from "react";
import { m } from "framer-motion";
import type { MenuProduct } from "@/lib/queries/stadium";
import { SPRING, stagger } from "@/components/motion/variants";
import { ProductCard } from "./product-card";

type Item = MenuProduct & { vendorId: string; vendorName: string };

type Props = {
  stadiumSlug: string;
  currency: string;
  items: Item[];
  lastIds: Set<string>;
  animateIn: boolean;
};

const CARD = 168;
const FADE = 28;

/**
 * Dots = items − 1. The last card snap-ends against the rail, so it never
 * becomes its own left-aligned page — lighting a last extra dot would never
 * match what the user sees.
 */
export function PopularRail({ stadiumSlug, currency, items, lastIds, animateIn }: Props) {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const drag = useRef<{ id: number; x: number; scroll: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [edges, setEdges] = useState({ left: false, right: items.length > 1 });
  const last = items.length - 1;
  const pages = Math.max(1, items.length - 1);
  const dotIndex = index >= last ? pages - 1 : index;

  function stride(el: HTMLElement) {
    const a = el.children[0] as HTMLElement | undefined;
    const b = el.children[1] as HTMLElement | undefined;
    return a && b ? b.offsetLeft - a.offsetLeft : CARD;
  }

  function maxScroll(el: HTMLElement) {
    return Math.max(0, el.scrollWidth - el.clientWidth);
  }

  function leftFor(el: HTMLElement, i: number) {
    if (i >= last) return maxScroll(el);
    return i * stride(el);
  }

  function nearest(el: HTMLElement) {
    if (last <= 0) return 0;
    const left = el.scrollLeft;
    const prev = leftFor(el, last - 1);
    const end = maxScroll(el);
    if (left >= (prev + end) / 2) return last;
    return Math.max(0, Math.min(last - 1, Math.round(left / stride(el))));
  }

  function sync(el: HTMLElement) {
    setIndex(nearest(el));
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft < maxScroll(el) - 2;
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }

  function snapTo(i: number) {
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(last, i));
    el.scrollTo({ left: leftFor(el, clamped), behavior: "smooth" });
    setIndex(clamped);
  }

  function onPointerDown(e: React.PointerEvent<HTMLUListElement>) {
    if (e.pointerType === "touch" || e.button !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    drag.current = { id: e.pointerId, x: e.clientX, scroll: el.scrollLeft, moved: false };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointers */
    }
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLUListElement>) {
    const d = drag.current;
    const el = scrollerRef.current;
    if (!d || !el || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 4) return;
    d.moved = true;
    suppressClick.current = true;
    el.scrollLeft = Math.max(0, Math.min(maxScroll(el), d.scroll - dx));
    sync(el);
  }

  function endDrag(e: React.PointerEvent<HTMLUListElement>) {
    const d = drag.current;
    const el = scrollerRef.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    setDragging(false);
    if (el && d.moved) snapTo(nearest(el));
  }

  function onClickCapture(e: React.MouseEvent) {
    if (!suppressClick.current) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClick.current = false;
  }

  const mask =
    edges.left || edges.right
      ? `linear-gradient(to right, ${edges.left ? "transparent" : "#000"} 0, #000 ${FADE}px, #000 calc(100% - ${FADE}px), ${edges.right ? "transparent" : "#000"} 100%)`
      : undefined;

  return (
    <div>
      <m.ul
        ref={scrollerRef}
        variants={stagger(0.06, 0.35)}
        initial={animateIn ? "hidden" : false}
        animate="show"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onDragStart={(e) => e.preventDefault()}
        onScroll={() => {
          const el = scrollerRef.current;
          if (el && !drag.current) sync(el);
        }}
        className={[
          "-mx-4 mt-3 flex gap-2 overflow-x-auto scroll-px-4 px-4 pb-2 scrollbar-none",
          dragging ? "cursor-grabbing snap-none select-none" : "cursor-grab snap-x snap-mandatory",
        ].join(" ")}
        style={{ touchAction: "pan-x", WebkitMaskImage: mask, maskImage: mask }}
      >
        {items.map((p, i) => (
          <ProductCard
            key={p.id}
            stadiumSlug={stadiumSlug}
            currency={currency}
            vendorId={p.vendorId}
            vendorName={p.vendorName}
            product={p}
            badge={lastIds.has(p.id) ? "Last time" : undefined}
            className={`w-[168px] shrink-0 ${i === last ? "snap-end" : "snap-start"}`}
            compact
          />
        ))}
      </m.ul>

      {pages > 1 ? (
        <div
          role="tablist"
          aria-label="Popular items"
          className="mt-1 flex items-center justify-center gap-1.5"
        >
          {items.slice(0, -1).map((p, i) => {
            const active = i === dotIndex;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={p.name}
                onClick={() => snapTo(i === pages - 1 ? last : i)}
                className="grid h-5 w-4 place-items-center"
              >
                <m.span
                  aria-hidden
                  animate={{ width: active ? 14 : 6, backgroundColor: active ? "#111111" : "#c8c8c2" }}
                  transition={SPRING}
                  className="block h-1.5 rounded-full"
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
