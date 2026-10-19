"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useNow } from "@/lib/hooks/use-now";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import {
  BOARD_COLUMNS,
  DEFAULT_PREP_MINUTES,
  previewAccept,
  type BoardStatus,
  type DeskOrder,
  type KitchenChange,
} from "@/lib/management/board";
import { DeclineDialog } from "./decline-dialog";
import { OrderCard } from "./order-card";
import { useToast } from "@/components/toast/toast-provider";

type Props = { stadiumSlug: string; orders: DeskOrder[] };

const COLUMN_DOT: Record<BoardStatus, string> = {
  new: "bg-blue-500",
  accepted: "bg-amber-500",
  ready: "bg-green-500",
};

/** Ask the server for fresh cards this often while nobody is mid-gesture. */
const REFRESH_MS = 8_000;
/** Mouse: drag once the pointer travels this far. */
const MOUSE_SLOP_PX = 6;
/** Touch: hold this long without moving to pick a card up; moving earlier scrolls instead. */
const HOLD_MS = 220;
const HOLD_SLOP_PX = 10;

type Drag = {
  orderNumber: string;
  from: BoardStatus;
  /** Pointer position and where inside the card it grabbed. */
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  over: BoardStatus | null;
};

/** Where a card should appear before the server confirms. `null` means it left the board. */
type Override = { status: BoardStatus; readyAt?: number; acceptedAt?: number } | null;

export function Kanban({ stadiumSlug, orders }: Props) {
  const router = useRouter();
  const trpc = useTRPC();
  const { mutateAsync: updateOrder } = useMutation(trpc.kitchen.update.mutationOptions());
  const now = useNow(1000);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const { toast } = useToast();
  const [drag, setDrag] = useState<Drag | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const inflight = useRef(0);
  const [preps, setPreps] = useState<Record<string, number>>({});
  const prepsRef = useRef(preps);
  useEffect(() => {
    prepsRef.current = preps;
  }, [preps]);
  const columnRefs = useRef<Partial<Record<BoardStatus, HTMLElement | null>>>({});

  // Server truth arrived — drop the optimistic layer.
  const [seen, setSeen] = useState(orders);
  if (seen !== orders) {
    setSeen(orders);
    setOverrides({});
  }

  const visible = useMemo(() => {
    return orders.flatMap((o) => {
      const override = overrides[o.orderNumber];
      if (override === null) return [];
      if (!override) return [o];
      return [
        {
          ...o,
          status: override.status,
          ...(override.readyAt != null ? { readyAt: override.readyAt } : {}),
          ...(override.acceptedAt != null ? { acceptedAt: override.acceptedAt } : {}),
        },
      ];
    });
  }, [orders, overrides]);

  const byColumn = useMemo(() => {
    const map: Record<BoardStatus, DeskOrder[]> = { new: [], accepted: [], ready: [] };
    for (const o of visible) map[o.status].push(o);
    return map;
  }, [visible]);

  useNewOrderChime(byColumn.new.length);

  const query = (useSearchParams().get("q") ?? "").toLowerCase();
  const matches = (o: DeskOrder) =>
    !query ||
    [o.orderNumber, o.seat ?? "", ...o.lines.flatMap((l) => [l.name, ...(l.options ?? [])])].some((s) =>
      s.toLowerCase().includes(query),
    );

  // Keep the board live. Pause while a card is in hand or a dialog is open.
  const busy = drag !== null || declining !== null;
  useEffect(() => {
    if (busy) return;
    const id = window.setInterval(() => {
      if (inflight.current === 0 && document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [busy, router]);

  const apply = useCallback(
    (order: DeskOrder, change: KitchenChange) => {
      const nowMs = Date.now();
      const clock = change.to === "accepted" ? previewAccept(order, change.prepMinutes, nowMs) : null;
      const next: Override =
        change.to === "done" || change.to === "declined"
          ? null
          : {
              status: change.to,
              ...(clock ? { readyAt: clock.readyAt, acceptedAt: clock.acceptedAt } : {}),
            };
      setOverrides((prev) => ({ ...prev, [order.orderNumber]: next }));
      inflight.current += 1;
      const revert = (message: string) => {
        toast({ message, status: "error" });
        setOverrides((prev) => {
          const copy = { ...prev };
          delete copy[order.orderNumber];
          return copy;
        });
      };
      updateOrder({ stadium: stadiumSlug, orderNumber: order.orderNumber, change })
        .then((result) => {
          if (!result.ok) revert(result.error);
        })
        .catch((error: unknown) => {
          revert(error instanceof Error && error.message ? error.message : "The connection dropped. Try again.");
        })
        .finally(() => {
          inflight.current -= 1;
        });
    },
    [stadiumSlug, toast, updateOrder],
  );

  /** A new order dropped on In progress keeps the prep chosen on that card. */
  function dropChange(order: DeskOrder, to: BoardStatus): KitchenChange {
    if (to === "accepted" && order.status === "new" && order.scheduledAt == null) {
      return { to: "accepted", prepMinutes: prepsRef.current[order.orderNumber] ?? DEFAULT_PREP_MINUTES };
    }
    return to === "accepted" ? { to: "accepted" } : { to };
  }

  function arm(e: React.PointerEvent<HTMLDivElement>, order: DeskOrder) {
    if (e.button !== 0 || declining) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select, [data-no-drag]")) return;

    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const id = e.pointerId;
    const mouse = e.pointerType === "mouse";
    const startX = e.clientX;
    const startY = e.clientY;
    let last = { x: startX, y: startY };
    let active = false;
    let hold: number | null = null;

    const columnAt = (x: number, y: number): BoardStatus | null => {
      for (const column of BOARD_COLUMNS) {
        const el = columnRefs.current[column.id];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return column.id;
      }
      return null;
    };

    const begin = () => {
      if (active) return;
      active = true;
      hold = null;
      if (!mouse && "vibrate" in navigator) navigator.vibrate?.(10);
      setDrag({
        orderNumber: order.orderNumber,
        from: order.status,
        x: last.x,
        y: last.y,
        dx: startX - rect.left,
        dy: startY - rect.top,
        width: rect.width,
        over: columnAt(last.x, last.y),
      });
    };

    const cleanup = () => {
      if (hold !== null) window.clearTimeout(hold);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("touchmove", onTouchMove);
      setDrag(null);
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      last = { x: ev.clientX, y: ev.clientY };
      if (!active) {
        const travelled = Math.hypot(ev.clientX - startX, ev.clientY - startY);
        if (mouse && travelled > MOUSE_SLOP_PX) begin();
        else if (!mouse && travelled > HOLD_SLOP_PX) cleanup(); // finger is scrolling, not lifting
        return;
      }
      setDrag((d) => (d ? { ...d, x: ev.clientX, y: ev.clientY, over: columnAt(ev.clientX, ev.clientY) } : d));
    };

    // Once a touch drag is live the page must not pan underneath it.
    const onTouchMove = (ev: TouchEvent) => {
      if (active && ev.cancelable) ev.preventDefault();
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (active) {
        const to = columnAt(ev.clientX, ev.clientY);
        if (to && to !== order.status) apply(order, dropChange(order, to));
      }
      cleanup();
    };

    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId === id) cleanup();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    if (!mouse) hold = window.setTimeout(begin, HOLD_MS);
  }

  const dragging = drag ? visible.find((o) => o.orderNumber === drag.orderNumber) ?? null : null;
  const decliningOrder = declining ? visible.find((o) => o.orderNumber === declining) ?? null : null;

  return (
    <div className={drag ? "cursor-grabbing" : undefined}>
      <div className="grid gap-3 md:grid-cols-3">
        {BOARD_COLUMNS.map((column) => {
          const all = byColumn[column.id];
          const cards = query ? all.filter(matches) : all;
          const over = drag?.over === column.id && drag.from !== column.id;
          return (
            <section
              key={column.id}
              id={`column-${column.id}`}
              ref={(el) => {
                columnRefs.current[column.id] = el;
              }}
              aria-label={column.label}
              className={[
                "flex min-h-[60dvh] scroll-mt-20 flex-col gap-2 rounded-xl border p-2 transition-colors duration-150",
                over ? "border-blue-500 bg-blue-50" : "border-neutral-200 bg-neutral-50",
              ].join(" ")}
            >
              <header className="flex h-8 items-center gap-2 px-2">
                <span className={["size-2 rounded-full", COLUMN_DOT[column.id]].join(" ")} aria-hidden />
                <h2 className="text-[14px] font-medium text-neutral-900">{column.label}</h2>
                <span className="ml-auto text-[13px] tabular-nums text-neutral-500">
                  {query ? `${cards.length} of ${all.length}` : all.length}
                </span>
              </header>

              {cards.length === 0 ? (
                <p className="px-2 py-10 text-center text-[13px] text-neutral-500">
                  {query && all.length > 0
                    ? "No matches in this column."
                    : column.id === "new"
                      ? "No new orders."
                      : column.id === "accepted"
                        ? "Nothing cooking."
                        : "Nothing waiting."}
                </p>
              ) : null}

              {cards.map((order) => {
                const lifted = drag?.orderNumber === order.orderNumber;
                return (
                  <div
                    key={order.orderNumber}
                    onPointerDown={(e) => arm(e, order)}
                    className={["touch-pan-y", lifted ? "opacity-30" : "cursor-grab"].join(" ")}
                  >
                    <OrderCard
                      order={order}
                      now={now}
                      prep={preps[order.orderNumber] ?? DEFAULT_PREP_MINUTES}
                      onPrep={(minutes) => setPreps((prev) => ({ ...prev, [order.orderNumber]: minutes }))}
                      onChange={(change) => apply(order, change)}
                      onDecline={() => setDeclining(order.orderNumber)}
                    />
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      {drag && dragging ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-50 rotate-1 scale-[1.02]"
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.width }}
        >
          <OrderCard
            order={dragging}
            now={now}
            prep={preps[dragging.orderNumber] ?? DEFAULT_PREP_MINUTES}
            onPrep={() => undefined}
            ghost
            onChange={() => undefined}
            onDecline={() => undefined}
          />
        </div>
      ) : null}

      {decliningOrder ? (
        <DeclineDialog
          orderNumber={decliningOrder.orderNumber}
          onCancel={() => setDeclining(null)}
          onConfirm={(reason) => {
            setDeclining(null);
            apply(decliningOrder, { to: "declined", reason });
          }}
        />
      ) : null}
    </div>
  );
}

/** Two short tones when the New column grows. Silent until the page has been interacted with. */
function useNewOrderChime(newCount: number) {
  const previous = useRef<number | null>(null);
  useEffect(() => {
    if (previous.current !== null && newCount > previous.current) {
      void chime();
    }
    previous.current = newCount;
  }, [newCount]);
}

async function chime() {
  if (typeof window === "undefined" || !("AudioContext" in window)) return;
  try {
    const ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    const at = ctx.currentTime;
    for (const [i, freq] of [880, 1174].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, at + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + i * 0.18 + 0.17);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at + i * 0.18);
      osc.stop(at + i * 0.18 + 0.2);
    }
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    // No audio permission or device — the board still updates.
  }
}
