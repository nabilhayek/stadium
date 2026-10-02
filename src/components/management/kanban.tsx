"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNow } from "@/lib/hooks/use-now";
import { updateKitchenOrder } from "@/lib/management/actions";
import { BOARD_COLUMNS, type BoardStatus, type DeskOrder, type KitchenChange } from "@/lib/management/board";
import { DeclineDialog } from "./decline-dialog";
import { OrderCard } from "./order-card";

type Props = { stadiumSlug: string; orders: DeskOrder[] };

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
type Override = BoardStatus | null;

export function Kanban({ stadiumSlug, orders }: Props) {
  const router = useRouter();
  const now = useNow(1000);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const inflight = useRef(0);
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
      return [override ? { ...o, status: override } : o];
    });
  }, [orders, overrides]);

  const byColumn = useMemo(() => {
    const map: Record<BoardStatus, DeskOrder[]> = { new: [], accepted: [], ready: [] };
    for (const o of visible) map[o.status].push(o);
    return map;
  }, [visible]);

  useNewOrderChime(byColumn.new.length);

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
      setError(null);
      const next: Override = change.to === "done" || change.to === "declined" ? null : change.to;
      setOverrides((prev) => ({ ...prev, [order.orderNumber]: next }));
      inflight.current += 1;
      void updateKitchenOrder(stadiumSlug, order.orderNumber, change)
        .then((result) => {
          if (!result.ok) {
            setError(result.error);
            setOverrides((prev) => {
              const copy = { ...prev };
              delete copy[order.orderNumber];
              return copy;
            });
          }
        })
        .finally(() => {
          inflight.current -= 1;
        });
    },
    [stadiumSlug],
  );

  /** Dropping onto a column is the same as pressing that column's button, minus the prep picker. */
  function dropChange(to: BoardStatus): KitchenChange {
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
        if (to && to !== order.status) apply(order, dropChange(to));
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
      {error ? (
        <p role="alert" className="mb-3 rounded-2xl bg-danger/10 px-4 py-2.5 text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        {BOARD_COLUMNS.map((column) => {
          const cards = byColumn[column.id];
          const over = drag?.over === column.id && drag.from !== column.id;
          return (
            <section
              key={column.id}
              ref={(el) => {
                columnRefs.current[column.id] = el;
              }}
              aria-label={column.label}
              className={[
                "flex min-h-[60dvh] flex-col gap-2 rounded-[24px] p-2 transition-colors",
                over ? "bg-foreground/8 ring-2 ring-foreground/40" : "bg-surface-secondary/70",
              ].join(" ")}
            >
              <header className="flex items-center gap-2 px-2 pt-1.5 pb-1">
                <h2 className="text-[15px] font-semibold">{column.label}</h2>
                <span className="rounded-full bg-surface px-2 py-0.5 text-[12px] font-semibold tabular-nums">{cards.length}</span>
              </header>

              {cards.length === 0 ? (
                <p className="px-2 py-6 text-center text-[13px] text-muted">
                  {column.id === "new" ? "No new orders." : column.id === "accepted" ? "Nothing cooking." : "Nothing waiting."}
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
          <OrderCard order={dragging} now={now} ghost onChange={() => undefined} onDecline={() => undefined} />
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
