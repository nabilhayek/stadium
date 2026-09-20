"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSeat } from "@/lib/seat/use-seat";
import { formatSeat, getSeatStore } from "@/lib/seat/store";

export type SeatSection = { code: string; name: string };

type Props = {
  stadiumSlug: string;
  sections: SeatSection[];
  fromQuery?: { section?: string; row?: string; seat?: string };
};

/** Applies QR query params once, then shows the confirmed seat on the shop. */
export function SeatStatus({ stadiumSlug, sections, fromQuery }: Props) {
  const { seat } = useSeat(stadiumSlug);

  useEffect(() => {
    const code = fromQuery?.section?.toUpperCase();
    const row = fromQuery?.row?.trim();
    const number = fromQuery?.seat?.trim();
    if (!code || !row || !number) return;
    const section = sections.find((s) => s.code.toUpperCase() === code);
    if (!section) return;
    getSeatStore(stadiumSlug).set({
      sectionCode: section.code,
      sectionName: section.name,
      row,
      number,
    });
  }, [stadiumSlug, sections, fromQuery?.section, fromQuery?.row, fromQuery?.seat]);

  return (
    <p className="mt-2 text-sm text-muted">
      Seat:{" "}
      {seat ? (
        <span className="text-foreground">{formatSeat(seat, true)}</span>
      ) : (
        <Link
          href={`/${stadiumSlug}/checkout#seat`}
          className="text-link underline-offset-4 hover:underline"
        >
          set at checkout
        </Link>
      )}
    </p>
  );
}
