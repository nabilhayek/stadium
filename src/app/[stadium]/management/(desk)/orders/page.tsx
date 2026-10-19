import type { Metadata } from "next";
import { Kanban } from "@/components/management/kanban";
import { requireKitchen } from "@/lib/management/session";
import { api } from "@/server/trpc/server";

type Props = { params: Promise<{ stadium: string }> };

export const metadata: Metadata = { title: "Active orders" };

export default async function ManagementOrdersPage({ params }: Props) {
  const { stadium } = await params;
  await requireKitchen(stadium);
  const orders = await api.kitchen.board({ stadium });

  return (
    <>
      <div className="mb-5">
        <h1 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.02em]">Active orders</h1>
        <p className="mt-1 text-[14px] text-neutral-500">
          Accept an order, mark it ready, then hand it off. Drag a card or use its buttons.
        </p>
      </div>
      <Kanban stadiumSlug={stadium} orders={orders} />
    </>
  );
}
