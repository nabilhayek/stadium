"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { FlagIcon } from "@/components/i18n/flag-icon";
import { cn } from "@/lib/utils";

export type LanguageOption = {
  code: string;
  label: string;
  /** ISO 3166-1-alpha-2 for flag-icons. */
  flagCode: string;
};

type Props = {
  value: string;
  onChange: (code: string) => void;
  options: readonly LanguageOption[];
  tone: "shop" | "desk";
  "aria-label": string;
  /** Stretch the pill; the chevron stays on the trailing edge. */
  fullWidth?: boolean;
  /** Open the list above the pill (desk sidebar sits on the bottom edge). */
  menuSide?: "top" | "bottom";
  /** Which edge of the pill the list lines up with. */
  align?: "start" | "end";
  className?: string;
};

/** Pill language picker. The list stays in the DOM (no portal) so drawers can show it. */
export function LanguageSelectorDropdown({
  value,
  onChange,
  options,
  tone,
  "aria-label": ariaLabel,
  fullWidth = false,
  menuSide = "bottom",
  align = "start",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const toggledAt = useRef(0);
  const listId = useId();
  const selected = options.find((option) => option.code === value) ?? options[0];
  const desk = tone === "desk";

  function openFromGesture(button: number) {
    if (button !== 0) return;
    const now = Date.now();
    if (now - toggledAt.current < 400) return;
    toggledAt.current = now;
    setOpen((current) => !current);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={cn("relative", fullWidth ? "w-full" : "inline-block max-w-full")}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        // The shop drawer preventDefaults pointerdown (drag-to-dismiss), which cancels click.
        // pointerup still arrives. Both are wired; the second one in the same gesture is ignored.
        onPointerUp={(event) => openFromGesture(event.button)}
        onClick={() => openFromGesture(0)}
        className={cn(
          "flex h-9 items-center rounded-full border px-3 text-[14px] font-medium shadow-[var(--surface-shadow)] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2",
          fullWidth ? "w-full justify-between gap-3" : "w-fit max-w-full gap-2",
          desk
            ? "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50 focus-visible:outline-blue-500"
            : "border-border bg-surface text-foreground hover:bg-surface-secondary focus-visible:outline-[var(--focus)]",
          className,
        )}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <FlagIcon code={selected.flagCode} className="text-[15px]" />
            <span className="truncate">{selected.label}</span>
          </span>
        ) : null}
        <ChevronDown className={cn("size-4 shrink-0 opacity-60 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      <AnimatePresence>
        {open ? (
          <m.ul
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            initial={reduceMotion ? false : { opacity: 0, y: menuSide === "top" ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: menuSide === "top" ? 4 : -4 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={cn(
              "absolute z-30 min-w-full overflow-hidden rounded-xl border p-1 shadow-[0_12px_32px_-12px_rgba(17,17,17,0.18)]",
              menuSide === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
              fullWidth ? "right-0 left-0" : align === "end" ? "right-0 w-48" : "left-0 w-48",
              desk ? "border-neutral-200 bg-white text-neutral-900" : "border-border bg-surface text-foreground",
            )}
          >
            {options.map((option) => {
              const active = option.code === value;
              return (
                <li key={option.code} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onPointerUp={(event) => {
                      if (event.button !== 0) return;
                      event.stopPropagation();
                      onChange(option.code);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] transition-colors hover:bg-neutral-100",
                      active ? "font-semibold text-[var(--link)]" : "text-neutral-800",
                    )}
                  >
                    <FlagIcon code={option.flagCode} className="text-[15px]" />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {active ? <Check className="size-4 shrink-0 text-[var(--link)]" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </m.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
