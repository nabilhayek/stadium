"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "framer-motion";
import { useMounted } from "@/lib/hooks/use-storage";
import { PillButton } from "@/components/ui/pill-button";
import { Field } from "@/components/ui/field";
import { SpotGradient } from "@/components/ui/spot-gradient";
import { SOFT_SPRING, SPRING } from "@/components/motion/variants";
import { formatSeat, resolveSection, type Seat, type SeatSection } from "@/lib/seat/store";

type Props = {
  open: boolean;
  sections: SeatSection[];
  draft: Seat | null;
  onClose: () => void;
  onConfirm: (seat: Seat) => void;
};

/**
 * Presence wrapper, portalled to <body> so it escapes any transformed / isolated
 * ancestor (the hero card). The sheet mounts fresh on every open, so its form
 * state starts from `draft`.
 */
export function SeatConfirm({ open, sections, draft, onClose, onConfirm }: Props) {
  const mounted = useMounted();
  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <Sheet key="sheet" sections={sections} draft={draft} onClose={onClose} onConfirm={onConfirm} />
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

function Sheet({ sections, draft, onClose, onConfirm }: Omit<Props, "open">) {
  const titleId = useId();
  const listed = useMemo(() => {
    if (!draft) return sections;
    if (sections.some((s) => s.code.toUpperCase() === draft.sectionCode.toUpperCase())) return sections;
    return [{ code: draft.sectionCode, name: draft.sectionName }, ...sections];
  }, [sections, draft]);

  const [sectionCode, setSectionCode] = useState(draft?.sectionCode ?? listed[0]?.code ?? "");
  const [row, setRow] = useState(draft?.row ?? "");
  const [number, setNumber] = useState(draft?.number ?? "");

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const section = resolveSection(listed, sectionCode);
  const preview: Seat | null =
    sectionCode && number.trim()
      ? { sectionCode: section.code, sectionName: section.name, row: row.trim(), number: number.trim() }
      : null;

  function submit() {
    if (!preview) return;
    onConfirm(preview);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <m.button
            key="backdrop"
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 bg-[color:var(--backdrop)]"
            aria-label="Dismiss seat confirmation"
            onClick={onClose}
          />
          <m.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.6 }}
            transition={SOFT_SPRING}
            className="relative z-10 w-full max-w-md rounded-t-[28px] bg-overlay px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_40px_rgba(17,17,17,0.14)] sm:mx-4 sm:rounded-[28px] sm:pt-6"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-separator sm:hidden" />
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Delivery seat</p>
            <h2 id={titleId} className="font-display mt-2 text-[28px] font-semibold leading-[1.05] tracking-[-0.03em]">
              Is this your seat?
            </h2>
            <p className="mt-2 text-[15px] leading-snug text-muted">
              Food and drinks go here. Change anything that does not match the sign on the aisle.
            </p>

            <div className="spot mt-5 px-4 py-4">
              <SpotGradient speed={0.5} scrim={0.4} />
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/70">Delivering to</p>
              <AnimatePresence mode="wait" initial={false}>
                <m.p
                  key={preview ? formatSeat(preview) : "none"}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                  className="font-display mt-1 text-[22px] font-semibold tracking-tight text-white"
                >
                  {preview ? formatSeat(preview, true) : "Add your section and seat"}
                </m.p>
              </AnimatePresence>
            </div>

            <div className="mt-5" role="group" aria-label="Section">
              <p className="mb-2 text-[13px] font-medium text-muted">Section</p>
              <div className="relative isolate flex flex-wrap gap-1.5">
                {listed.map((s) => {
                  const active = sectionCode === s.code;
                  return (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => setSectionCode(s.code)}
                      aria-pressed={active}
                      className="relative min-w-11 rounded-full px-4 py-2 text-[14px] font-medium"
                    >
                      {active ? (
                        <m.span layoutId="seat-section-thumb" transition={SPRING} className="absolute inset-0 z-0 rounded-full bg-foreground" />
                      ) : (
                        <span className="absolute inset-0 z-0 rounded-full bg-surface-secondary" />
                      )}
                      <span className={["relative z-10 transition-colors", active ? "text-background" : "text-foreground"].join(" ")}>
                        {s.code}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field
                label="Row (optional)"
                name="confirm-row"
                inputMode="numeric"
                autoComplete="off"
                value={row}
                onChange={(e) => setRow(e.target.value)}
              />
              <Field
                label="Seat"
                name="confirm-seat"
                inputMode="numeric"
                autoComplete="off"
                placeholder="110"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                required
              />
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <PillButton size="lg" variant="primary" fullWidth disabled={!preview} onClick={submit}>
                Yes, deliver here
              </PillButton>
              <PillButton size="lg" variant="ghost" fullWidth onClick={onClose}>
                Not now
              </PillButton>
            </div>
          </m.div>
    </div>
  );
}
