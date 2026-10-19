"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Inbox } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { STATUS_LABELS } from "@/lib/management/board";
import type { RecentOrder } from "@/lib/management/orders";
import { formatCents } from "@/lib/money";
import type { KitchenStatus } from "@/lib/orders/receipt";
import { cn } from "@/lib/utils";

type Props = { orders: RecentOrder[]; currency: string; now: number };

const STATUS_DOT: Record<KitchenStatus, string> = {
  new: "bg-blue-500",
  accepted: "bg-amber-500",
  ready: "bg-green-500",
  done: "bg-neutral-400",
  declined: "bg-orange-500",
};

const ALL = "all";

export function RecentOrders({ orders, currency, now }: Props) {
  const query = (useSearchParams().get("q") ?? "").toLowerCase();
  const [status, setStatus] = useState<string>(ALL);
  const [type, setType] = useState<string>(ALL);

  const rows = useMemo(
    () =>
      orders.filter((o) => {
        if (status !== ALL && o.status !== status) return false;
        if (type === "scheduled" ? o.timing !== "scheduled" : type !== ALL && o.fulfillment !== type) return false;
        if (!query) return true;
        return [o.orderNumber, o.summary, o.seat ?? ""].some((s) => s.toLowerCase().includes(query));
      }),
    [orders, status, type, query],
  );

  const filtered = status !== ALL || type !== ALL || query !== "";

  return (
    <section className="rounded-xl border border-neutral-200 bg-white" aria-labelledby="recent-orders">
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-3">
        <div className="mr-auto">
          <h2 id="recent-orders" className="text-[14px] font-medium">
            Recent orders
          </h2>
          <p className="text-[13px] text-neutral-500 tabular-nums">
            {filtered ? `${rows.length} of ${orders.length}` : orders.length === 1 ? "1 order" : `${orders.length} orders`}
            {query ? ` matching “${query}”` : ""}
          </p>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger size="sm" aria-label="Filter by status" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {(Object.keys(STATUS_LABELS) as KitchenStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger size="sm" aria-label="Filter by type" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            <SelectItem value="delivery">Delivery</SelectItem>
            <SelectItem value="pickup">Pick-up</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
          <Inbox className="size-5 text-neutral-400" aria-hidden />
          <p className="text-[14px] font-medium">{filtered ? "No orders match these filters" : "No orders in this range"}</p>
          <p className="text-[13px] text-neutral-500">
            {filtered ? "Clear the search or pick another status." : "Paid orders show up here as they come in."}
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">Order</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="w-full">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="pr-4 text-right">Paid</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((o) => (
              <TableRow key={o.orderNumber}>
                <TableCell className="pl-4 font-medium tabular-nums">{o.orderNumber}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-2 text-neutral-700">
                    <span className={cn("size-2 rounded-full", STATUS_DOT[o.status])} aria-hidden />
                    {STATUS_LABELS[o.status]}
                  </span>
                </TableCell>
                <TableCell>
                  <TypeChip order={o} />
                </TableCell>
                <TableCell className="max-w-0 text-neutral-600">
                  <span className="block truncate" title={o.summary}>
                    <span className="mr-1.5 text-neutral-400 tabular-nums">{o.items}×</span>
                    {o.summary}
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatCents(o.totalCents, currency)}</TableCell>
                <TableCell className="pr-4 text-right text-neutral-500 tabular-nums" title={new Date(o.paidAt).toLocaleString("en")} suppressHydrationWarning>
                  {ago(now - o.paidAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function TypeChip({ order }: { order: RecentOrder }) {
  const [label, tone] =
    order.timing === "scheduled"
      ? ["Scheduled", "bg-violet-600"]
      : order.fulfillment === "delivery"
        ? ["Delivery", "bg-blue-600"]
        : ["Pick-up", "bg-emerald-600"];
  return <span className={cn("rounded-full px-2 py-0.5 text-[12px] font-semibold text-white", tone)}>{label}</span>;
}

function ago(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
