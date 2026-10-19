"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bike, CalendarClock, Check, MessageSquare, MoreHorizontal, ShoppingBag } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { formatCents } from "@/lib/money";
import { formatRemain } from "@/lib/orders/receipt";
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
  /** Prep chosen on this card. A drag uses the same value as Accept. */
  prep: number;
  onPrep: (minutes: number) => void;
  /** Ghost cards follow the pointer and take no input. */
  ghost?: boolean;
  onChange: (change: KitchenChange) => void;
  onDecline: () => void;
};

export function OrderCard({ order, now, prep, onPrep, ghost = false, onChange, onDecline }: Props) {
  const [menu, setMenu] = useState(false);
  const items = order.lines.reduce((n, l) => n + l.qty, 0);
  const delivery = order.fulfillment === "delivery";
  const slot = order.scheduledAt;
  const scheduled = slot != null;
  const asapLate = !scheduled && order.status === "new" && now > 0 && now - order.paidAt > ACCEPT_WINDOW_MS;
  const slotLeft = slot != null && now > 0 ? slot - now : null;
  const dueSoon = scheduled && order.status === "new" && slotLeft != null && slotLeft <= DEFAULT_PREP_MINUTES * 60_000;
  const slotOverdue = scheduled && order.status !== "ready" && slotLeft != null && slotLeft <= 0;
  const prepOverdue = !scheduled && order.status === "accepted" && now > 0 && now >= order.readyAt;
  const warned = asapLate || dueSoon || slotOverdue || prepOverdue;
  const actionFill =
    order.status === "new" && (asapLate || dueSoon) ? "bg-orange-500!" : order.status === "ready" ? "bg-green-500!" : "bg-blue-500!";

  return (
    <article
      aria-label={`Order ${order.orderNumber}`}
      className={[
        "relative select-none rounded-[20px] border-2 bg-surface shadow-surface",
        warned ? "border-orange-500" : "border-neutral-300",
        ghost ? "shadow-2xl" : "",
      ].join(" ")}
      style={{ WebkitTouchCallout: "none" }}
    >
      <div className="p-3.5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-[19px] font-semibold leading-none tracking-tight">#{order.orderNumber}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Chip className={delivery ? "bg-blue-600 text-white" : "bg-emerald-600 text-white"}>
                {delivery ? (
                  <Bike className="size-3.5" strokeWidth={2.2} aria-hidden />
                ) : (
                  <ShoppingBag className="size-3.5" strokeWidth={2.2} aria-hidden />
                )}
                {delivery ? "Delivery" : "Pick-up"}
              </Chip>
              {scheduled && order.scheduledAt ? (
                <Chip className="bg-violet-600 text-white">
                  <CalendarClock className="size-3.5" strokeWidth={2.2} aria-hidden />
                  Scheduled
                </Chip>
              ) : null}
            </div>
          </div>
          <Timer order={order} now={now} late={asapLate} />
        </header>

        {order.runnerNote ? (
          <div className="mt-3 flex gap-2 rounded-2xl bg-neutral-100 px-3 py-2.5 text-[13px] leading-snug text-neutral-600">
            <MessageSquare className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} aria-hidden />
            <p>{order.runnerNote}</p>
          </div>
        ) : null}

        {asapLate ? (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-orange-100 px-3 py-2.5 text-[13px] font-medium text-orange-600">
            <AlertTriangle className="size-4 shrink-0" strokeWidth={2.2} aria-hidden />
            Waiting for {formatWait(now - order.paidAt)}
          </div>
        ) : null}
        {scheduled && (dueSoon || slotOverdue) && slotLeft != null ? (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-orange-100 px-3 py-2.5 text-[13px] font-medium text-orange-600">
            <AlertTriangle className="size-4 shrink-0" strokeWidth={2.2} aria-hidden />
            {dueText(slotLeft)}
          </div>
        ) : null}

        <Accordion type="single" collapsible className="mt-3 border-t border-separator" data-no-drag>
          <AccordionItem value="items" className="border-b-0">
            <AccordionTrigger className="text-neutral-900 hover:no-underline">
              <span className="tabular-nums">
                {formatCents(order.totalCents, order.currency)}
                <span className="font-normal text-neutral-500">
                  {" "}
                  · {items} item{items === 1 ? "" : "s"}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-1">
              <ul>
                {order.lines.map((line, i) => (
                  <li key={i} className="flex gap-2.5 border-t border-separator py-2.5 first:border-t-0">
                    <span
                      className={[
                        "inline-flex h-6 min-w-8 shrink-0 items-center justify-center rounded-lg px-1.5 text-[12px] font-semibold tabular-nums",
                        line.qty > 1 ? "bg-orange-100 text-orange-600" : "bg-neutral-100 text-neutral-900",
                      ].join(" ")}
                    >
                      {line.qty}×
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium leading-5">{line.name}</span>
                      {line.options?.length ? (
                        <span className="mt-0.5 block text-[12px] leading-4 text-neutral-700">{line.options.join(" · ")}</span>
                      ) : null}
                      {line.note ? <span className="mt-0.5 block text-[12px] leading-4 text-neutral-500">{line.note}</span> : null}
                    </span>
                    {line.unitCents != null ? (
                      <span className="shrink-0 text-[13px] tabular-nums text-neutral-600">
                        {formatCents(line.unitCents * line.qty, order.currency)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {!ghost ? (
          <div className="relative mt-3 flex items-center gap-2" data-no-drag>
            <button
              type="button"
              onClick={() =>
                order.status === "new"
                  ? onChange(scheduled ? { to: "accepted" } : { to: "accepted", prepMinutes: prep })
                  : order.status === "accepted"
                    ? onChange({ to: "ready" })
                    : onChange({ to: "done" })
              }
              className={["flex-1 rounded-xl p-3 text-[17px] font-semibold text-white!", actionFill].join(" ")}
            >
              {order.status === "new" ? "Accept" : order.status === "accepted" ? "Ready" : "Picked up"}
            </button>
            <button
              type="button"
              aria-label="Order details"
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
              className="grid shrink-0 place-items-center rounded-xl bg-slate-100! p-3 text-neutral-900!"
            >
              <MoreHorizontal className="size-5" strokeWidth={2.2} aria-hidden />
            </button>
            {menu ? (
              <Menu onClose={() => setMenu(false)}>
                {order.status === "new" && !scheduled ? (
                  <div className="px-1 p-1">
                    <p className="px-1.5 pb-1.5 text-[12px] font-semibold text-neutral-500">Prep time</p>
                    <div role="radiogroup" aria-label="Preparation time" className="grid grid-cols-3 gap-1.5">
                      {PREP_MINUTES.map((minutes) => {
                        const selected = prep === minutes;
                        return (
                          <button
                            key={minutes}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => onPrep(minutes)}
                            className={[
                              "rounded-xl py-2.5 text-[14px] font-semibold tabular-nums",
                              selected ? "bg-blue-500! text-white!" : "bg-slate-100! text-neutral-900!",
                            ].join(" ")}
                          >
                            {minutes} min
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
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
    </article>
  );
}

/** "m:ss" for the first hour, then "2h 05m" — a stale order should read as stale, not as a stopwatch. */
function formatWait(ms: number) {
  if (ms < 3_600_000) return formatRemain(ms);
  const minutes = Math.floor(ms / 60_000);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

function dueText(leftMs: number) {
  if (leftMs <= 0) {
    const lateMin = Math.floor(-leftMs / 60_000);
    return lateMin < 1 ? "Due now" : `${lateMin} min late`;
  }
  const minutes = Math.max(1, Math.ceil(leftMs / 60_000));
  return `Due in ${minutes} min`;
}

/** Prep ring on the right. Scheduled tickets count down to the picked time. */
function Timer({ order, now, late }: { order: DeskOrder; now: number; late: boolean }) {
  if (!now) return null;
  if (order.status === "ready") {
    return (
      <StatusDisc className="bg-green-500" label="Ready">
        <Check className="size-6" strokeWidth={2.6} aria-hidden />
      </StatusDisc>
    );
  }
  if (order.scheduledAt != null && order.status === "new") {
    const left = order.scheduledAt - now;
    const overdue = left <= 0;
    const minutes = Math.max(0, Math.ceil(left / 60_000));
    const total = Math.max(60_000, order.scheduledAt - order.paidAt);
    return (
      <ClockRing
        minutes={overdue ? null : minutes}
        progress={Math.min(1, Math.max(0, left / total))}
        clock={ticketClock(order.scheduledAt)}
        label={overdue ? "Due now" : `${minutes} minutes until ${ticketClock(order.scheduledAt)}`}
      />
    );
  }
  if (order.status === "new") {
    const waited = now - order.paidAt;
    const left = ACCEPT_WINDOW_MS - waited;
    const minutes = Math.max(0, Math.ceil(left / 60_000));
    return (
      <ClockRing
        minutes={late ? null : minutes}
        progress={Math.min(1, Math.max(0, left / ACCEPT_WINDOW_MS))}
        clock={ticketClock(order.paidAt)}
        label={late ? `Waiting ${formatWait(waited)}` : `${minutes} minutes to accept`}
      />
    );
  }
  const due = order.scheduledAt ?? order.readyAt;
  const started = order.acceptedAt != null && order.acceptedAt < due ? order.acceptedAt : due - DEFAULT_PREP_MINUTES * 60_000;
  const total = Math.max(60_000, due - started);
  const left = due - now;
  const overdue = left <= 0;
  const windowMin = Math.max(1, Math.round(total / 60_000));
  const minutes = Math.min(windowMin, Math.max(0, Math.ceil(left / 60_000)));
  return (
    <ClockRing
      minutes={overdue ? null : minutes}
      progress={Math.min(1, Math.max(0, left / total))}
      clock={ticketClock(due)}
      label={overdue ? "Due now" : `${minutes} minutes left`}
    />
  );
}

function ClockRing({
  minutes,
  progress,
  clock,
  label,
}: {
  minutes: number | null;
  progress: number;
  clock: string;
  label: string;
}) {
  return (
    <span className="flex w-12 flex-col items-center" aria-label={label}>
      {minutes == null ? (
        <StatusDisc className="bg-orange-500">
          <AlertTriangle className="size-6" strokeWidth={2.4} aria-hidden />
        </StatusDisc>
      ) : (
        <Ring progress={progress}>
          <span
            className={[
              "font-semibold tabular-nums leading-none text-neutral-900",
              minutes >= 100 ? "text-[13px]" : "text-[15px]",
            ].join(" ")}
          >
            {minutes}
          </span>
        </Ring>
      )}
      <span className="mt-2 text-[12px] font-semibold tabular-nums leading-none text-neutral-400">{clock}</span>
    </span>
  );
}

function ticketClock(ms: number) {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function StatusDisc({ children, className, label }: { children: React.ReactNode; className: string; label?: string }) {
  return (
    <span className={["grid size-12 shrink-0 place-items-center rounded-full text-white", className].join(" ")} aria-label={label}>
      {children}
    </span>
  );
}

function Ring({ progress, children }: { progress: number; children: React.ReactNode }) {
  const size = 48;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid size-12 shrink-0 place-items-center">
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="stroke-green-100" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="stroke-green-400"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={-c * (1 - progress)}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center">{children}</span>
    </span>
  );
}

function Chip({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={["inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-semibold leading-none", className].join(" ")}>
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
      className="absolute right-0 top-full z-20 mt-1.5 min-w-60 overflow-hidden rounded-2xl border border-border bg-overlay p-1 shadow-overlay"
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
