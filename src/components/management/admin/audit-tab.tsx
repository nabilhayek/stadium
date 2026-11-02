"use client";

import { useMemo, useState, type ComponentType } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Ban, Check, CircleDollarSign, Map as MapIcon, RotateCcw, ShieldOff, Tag, Undo2, X } from "lucide-react";
import { useTRPC } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { Card } from "../ui";

type Kind = { label: string; verb: string; icon: ComponentType<{ className?: string }>; tone: string };

/** One entry per audit action: the chip label, the sentence, and the colour of its icon. */
const KINDS: Record<string, Kind> = {
  "order.accepted": { label: "Accepted", verb: "Accepted order", icon: Check, tone: "bg-green-100 text-green-700" },
  "order.declined": { label: "Declined", verb: "Declined order", icon: X, tone: "bg-red-100 text-red-700" },
  "order.refunded": { label: "Refunded", verb: "Refunded order", icon: Undo2, tone: "bg-amber-100 text-amber-700" },
  "order.auto_refunded": { label: "Auto-refunded", verb: "Auto-refunded order", icon: RotateCcw, tone: "bg-amber-100 text-amber-700" },
  "product.price": { label: "Price changed", verb: "Changed a price", icon: Tag, tone: "bg-blue-100 text-blue-700" },
  "seatmap.published": { label: "Seat map", verb: "Published the seat map", icon: MapIcon, tone: "bg-violet-100 text-violet-700" },
  "staff.two_factor_reset": { label: "2FA reset", verb: "Reset two-factor", icon: ShieldOff, tone: "bg-neutral-200 text-neutral-700" },
};
const FALLBACK: Kind = { label: "Other", verb: "", icon: CircleDollarSign, tone: "bg-neutral-100 text-neutral-600" };

function kindOf(action: string): Kind {
  return KINDS[action] ?? { ...FALLBACK, label: action, verb: action };
}

function ymd(date: Date, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

function money(cents: unknown, currency: string): string {
  if (typeof cents !== "number") return "?";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function field(detail: unknown, key: string): unknown {
  return detail && typeof detail === "object" ? (detail as Record<string, unknown>)[key] : undefined;
}

/** The secondary line under the title: what changed, or why. */
function Detail({ action, detail, currency }: { action: string; detail: unknown; currency: string }) {
  if (action === "product.price") {
    return (
      <p className="mt-0.5 text-[13px] text-neutral-600">
        <span className="font-medium text-neutral-800">{String(field(detail, "name") ?? "Product")}</span>{" "}
        <span className="tabular-nums line-through decoration-neutral-400">{money(field(detail, "fromCents"), currency)}</span>
        {" → "}
        <span className="font-medium tabular-nums text-neutral-900">{money(field(detail, "toCents"), currency)}</span>
      </p>
    );
  }
  const reason = field(detail, "reason");
  if ((action === "order.declined" || action === "order.refunded" || action === "order.auto_refunded") && typeof reason === "string" && reason) {
    return <p className="mt-0.5 text-[13px] text-neutral-600">“{reason}”</p>;
  }
  const prep = field(detail, "prepMinutes");
  if (action === "order.accepted" && typeof prep === "number") return <p className="mt-0.5 text-[13px] text-neutral-600">Prep time {prep} min</p>;
  const revision = field(detail, "revision");
  if (action === "seatmap.published" && revision !== undefined) return <p className="mt-0.5 text-[13px] text-neutral-600">Revision {String(revision)}</p>;
  const email = field(detail, "email");
  if (action === "staff.two_factor_reset" && typeof email === "string") return <p className="mt-0.5 text-[13px] text-neutral-600">For {email}</p>;
  return null;
}

function Skeleton() {
  return (
    <ul aria-hidden className="flex flex-col gap-3">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-3">
          <span className="size-9 animate-pulse rounded-full bg-neutral-100" />
          <span className="flex flex-1 flex-col gap-1.5">
            <span className="h-3.5 w-1/2 animate-pulse rounded bg-neutral-100" />
            <span className="h-3 w-1/3 animate-pulse rounded bg-neutral-100" />
          </span>
        </li>
      ))}
    </ul>
  );
}

const chip = (active: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-blue-500",
    active ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50",
  );

export function AuditTab({ stadiumSlug }: { stadiumSlug: string }) {
  const trpc = useTRPC();
  const [day, setDay] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [action, setAction] = useState("");
  const query = useQuery({
    ...trpc.admin.audit.queryOptions({ stadium: stadiumSlug, day: day || undefined, actorEmail: actorEmail || undefined, action: action || undefined }),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const timeZone = data?.timezone;
  const [now] = useState(() => Date.now());
  const today = ymd(new Date(now), timeZone);
  const yesterday = ymd(new Date(now - 86_400_000), timeZone);

  const groups = useMemo(() => {
    const out: { day: string; rows: NonNullable<typeof data>["rows"] }[] = [];
    for (const row of data?.rows ?? []) {
      const key = ymd(new Date(row.createdAt), timeZone);
      const last = out[out.length - 1];
      if (last?.day === key) last.rows.push(row);
      else out.push({ day: key, rows: [row] });
    }
    return out;
  }, [data, timeZone]);

  const total = Object.values(data?.counts ?? {}).reduce((a, b) => a + b, 0);
  const chips = Object.entries(data?.counts ?? {}).sort((a, b) => b[1] - a[1]);
  const filtered = Boolean(day || actorEmail || action);

  function heading(key: string): string {
    if (key === today) return "Today";
    if (key === yesterday) return "Yesterday";
    return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", timeZone }).format(new Date(`${key}T12:00:00Z`));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by date">
        <button type="button" className={chip(day === "")} aria-pressed={day === ""} onClick={() => setDay("")}>
          All time
        </button>
        <button type="button" className={chip(day === today)} aria-pressed={day === today} onClick={() => setDay(today)}>
          Today
        </button>
        <button type="button" className={chip(day === yesterday)} aria-pressed={day === yesterday} onClick={() => setDay(yesterday)}>
          Yesterday
        </button>
        <input
          type="date"
          aria-label="Pick a day"
          value={day}
          max={today}
          onChange={(event) => setDay(event.target.value)}
          className="h-8 rounded-full border border-neutral-200 bg-white px-3 text-[13px]"
        />
        <select
          aria-label="Filter by person"
          value={actorEmail}
          onChange={(event) => setActorEmail(event.target.value)}
          className="ml-auto h-8 max-w-56 rounded-full border border-neutral-200 bg-white px-3 text-[13px]"
        >
          <option value="">Everyone</option>
          {(data?.actors ?? []).map((email) => (
            <option key={email} value={email}>
              {email}
            </option>
          ))}
        </select>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
          <button type="button" className={chip(action === "")} aria-pressed={action === ""} onClick={() => setAction("")}>
            All
            <span className="tabular-nums opacity-70">{total}</span>
          </button>
          {chips.map(([key, count]) => {
            const kind = kindOf(key);
            const Icon = kind.icon;
            return (
              <button
                key={key}
                type="button"
                className={chip(action === key)}
                aria-pressed={action === key}
                onClick={() => setAction(action === key ? "" : key)}
              >
                <Icon className="size-3.5" />
                {kind.label}
                <span className="tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <Card title="Activity" description="Who accepted, declined, refunded, changed a price, or published the seat map.">
        <div className="flex flex-col gap-4 px-4 py-4">
          {query.isError ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-800">
              The activity log didn’t load.
              <button type="button" className="font-medium underline" onClick={() => query.refetch()}>
                Try again
              </button>
            </div>
          ) : null}

          {query.isPending ? <Skeleton /> : null}

          {data && data.rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-200 py-10 text-center">
              <Ban className="size-5 text-neutral-400" aria-hidden />
              <p className="text-[14px] font-medium">{filtered ? "Nothing matches these filters" : "No activity yet"}</p>
              <p className="max-w-xs text-[13px] text-neutral-500">
                {filtered ? "Try a different day, person, or type." : "Accepting orders, refunds, price changes and map publishes will show up here."}
              </p>
              {filtered ? (
                <button
                  type="button"
                  className="mt-1 text-[13px] font-medium text-blue-700"
                  onClick={() => {
                    setDay("");
                    setActorEmail("");
                    setAction("");
                  }}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : null}

          <div className={cn("flex flex-col gap-6 transition-opacity", query.isPlaceholderData && "opacity-60")}>
            {groups.map((group) => (
              <section key={group.day} aria-label={heading(group.day)}>
                <h3 className="mb-2 text-[12px] font-semibold tracking-wide text-neutral-500 uppercase">{heading(group.day)}</h3>
                <ul className="relative flex flex-col">
                  <span aria-hidden className="absolute top-4 bottom-4 left-[17px] w-px bg-neutral-200" />
                  {group.rows.map((row) => {
                    const kind = kindOf(row.action);
                    const Icon = kind.icon;
                    const time = new Date(row.createdAt);
                    return (
                      <li key={row.id} className="relative flex items-start gap-3 py-2">
                        <span className={cn("relative z-10 grid size-9 shrink-0 place-items-center rounded-full ring-4 ring-white", kind.tone)}>
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] leading-snug">
                            <span className="font-medium">{kind.verb}</span>
                            {row.orderNumber ? (
                              <span className="ml-1.5 rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[12px]">{row.orderNumber}</span>
                            ) : null}
                          </p>
                          <Detail action={row.action} detail={row.detail} currency={data?.currency ?? "SEK"} />
                          <p className="mt-0.5 truncate text-[12px] text-neutral-500">by {row.actorEmail ?? "System"}</p>
                        </div>
                        <time
                          dateTime={row.createdAt}
                          title={time.toLocaleString(undefined, { timeZone })}
                          className="shrink-0 pt-0.5 text-[13px] text-neutral-500 tabular-nums"
                        >
                          {time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone })}
                        </time>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {data && data.rows.length >= 200 ? (
              <p className="text-center text-[12px] text-neutral-500">Showing the newest 200. Narrow the filters to see older ones.</p>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
