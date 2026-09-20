"use client";

import { useEffect, useRef } from "react";

const ITEM = 40;
const VISIBLE = 5;
const PAD = (ITEM * (VISIBLE - 1)) / 2;

type WheelProps = {
  items: string[];
  index: number;
  onIndex: (i: number) => void;
  label: string;
  className?: string;
};

/** One scroll-snapping drum. scrollTop === index * ITEM thanks to the symmetric padding. */
function Wheel({ items, index, onIndex, label, className }: WheelProps) {
  const ref = useRef<HTMLUListElement>(null);
  const settle = useRef<number | undefined>(undefined);
  const dragging = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || dragging.current) return;
    const target = index * ITEM;
    if (Math.abs(el.scrollTop - target) > 1) el.scrollTo({ top: target });
  }, [index]);

  function onScroll() {
    dragging.current = true;
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const el = ref.current;
      dragging.current = false;
      if (!el) return;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM)));
      if (i !== index) onIndex(i);
    }, 80);
  }

  return (
    <ul
      ref={ref}
      role="listbox"
      aria-label={label}
      onScroll={onScroll}
      className={["wheel relative", className].filter(Boolean).join(" ")}
      style={{ height: ITEM * VISIBLE, paddingBlock: PAD }}
    >
      {items.map((it, i) => {
        const d = Math.min(3, Math.abs(i - index));
        return (
          <li
            key={i}
            role="option"
            aria-selected={i === index}
            onClick={() => onIndex(i)}
            className="flex cursor-pointer snap-center items-center justify-center text-[22px] tabular-nums transition-[opacity,transform] duration-150"
            style={{
              height: ITEM,
              opacity: 1 - d * 0.28,
              transform: `scale(${1 - d * 0.06})`,
              fontWeight: i === index ? 600 : 400,
              color: i === index ? "var(--foreground)" : "var(--muted)",
            }}
          >
            {it}
          </li>
        );
      })}
    </ul>
  );
}

type Props = {
  /** Selected time in ms. */
  value: number;
  onChange: (ms: number) => void;
};

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));
const PERIODS = ["AM", "PM"];

/** iOS-style hour · minute · AM/PM drum picker. */
export function TimeWheel({ value, onChange }: Props) {
  const d = new Date(value);
  const h24 = d.getHours();
  const period = h24 >= 12 ? 1 : 0;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const minute = d.getMinutes();

  function commit(nextH12: number, nextMinute: number, nextPeriod: number) {
    const next = new Date(value);
    const hours = (nextH12 % 12) + (nextPeriod === 1 ? 12 : 0);
    next.setHours(hours, nextMinute, 0, 0);
    onChange(next.getTime());
  }

  return (
    <div className="relative rounded-[20px] border border-border bg-surface px-3">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-1/2 h-10 -translate-y-1/2 rounded-xl bg-surface-secondary"
      />
      <div className="relative grid grid-cols-[1fr_auto_1fr_1fr] items-center">
        <Wheel
          label="Hour"
          items={HOURS}
          index={h12 - 1}
          onIndex={(i) => commit(i + 1, minute, period)}
        />
        <span className="pb-1 text-[22px] font-semibold text-muted" aria-hidden>
          :
        </span>
        <Wheel
          label="Minute"
          items={MINUTES}
          index={minute}
          onIndex={(i) => commit(h12, i, period)}
        />
        <Wheel
          label="AM or PM"
          items={PERIODS}
          index={period}
          onIndex={(i) => commit(h12, minute, i)}
          className="text-[18px]"
        />
      </div>
    </div>
  );
}
