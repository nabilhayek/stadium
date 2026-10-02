import type { Metadata } from "next";
import { Kanban } from "@/components/management/kanban";
import { listDeskOrders } from "@/lib/management/orders";

type Props = { params: Promise<{ stadium: string }> };

export const metadata: Metadata = { title: "Active orders" };

export default async function ManagementOrdersPage({ params }: Props) {
  const { stadium } = await params;
  const orders = await listDeskOrders(stadium);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-[26px] font-semibold leading-none tracking-tight">Active orders</h1>
          <p className="mt-1.5 text-[14px] text-muted">
            Accept with a prep time, mark it ready, then hand it off. Drag a card or use its buttons.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] font-medium">
          <span className="relative size-2 rounded-full bg-[#22c55e]">
            <span className="absolute inset-0 rounded-full bg-[#22c55e] opacity-60 [animation:ping_1.8s_ease-out_infinite]" />
          </span>
          Live
        </span>
      </div>
      <Kanban stadiumSlug={stadium} orders={orders} />
    </div>
  );
}
