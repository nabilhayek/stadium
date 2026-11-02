import type { Metadata } from "next";
import { DeskAlerts } from "@/components/management/desk-alerts";
import { Kanban } from "@/components/management/kanban";
import { kitchenStreamToken } from "@/lib/live/token";
import { requireKitchen } from "@/lib/management/session";
import { api } from "@/server/trpc/server";

type Props = { params: Promise<{ stadium: string }> };

export const metadata: Metadata = { title: "Active orders" };
export const instant = false;

export default async function ManagementOrdersPage({ params }: Props) {
  const { stadium } = await params;
  const session = await requireKitchen(stadium);
  const orders = await api.kitchen.board({ stadium });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.02em]">Active orders</h1>
          <p className="mt-1 text-[14px] text-neutral-500">Accept an order, mark it ready, then hand it off. Drag a card or use its buttons.</p>
        </div>
        <DeskAlerts stadiumSlug={stadium} />
      </div>
      <Kanban stadiumSlug={stadium} orders={orders} streamToken={await kitchenStreamToken(stadium, session.user.id)} />
    </>
  );
}
