"use client";

import { m } from "framer-motion";
import type { ReactNode } from "react";
import { SPRING } from "@/components/motion/variants";

export type SegmentOption<T extends string> = {
  id: T;
  label: ReactNode;
  hint?: ReactNode;
};

type Props<T extends string> = {
  value: T;
  onChange: (next: T) => void;
  options: SegmentOption<T>[];
  /** Unique per control so the sliding thumb never jumps between controls. */
  layoutId: string;
  size?: "md" | "lg";
  "aria-label": string;
};

/** iOS-style segmented control. The thumb slides between segments. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  layoutId,
  size = "md",
  ...rest
}: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={rest["aria-label"]}
      className="relative isolate grid gap-1 rounded-[18px] bg-surface-secondary p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(o.id)}
            className={[
              "relative rounded-[14px] px-3 text-left",
              size === "lg" ? "py-3" : "py-2",
              o.hint ? "" : "text-center",
            ].join(" ")}
          >
            {selected ? (
              <m.span
                layoutId={layoutId}
                transition={SPRING}
                className="absolute inset-0 z-0 rounded-[14px] bg-surface shadow-[0_1px_2px_rgba(17,17,17,0.08),0_6px_16px_-8px_rgba(17,17,17,0.25)]"
              />
            ) : null}
            <span
              className={[
                "relative z-10 block text-[15px] font-medium leading-tight transition-colors",
                selected ? "text-foreground" : "text-muted",
              ].join(" ")}
            >
              {o.label}
            </span>
            {o.hint ? (
              <span
                className={[
                  "relative z-10 mt-0.5 block text-[13px] leading-tight transition-colors",
                  selected ? "text-muted" : "text-muted/70",
                ].join(" ")}
              >
                {o.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
