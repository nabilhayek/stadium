"use client";

import { useId, useState, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** One setting: label and help on the left, the control on the right. Nested content shows below when given. */
export function SettingRow({
  label,
  description,
  control,
  children,
  htmlFor,
}: {
  label: string;
  description?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  htmlFor?: string;
}) {
  return (
    <li className="px-4 py-3.5">
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <label htmlFor={htmlFor} className="block text-[14px] font-medium">
            {label}
          </label>
          {description ? <p className="mt-0.5 text-[13px] leading-snug text-neutral-500">{description}</p> : null}
        </div>
        {control ? <div className="shrink-0">{control}</div> : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </li>
  );
}

export function SettingList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-neutral-200">{children}</ul>;
}

/** A setting turned on or off with a switch. */
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  children,
}: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <SettingRow
      label={label}
      description={description}
      htmlFor={id}
      control={<Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />}
    >
      {checked ? children : null}
    </SettingRow>
  );
}

const inputClass =
  "h-9 w-full min-w-0 rounded-lg border border-neutral-200 bg-white px-3 text-[14px] text-neutral-900 outline-none placeholder:text-neutral-400 transition-[border-color,box-shadow] focus-visible:border-blue-500 focus-visible:ring-3 focus-visible:ring-blue-500/15 disabled:opacity-50";

/** Whole number with a unit on the right. Commits on blur or Enter so typing never fights clamping. */
export function NumberInput({
  id,
  value,
  onChange,
  min = 0,
  max = 100000,
  suffix,
  prefix,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const n = Number(text.replace(",", "."));
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))));
    setText(null);
  };
  return (
    <div className={cn("relative w-28", className)}>
      {prefix ? <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px] text-neutral-400">{prefix}</span> : null}
      <input
        id={id}
        inputMode="numeric"
        aria-label={ariaLabel}
        value={text ?? String(value)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className={cn(inputClass, "text-right tabular-nums", suffix && "pr-12", prefix && "pl-8")}
      />
      {suffix ? <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] text-neutral-400">{suffix}</span> : null}
    </div>
  );
}

/** Amount in cents, edited in whole currency units with decimals. */
export function MoneyInput({
  cents,
  onChange,
  currency,
  "aria-label": ariaLabel,
}: {
  cents: number;
  onChange: (cents: number) => void;
  currency: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const n = Number(text.replace(",", "."));
    if (Number.isFinite(n) && n >= 0) onChange(Math.round(n * 100));
    setText(null);
  };
  return (
    <div className="relative w-28">
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        value={text ?? (cents / 100).toFixed(2)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        className={cn(inputClass, "pr-12 text-right tabular-nums")}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[13px] text-neutral-400">{currency}</span>
    </div>
  );
}

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  "aria-label"?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    />
  );
}
