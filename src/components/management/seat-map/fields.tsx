"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-neutral-200 px-4 py-4 last:border-b-0">
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[12px] font-semibold tracking-wide text-neutral-900 uppercase">{title}</h3>
          {action}
        </div>
      ) : null}
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

/**
 * A collapsible section inside a panel. Closed by default — only in-focus work shows up front,
 * everything else stays one click away.
 */
export function Disclosure({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="-mx-1 rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-blue-500"
        aria-expanded={open}
      >
        <ChevronRight className={cn("size-3.5 text-neutral-400 transition-transform duration-150", open && "rotate-90")} aria-hidden />
        <span className="text-[13px] font-medium text-neutral-800">{title}</span>
        {summary ? <span className="ml-auto truncate text-[12px] text-neutral-500">{summary}</span> : null}
      </button>
      {open ? <div className="mt-1 flex flex-col gap-2.5 px-1 pb-1">{children}</div> : null}
    </div>
  );
}

const LABEL_WIDTH = "w-[108px]";

export function FieldRow({
  label,
  htmlFor,
  children,
  hint,
  layout = "inline",
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: ReactNode;
  /** Stack the control under the label when it needs the full row, so its text is not cut off. */
  layout?: "inline" | "stack";
}) {
  if (layout === "stack") {
    return (
      <div>
        <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] leading-tight text-neutral-500">
          {label}
        </label>
        {children}
        {hint ? <div className="mt-1 text-[12px] leading-snug text-neutral-500">{hint}</div> : null}
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-3">
        <label htmlFor={htmlFor} className={cn(LABEL_WIDTH, "shrink-0 text-[13px] leading-tight text-neutral-500")}>
          {label}
        </label>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {hint ? <div className="mt-1 pl-[120px] text-[12px] leading-snug text-neutral-500">{hint}</div> : null}
    </div>
  );
}

/** Equal-width segmented picker. Labels stay whole; a long one wraps inside its segment instead of being cut off. */
export function Segmented<T extends string>({
  id,
  value,
  onChange,
  options,
  size = "md",
}: {
  id?: string;
  value: T | null;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode; ariaLabel?: string }[];
  size?: "md" | "sm";
}) {
  return (
    <div id={id} role="radiogroup" className={cn("flex min-w-0 rounded-lg border border-neutral-200 bg-white p-0.5", size === "sm" ? "min-h-7" : "min-h-8")}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.ariaLabel ?? (typeof opt.label === "string" ? opt.label : undefined)}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center rounded-md px-2 py-1 text-center text-[12px] leading-tight font-medium wrap-break-word transition-colors duration-100",
              active ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-800",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const inputClass =
  "h-8 w-full min-w-0 rounded-lg border border-neutral-200 bg-white px-2.5 text-[13px] text-neutral-900 outline-none tabular-nums transition-[border-color,box-shadow] placeholder:text-neutral-400 focus-visible:border-blue-500 focus-visible:ring-3 focus-visible:ring-blue-500/15 aria-invalid:border-red-500 disabled:opacity-50";

type NumberProps = {
  id: string;
  value: number | null;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  digits?: number;
  disabled?: boolean;
};

/** Edits commit as you type; a half-typed value ("-", "1.") waits until it parses. `null` shows "Mixed". */
export function NumberField({ id, value, onChange, step = 1, min, max, suffix, digits = 2, disabled }: NumberProps) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value === null ? "" : String(Number(value.toFixed(digits))));
  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={shown}
        placeholder={value === null ? "Mixed" : undefined}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number.parseFloat(e.target.value);
          if (!Number.isFinite(n)) return;
          if (min !== undefined && n < min) return;
          if (max !== undefined && n > max) return;
          onChange(n);
        }}
        onBlur={() => setText(null)}
        className={cn(inputClass, suffix && "pr-8")}
      />
      {suffix ? <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-neutral-400">{suffix}</span> : null}
    </div>
  );
}

/** Like NumberField: the box can hold a value `accept` rejects (e.g. empty) without it reaching the document. */
export function TextField({
  id,
  value,
  onChange,
  placeholder,
  maxLength,
  invalid,
  accept,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  invalid?: boolean;
  accept?: (v: string) => boolean;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? value;
  return (
    <input
      id={id}
      value={shown}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-invalid={invalid || (accept && !accept(shown)) || undefined}
      onChange={(e) => {
        setText(e.target.value);
        if (!accept || accept(e.target.value)) onChange(e.target.value);
      }}
      onBlur={() => setText(null)}
      className={inputClass}
    />
  );
}

export function ColorField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex h-8 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-1.5 focus-within:border-blue-500 focus-within:ring-3 focus-within:ring-blue-500/15">
      <span className="relative size-5 shrink-0">
        <span className="absolute inset-0 rounded-full border border-black/10" style={{ background: value }} aria-hidden />
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
      </span>
      <span className="text-[13px] text-neutral-600 uppercase tabular-nums">{value}</span>
    </label>
  );
}

export const smallButton =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-neutral-200 bg-white! px-3 text-[13px] font-medium text-neutral-800 transition-colors duration-150 hover:bg-neutral-50! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50";

export const linkButton = "text-[13px] font-medium text-blue-600 hover:text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500";

/** A range for dragging plus a small box for an exact value. `null` shows "Mixed" with the thumb in the middle. */
export function SliderField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  digits = 2,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  digits?: number;
}) {
  const thumb = value === null ? (min + max) / 2 : Math.min(max, Math.max(min, value));
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={thumb}
        aria-label={label}
        aria-valuetext={value === null ? "Mixed" : `${Number(thumb.toFixed(digits))}${suffix ? ` ${suffix}` : ""}`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-4 min-w-0 flex-1 cursor-pointer accent-neutral-900"
      />
      <div className="w-[76px] shrink-0">
        <NumberField id={id} value={value} onChange={onChange} step={step} min={min} max={max} suffix={suffix} digits={digits} />
      </div>
    </div>
  );
}

/** Steps of 5%, from a quarter of the size up to three times. */
export function ScaleSlider({ id, value, onChange }: { id: string; value: number; onChange: (scale: number) => void }) {
  const shown = Math.min(3, Math.max(0.25, Math.round(value * 20) / 20));
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="range"
        min={0.25}
        max={3}
        step={0.05}
        value={Number.isFinite(shown) ? shown : 1}
        aria-valuetext={`${Math.round(shown * 100)} percent`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-4 w-full cursor-pointer accent-neutral-900"
      />
      <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-neutral-500">{Math.round((Number.isFinite(shown) ? shown : 1) * 100)}%</span>
    </div>
  );
}
