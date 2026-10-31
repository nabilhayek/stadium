import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const primaryButton =
  "inline-flex h-9 items-center gap-1.5 rounded-full bg-neutral-900! px-4 text-[14px] font-medium text-white! transition-colors duration-150 hover:bg-neutral-700! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50";

export const secondaryButton =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-200 bg-white! px-4 text-[14px] font-medium transition-colors duration-150 hover:bg-neutral-50! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50";

export const ghostButton =
  "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-neutral-600 transition-colors duration-150 hover:bg-neutral-200/60! hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:pointer-events-none disabled:opacity-40";

export function PageHeader({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
        {description ? <p className="mt-1 text-[14px] text-neutral-500">{description}</p> : null}
      </div>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </div>
  );
}

export type TabOption<T extends string> = { id: T; label: string; count?: number };

/** Compact segmented tabs used above management lists. */
export function FilterTabs<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly TabOption<T>[];
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex max-w-full overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 [scrollbar-width:none]"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150",
            value === o.id ? "bg-white! text-neutral-900 shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-neutral-500 hover:text-neutral-900",
          )}
        >
          {o.label}
          {o.count !== undefined ? <span className="text-[12px] tabular-nums text-neutral-400">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Bordered white card with a grey title strip, as used for product categories. */
export function Card({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-neutral-200 bg-white", className)}>
      <div className="flex min-h-11 items-center gap-2 rounded-t-xl border-b border-neutral-200 bg-neutral-50 py-1.5 pr-2 pl-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-medium">{title}</h2>
          {description ? <p className="text-[12px] text-neutral-500">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white", tone)}>{children}</span>;
}
