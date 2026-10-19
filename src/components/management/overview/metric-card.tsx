"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatCents } from "@/lib/money";
import type { Metric } from "@/lib/management/orders";
import { cn } from "@/lib/utils";

export type MetricFormat = "count" | "cents" | "seconds";

type Props = {
  title: string;
  label: string;
  href: string;
  metric: Metric;
  format: MetricFormat;
  currency: string;
  /** Lower is better for accept time and declines, so a drop reads as good news. */
  lowerIsBetter?: boolean;
  tone: "blue" | "emerald" | "violet" | "orange";
  bucketMs: number;
  now: number;
  startLabel: string;
};

const TONES = {
  blue: { line: "stroke-blue-500", fill: "text-blue-500", dot: "fill-blue-500" },
  emerald: { line: "stroke-emerald-500", fill: "text-emerald-500", dot: "fill-emerald-500" },
  violet: { line: "stroke-violet-500", fill: "text-violet-500", dot: "fill-violet-500" },
  orange: { line: "stroke-orange-500", fill: "text-orange-500", dot: "fill-orange-500" },
} as const;

const W = 600;
const H = 140;
const PAD_Y = 8;

export function MetricCard({ title, label, href, metric, format, currency, lowerIsBetter, tone, bucketMs, now, startLabel }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const gradient = useId();
  const colors = TONES[tone];
  const fmt = (v: number) => formatValue(v, format, currency);

  const values = metric.series;
  const n = values.length;
  const max = niceMax(Math.max(0, ...values.map((v) => v ?? 0)));
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => PAD_Y + (1 - v / max) * (H - PAD_Y * 2);
  const { line, area, points } = paths(values, x, y);
  const empty = values.every((v) => v == null || v === 0);
  const sparse = points.length < n;

  const active = hover != null ? values[hover] : null;
  const bucketStart = hover != null ? now - (n - hover) * bucketMs : null;

  return (
    <section className="flex flex-col rounded-xl border border-neutral-200 bg-white" aria-label={title}>
      <div className="px-4 pt-4">
        <Link
          href={href}
          className="group inline-flex items-center gap-0.5 rounded text-[14px] font-medium text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          {title}
          <ChevronRight className="size-4 text-neutral-400 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
        </Link>
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <p className="text-[13px] text-neutral-500">
            {hover != null && bucketStart != null ? bucketLabel(bucketStart, bucketMs) : label}
          </p>
          {hover == null ? <Delta metric={metric} lowerIsBetter={lowerIsBetter} /> : null}
        </div>
        <p className="mt-0.5 text-[24px] font-semibold leading-tight tracking-[-0.02em] tabular-nums">
          {hover != null ? (active == null ? "—" : fmt(active)) : metric.total == null ? "—" : fmt(metric.total)}
        </p>
      </div>

      <div className="relative mt-3 px-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className={cn("block h-[140px] w-full overflow-visible", colors.fill)}
          role="img"
          aria-label={`${title} over time`}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            setHover(Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1)))));
          }}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((t) => (
            <line
              key={t}
              x1={0}
              x2={W}
              y1={PAD_Y + t * (H - PAD_Y * 2)}
              y2={PAD_Y + t * (H - PAD_Y * 2)}
              className="stroke-neutral-100"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {empty ? null : (
            <>
              <path d={area} fill={`url(#${gradient})`} />
              <path
                d={line}
                fill="none"
                className={colors.line}
                strokeWidth={1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
          {hover != null ? (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={0}
              y2={H}
              className="stroke-neutral-300"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        {empty ? null : (
          <span className="pointer-events-none absolute -top-2 right-4 bg-white pl-1.5 text-[11px] tabular-nums text-neutral-400">
            {fmt(max)}
          </span>
        )}
        {sparse && !empty
          ? points.map(([px, py]) => (
              <span
                key={px}
                className={cn("pointer-events-none absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full", dotBg[tone])}
                style={{ left: `calc(1rem + (100% - 2rem) * ${px / W})`, top: `${(py / H) * 140}px` }}
                aria-hidden
              />
            ))
          : null}
        {hover != null && active != null && !empty ? (
          <span
            className={cn("pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white", dotBg[tone])}
            style={{ left: `calc(1rem + (100% - 2rem) * ${x(hover) / W})`, top: `${(y(active) / H) * 140}px` }}
            aria-hidden
          />
        ) : null}
        {empty ? (
          <p className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-neutral-400">
            No orders in this range
          </p>
        ) : null}
      </div>

      <div className="flex justify-between px-4 pt-2 pb-3.5 text-[12px] text-neutral-400">
        <span>{startLabel}</span>
        <span>now</span>
      </div>
    </section>
  );
}

const dotBg = {
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
  orange: "bg-orange-500",
} as const;

function Delta({ metric, lowerIsBetter }: { metric: Metric; lowerIsBetter?: boolean }) {
  const { total, previous } = metric;
  if (total == null || previous == null) return null;
  if (previous === 0) {
    if (total === 0) return null;
    return <span className="text-[12px] text-neutral-500">New this period</span>;
  }
  const change = (total - previous) / previous;
  const pct = Math.round(change * 100);
  if (pct === 0) return <span className="text-[12px] text-neutral-500 tabular-nums">No change</span>;
  const good = lowerIsBetter ? pct < 0 : pct > 0;
  return (
    <span className={cn("text-[12px] font-medium tabular-nums", good ? "text-emerald-600" : "text-orange-600")}>
      {pct > 0 ? "+" : ""}
      {pct}% vs previous
    </span>
  );
}

/** Averages skip empty buckets, so the line bridges them instead of dropping to zero. */
function paths(values: (number | null)[], x: (i: number) => number, y: (v: number) => number) {
  const pts = values.flatMap((v, i) => (v == null ? [] : [[x(i), y(v)] as const]));
  if (pts.length < 2) return { line: "", area: "", points: pts };
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(2)},${py.toFixed(2)}`).join("");
  const area = `M${pts[0][0].toFixed(2)},${H}L${line.slice(1)}L${pts[pts.length - 1][0].toFixed(2)},${H}Z`;
  return { line, area, points: pts };
}

function niceMax(value: number) {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * exp >= value) ?? 10;
  return step * exp;
}

export function formatValue(value: number, format: MetricFormat, currency: string) {
  if (format === "cents") return formatCents(value, currency);
  if (format === "seconds") {
    const s = Math.round(value);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rest = s % 60;
    return rest ? `${m}m ${rest}s` : `${m}m`;
  }
  return new Intl.NumberFormat("en").format(value);
}

function bucketLabel(start: number, bucketMs: number) {
  const time = (ms: number) => new Date(ms).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
  if (bucketMs >= 86_400_000 / 4) {
    const day = new Date(start).toLocaleDateString("en", { weekday: "short" });
    return `${day} ${time(start)} – ${time(start + bucketMs)}`;
  }
  return `${time(start)} – ${time(start + bucketMs)}`;
}
