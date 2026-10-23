"use client";

import { AnimatePresence, m } from "framer-motion";
import { Check, Copy, Crosshair, Group, ListOrdered, Magnet, RotateCw, Trash2, Undo2, X } from "lucide-react";
import type { ReactNode } from "react";
import { SPRING } from "@/components/motion/variants";
import type { SeatMapDoc } from "@/lib/seatmap/schema";
import { cn } from "@/lib/utils";
import { splitSelection, type Selection } from "./ops";
import type { AssistChip, AssistId } from "./tools";

const HINTS: Record<AssistId, { icon: ReactNode; label: string; kbd: string }> = {
  snap: { icon: <Magnet className="size-4" aria-hidden />, label: "Ignore snap", kbd: "Alt" },
  angle: { icon: <RotateCw className="size-4" aria-hidden />, label: "Snap 15°", kbd: "Shift" },
  finish: { icon: <Check className="size-4" aria-hidden />, label: "Finish", kbd: "Enter" },
  point: { icon: <Undo2 className="size-4" aria-hidden />, label: "Remove point", kbd: "⌫" },
  cancel: { icon: <X className="size-4" aria-hidden />, label: "Cancel", kbd: "Esc" },
};

type Props = {
  selection: Selection;
  canGroup: boolean;
  canRenumber: boolean;
  hints: AssistChip[];
  onGroup: () => void;
  onRenumber: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onFocus: () => void;
};

/**
 * Floating action pill above the canvas. Selection actions and the keys for
 * the stroke in progress share one control: icon, label, then the key.
 */
export function SelectionBar({ selection, canGroup, canRenumber, hints, onGroup, onRenumber, onDuplicate, onDelete, onFocus }: Props) {
  const parts = splitSelection(selection);
  const objects = parts.sections.size + parts.rows.size + parts.decorations.size + parts.pois.size;
  const count = objects + parts.seats.length;
  const visible = count > 0 || hints.length > 0;
  return (
    <div className="pointer-events-none absolute bottom-5 left-0 right-16 z-20 flex justify-center">
      <AnimatePresence>
        {visible ? (
          <m.div
            key="selection-bar"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={SPRING}
            className="pointer-events-auto flex items-stretch rounded-full border border-neutral-200/80 bg-white/95 shadow-[0_18px_34px_-18px_rgba(17,17,17,0.35),0_2px_6px_-2px_rgba(17,17,17,0.08)] backdrop-blur"
          >
            {count > 0 ? (
              <>
                {canGroup ? (
                  <>
                    <ActionButton icon={<Group className="size-4" aria-hidden />} label="Group as section" kbd="G" onClick={onGroup} tone="primary" />
                    <Divider />
                  </>
                ) : null}
                <ActionButton icon={<Crosshair className="size-4" aria-hidden />} label="Zoom to" onClick={onFocus} />
                {canRenumber ? <ActionButton icon={<ListOrdered className="size-4" aria-hidden />} label="Renumber" onClick={onRenumber} /> : null}
                {objects ? <ActionButton icon={<Copy className="size-4" aria-hidden />} label="Duplicate" kbd="⌘D" onClick={onDuplicate} /> : null}
                <Divider />
                <ActionButton icon={<Trash2 className="size-4" aria-hidden />} label="Delete" kbd="⌫" onClick={onDelete} tone="danger" />
              </>
            ) : null}
            {hints.length ? (
              <>
                {count > 0 ? <Divider /> : null}
                {hints.map((hint) => {
                  const item = HINTS[hint.id];
                  return <Hint key={hint.id} icon={item.icon} label={item.label} kbd={item.kbd} />;
                })}
              </>
            ) : null}
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Divider() {
  return <span className="my-1.5 w-px shrink-0 bg-neutral-200" aria-hidden />;
}

const itemClass = (tone: "default" | "primary" | "danger") =>
  cn(
    "group inline-flex items-center gap-1.5 px-2.5 py-2 text-[13px] font-medium transition-colors duration-100 first:rounded-l-full last:rounded-r-full",
    tone === "danger" && "text-red-600 hover:bg-red-50",
    tone === "primary" && "text-neutral-900 hover:bg-neutral-50",
    tone === "default" && "text-neutral-700 hover:bg-neutral-50",
  );

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="ml-0.5 inline-flex min-w-5 justify-center rounded border border-neutral-200 bg-neutral-50 px-1 py-0.5 text-[10px] font-medium text-neutral-500 group-hover:bg-white">
      {children}
    </kbd>
  );
}

function ActionButton({
  icon,
  label,
  kbd,
  onClick,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  kbd?: string;
  onClick: () => void;
  tone?: "default" | "primary" | "danger";
}) {
  return (
    <button type="button" onClick={onClick} className={itemClass(tone)} title={kbd ? `${label} · ${kbd}` : label} aria-label={kbd ? `${label} (${kbd})` : label}>
      {icon}
      <span>{label}</span>
      {kbd ? <Kbd>{kbd}</Kbd> : null}
    </button>
  );
}

function Hint({ icon, label, kbd }: { icon: ReactNode; label: string; kbd: string }) {
  return (
    <div className={itemClass("default")}>
      {icon}
      <span>{label}</span>
      <Kbd>{kbd}</Kbd>
    </div>
  );
}

export function allLoose(doc: SeatMapDoc, rowIds: ReadonlySet<string>): boolean {
  if (!rowIds.size) return false;
  for (const section of doc.sections) {
    for (const row of section.rows) {
      if (rowIds.has(row.id) && !section.loose) return false;
    }
  }
  return true;
}
