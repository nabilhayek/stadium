"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { useSeat } from "@/lib/seat/use-seat";
import { useMounted, useStorageValue, writeStorage } from "@/lib/hooks/use-storage";
import {
  getSeatStore,
  seatFromQuery,
  type Seat,
  type SeatQuery,
  type SeatSection,
} from "@/lib/seat/store";
import { SPRING } from "@/components/motion/variants";
import { SeatConfirm } from "./seat-confirm";

export type { SeatSection };

type Props = {
  stadiumSlug: string;
  sections: SeatSection[];
  fromQuery?: SeatQuery;
};

function queryKey(q?: SeatQuery) {
  return [q?.section ?? "", q?.row ?? "", q?.seat ?? ""].join("|").toLowerCase();
}

function sessionKey(slug: string) {
  return `seat:confirmed:${slug}`;
}

/** QR query → confirm dialog. The seat chip (dark hero) reopens the same editor. */
export function SeatStatus({ stadiumSlug, sections, fromQuery }: Props) {
  const { seat } = useSeat(stadiumSlug);
  const fromUrl = useMemo(() => seatFromQuery(fromQuery, sections), [fromQuery, sections]);
  const [manualOpen, setManualOpen] = useState(false);
  const [autoDismissed, setAutoDismissed] = useState(false);

  // The QR prompt shows once per URL per tab: skipped when this exact query was
  // already confirmed (sessionStorage), or dismissed in this mount.
  const mounted = useMounted();
  const confirmedFor = useStorageValue("session", sessionKey(stadiumSlug));
  const autoOpen = mounted && !!fromUrl && !autoDismissed && confirmedFor !== queryKey(fromQuery);
  const open = manualOpen || autoOpen;

  const draft: Seat | null = fromUrl ?? seat;

  function close() {
    setManualOpen(false);
    setAutoDismissed(true);
  }

  function confirm(next: Seat) {
    getSeatStore(stadiumSlug).set(next);
    writeStorage("session", sessionKey(stadiumSlug), queryKey(fromQuery));
    close();
  }

  const label = seat
    ? `${seat.sectionName}${seat.row.trim() ? ` · Row ${seat.row}` : ""} · Seat ${seat.number}`
    : null;

  return (
    <>
      <m.button
        type="button"
        onClick={() => setManualOpen(true)}
        whileTap={{ scale: 0.98 }}
        transition={SPRING}
        className="flex w-full items-center justify-between gap-3 rounded-full border border-white/10 bg-white/10 px-4 py-2.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="relative grid size-2 place-items-center">
            <span className="absolute inset-0 rounded-full bg-[#22c55e] opacity-60 [animation:ping_1.8s_ease-out_infinite]" />
            <span className="size-2 rounded-full bg-[#22c55e]" />
          </span>
          <span className="min-w-0 truncate text-[15px] text-white/70">
            <AnimatePresence mode="wait" initial={false}>
              <m.span
                key={label ?? "unset"}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
                className="inline-block"
              >
                {label ? (
                  <>
                    Delivered to <span className="font-medium text-white">{label}</span>
                  </>
                ) : (
                  "Set your seat so we can find you"
                )}
              </m.span>
            </AnimatePresence>
          </span>
        </span>
        <span className="shrink-0 text-[13px] font-medium text-white">{seat ? "Edit" : "Set"}</span>
      </m.button>

      <SeatConfirm
        open={open}
        sections={sections}
        draft={draft}
        onClose={close}
        onConfirm={confirm}
      />
    </>
  );
}
