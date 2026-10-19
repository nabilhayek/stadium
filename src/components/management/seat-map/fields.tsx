"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-neutral-200 px-4 py-4 last:border-b-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-neutral-900">{title}</h3>
        {action}
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

export function FieldRow({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <label htmlFor={htmlFor} className="w-[42%] shrink-0 truncate text-[13px] text-neutral-500">
          {label}
        </label>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {hint ? <div className="mt-1 pl-[calc(42%+0.75rem)] text-[12px] leading-snug">{hint}</div> : null}
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
