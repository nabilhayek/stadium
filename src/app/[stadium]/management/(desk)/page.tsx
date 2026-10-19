import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/management/overview/auto-refresh";
import { MetricCard } from "@/components/management/overview/metric-card";
import { RangeSelect } from "@/components/management/overview/range-select";
import { RecentOrders } from "@/components/management/overview/recent-orders";
import { RANGES, toRange } from "@/lib/management/orders";
import { requireKitchen } from "@/lib/management/session";
import { api } from "@/server/trpc/server";

type Props = {
  params: Promise<{ stadium: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const metadata: Metadata = { title: "Kitchen overview" };

const RANGE_OPTIONS = Object.entries(RANGES).map(([value, r]) => ({ value, label: r.label }));

export default async function ManagementOverview({ params, searchParams }: Props) {
  const { stadium } = await params;
  const range = toRange((await searchParams).range);
  const menu = await api.stadium.menu({ slug: stadium });
  if (!menu) notFound();
  await requireKitchen(menu.slug);

  const data = await api.kitchen.overview({ stadium: menu.slug, range });
  const { now } = data;
  const { spanMs, buckets, start } = RANGES[range];
  const bucketMs = spanMs / buckets;
  const orders = `/${menu.slug}/management/orders`;
  const card = { currency: menu.currency, bucketMs, now, startLabel: start, href: orders };

  return (
    <>
      <AutoRefresh />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold leading-tight tracking-[-0.02em]">Overview</h1>
          <p className="mt-1 text-[14px] text-neutral-500">How the kitchen is keeping up, from paid orders.</p>
        </div>
        <RangeSelect value={range} options={RANGE_OPTIONS} />
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <MetricCard {...card} title="Orders" label="Paid orders" metric={data.orders} format="count" tone="blue" />
        <MetricCard {...card} title="Revenue" label="Excluding declined" metric={data.revenue} format="cents" tone="emerald" />
        <MetricCard
          {...card}
          title="Time to accept"
          label="Average, ASAP orders"
          metric={data.acceptSeconds}
          format="seconds"
          tone="violet"
          lowerIsBetter
        />
        <MetricCard {...card} title="Declined" label="Orders turned away" metric={data.declined} format="count" tone="orange" lowerIsBetter />
      </div>

      <div className="mt-4">
        <RecentOrders orders={data.recent} currency={menu.currency} now={now} />
      </div>
    </>
  );
}
