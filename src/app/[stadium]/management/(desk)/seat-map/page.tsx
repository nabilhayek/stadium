import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeatMapDesigner } from "@/components/management/seat-map/designer";
import { requireKitchen } from "@/lib/management/session";
import { api } from "@/server/trpc/server";

type Props = { params: Promise<{ stadium: string }> };

export const metadata: Metadata = { title: "Seat map" };

export default async function ManagementSeatMapPage({ params }: Props) {
  const { stadium } = await params;
  await requireKitchen(stadium);
  const state = await api.seatMap.get({ stadium });
  if (!state) notFound();

  return <SeatMapDesigner stadiumSlug={stadium} initial={state} />;
}
