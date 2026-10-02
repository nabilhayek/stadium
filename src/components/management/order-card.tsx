"use client";

import { useEffect, useRef, useState } from "react";
import { Bike, CalendarClock, MoreHorizontal, ShoppingBag, X } from "lucide-react";
import { formatCents } from "@/lib/money";
import { formatClock, formatRemain } from "@/lib/orders/receipt";
import {
  ACCEPT_WINDOW_MS,
  DEFAULT_PREP_MINUTES,
  PREP_MINUTES,
  type DeskOrder,
  type KitchenChange,
} from "@/lib/management/board";

type Props = {
  order: DeskOrder;
  now: number;
  /** Ghost cards follow the pointer and take no input. */
  ghost?: boolean;
  onChange: (change: KitchenChange) => void;
  onDecline: () => void;
};

export function OrderCard({ order, now, ghost = false, onChange, onDecline }: Props) {
  const [prep, setPrep] = useState<number>(DEFAULT_PREP_MINUTES);
  const [menu, setMenu] = useState(false);
  const items = order.lines.reduce((n, l) => n + l.qty, 0);
  const delivery = order.fulfillment === "delivery";

  return (
    <article
      aria-label={`Order ${order.orderNumber}`}
      className={[
        "relative select-none rounded-[20px] border border-border bg-surface p-3.5 shadow-[var(--surface-shadow)]",
        ghost ? "shadow-[0_18px_40px_-16px_rgba(17,17,17,0.45)]" : "",
      ].join(" ")}
      style={{ WebkitTouchCallout: "none" }}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-[19px] font-semibold leading-none tracking-tight">#{order.orderNumber}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip>
              {delivery ? (
                <Bike className="size-3.5" strokeWidth={2} aria-hidden />
              ) : (
                <ShoppingBag className="size-3.5" strokeWidth={2} aria-hidden />
              )}
              {delivery ? "Delivery" : "Pickup"}
            </Chip>
            {order.scheduledAt ? (
              <Chip tone="violet">
                <CalendarClock className="size-3.5" strokeWidth={2} aria-hidden />
                Scheduled {formatClock(order.scheduledAt)}
              </Chip>
            ) : null}
            <Chip>{formatClock(order.paidAt)}</Chip>
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-1.5">
          <Timer order={order} now={now} />
          {!ghost ? (
            <div className="relative" data-no-drag>
              <button
                type="button"
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={menu}
                onClick={() => setMenu((v) => !v)}
                className="grid size-8 place-items-center rounded-full bg-surface-secondary text-foreground"
              >
                <MoreHorizontal className="size-4" strokeWidth={2} aria-hidden />
              </button>
              {menu ? (
                <Menu onClose={() => setMenu(false)}>
                  {order.status !== "new" ? (
                    <MenuItem
                      onSelect={() => {
                        setMenu(false);
                        onChange({ to: order.status === "ready" ? "accepted" : "new" });
                      }}
                    >
                      {order.status === "ready" ? "Back to in progress" : "Back to new"}
                    </MenuItem>
                  ) : null}
                  <MenuItem
                    tone="danger"
                    onSelect={() => {
                      setMenu(false);
                      onDecline();
                    }}
                  >
                    Decline order
                  </MenuItem>
                </Menu>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      {delivery ? (
        <p className="mt-2.5 text-[13px] text-muted">
          {order.seat ?? "Seat delivery"}
          {order.runnerNote ? <span className="block text-foreground">“{order.runnerNote}”</span> : null}
        </p>
      ) : null}

      <ul className="rule mt-3 border-y border-separator">
        {order.lines.map((line, i) => (
          <li key={i} className="flex gap-2 py-2 text-[14px]">
            <span className="inline-block min-w-6 shrink-0 rounded-md bg-surface-secondary px-1 text-center text-[12px] font-semibold leading-5 tabular-nums">
              {line.qty}×
            </span>
            <span className="min-w-0">
              <span className="block font-medium leading-5">{line.name}</span>
              {line.note ? <span className="block text-[12px] text-muted">{line.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-2.5 flex items-center justify-between text-[12px] text-muted">
        <span className="tabular-nums">
          {formatCents(order.totalCents, order.currency)} · {items} item{items === 1 ? "" : "s"}
        </span>
        <span className="tabular-nums">
          Code <span className="font-semibold text-foreground">{order.confirmCode}</span>
        </span>
      </div>

      {!ghost ? (
        <div className="mt-3" data-no-drag>
          {order.status === "new" ? (
            <>
              <div role="radiogroup" aria-label="Preparation time" className="grid grid-cols-3 gap-1.5">
                {PREP_MINUTES.map((minutes) => {
                  const on = prep === minutes;
                  return (
                    <button
                      key={minutes}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setPrep(minutes)}
                      className={[
                        "rounded-xl py-2 text-center leading-none",
                        on ? "bg-foreground text-background" : "bg-surface-secondary text-foreground",
                      ].join(" ")}
                    >
                      <span className="block text-[17px] font-semibold tabular-nums">{minutes}</span>
                      <span className={["mt-0.5 block text-[10px] uppercase tracking-wide", on ? "text-background/70" : "text-muted"].join(" ")}>
                        min
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  aria-label="Decline order"
                  onClick={onDecline}
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-danger/10 text-danger"
                >
                  <X className="size-4" strokeWidth={2.4} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ to: "accepted", prepMinutes: prep })}
                  className="button button--primary button--md flex-1"
                >
                  Accept
                </button>
              </div>
            </>
          ) : order.status === "accepted" ? (
            <button type="button" onClick={() => onChange({ to: "ready" })} className="button button--primary button--md w-full">
              Ready
            </button>
          ) : (
            <button type="button" onClick={() => onChange({ to: "done" })} className="button button--primary button--md w-full">
              {delivery ? "Handed to runner" : "Picked up"}
            </button>
          )}
        </div>
      ) : null}
    </article>
  );
}

/** "m:ss" for the first hour, then "2h 05m" — a stale order should read as stale, not as a stopwatch. */
function formatWait(ms: number) {
  if (ms < 3_600_000) return formatRemain(ms);
  const minutes = Math.floor(ms / 60_000);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** Column-specific clock: how long a new order has waited, or how long until it's due. */
function Timer({ order, now }: { order: DeskOrder; now: number }) {
  if (!now) return null;
  if (order.status === "new") {
    const waited = now - order.paidAt;
    const late = waited > ACCEPT_WINDOW_MS;
    return (
      <span
        className={[
          "rounded-full px-2.5 py-1.5 text-[12px] font-semibold tabular-nums leading-none",
          late ? "bg-danger/10 text-danger" : "bg-surface-secondary text-foreground",
        ].join(" ")}
        aria-label={`Waiting ${formatWait(waited)}`}
      >
        {formatWait(waited)}
      </span>
    );
  }
  if (order.status === "accepted") {
    const total = Math.max(60_000, order.readyAt - order.paidAt);
    const left = order.readyAt - now;
    const progress = Math.min(1, Math.max(0, 1 - left / total));
    const minutes = Math.ceil(left / 60_000);
    return (
      <span className="flex items-center gap-1.5" aria-label={left > 0 ? `${minutes} minutes left` : "Due now"}>
        <span className="text-[12px] tabular-nums text-muted">{formatClock(order.readyAt)}</span>
        <Ring progress={progress} late={left <= 0}>
          <span className={["text-[13px] font-semibold tabular-nums leading-none", left <= 0 ? "text-danger" : ""].join(" ")}>
            {left > 0 ? minutes : "!"}
          </span>
        </Ring>
      </span>
    );
  }
  return <span className="rounded-full bg-[#22c55e]/15 px-2.5 py-1.5 text-[12px] font-semibold leading-none text-[#15803d]">Ready</span>;
}

function Ring({ progress, late, children }: { progress: number; late: boolean; children: React.ReactNode }) {
  const size = 36;
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-tertiary)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={late ? "var(--color-danger, #dc2626)" : "#22c55e"}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center">{children}</span>
    </span>
  );
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "violet" }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium leading-none",
        tone === "violet" ? "bg-[#6a4cf5]/12 text-[#4b34c4]" : "bg-surface-secondary text-foreground",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function Menu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function away(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      role="menu"
      className="absolute right-0 top-full z-20 mt-1.5 min-w-44 overflow-hidden rounded-2xl border border-border bg-overlay p-1 shadow-[var(--overlay-shadow)]"
    >
      {children}
    </div>
  );
}

function MenuItem({
  children,
  tone = "neutral",
  onSelect,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "danger";
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={[
        "block w-full rounded-xl px-3 py-2.5 text-left text-[14px] font-medium hover:bg-surface-secondary",
        tone === "danger" ? "text-danger" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
