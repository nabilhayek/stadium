import type { Metadata } from "next";
import Link from "next/link";
import { formatCents } from "@/lib/money";
import { STATUS_LABELS } from "@/lib/management/board";
import { deskStats } from "@/lib/management/orders";
import type { KitchenStatus } from "@/lib/orders/receipt";
import { getStadiumMenu } from "@/lib/queries/stadium";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ stadium: string }> };

export const metadata: Metadata = { title: "Kitchen overview" };

export default async function ManagementOverview({ params }: Props) {
  const { stadium } = await params;
  const menu = await getStadiumMenu(stadium);
  if (!menu) notFound();
  const stats = await deskStats(stadium);
  const peak = Math.max(1, ...stats.hours.map((h) => h.count));

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Orders today" value={String(stats.todayCount)} />
        <Stat label="On the board" value={String(stats.openCount)} />
        <Stat label="Revenue today" value={formatCents(stats.todayCents, menu.currency)} />
        <Stat label="Average ticket" value={formatCents(stats.averageCents, menu.currency)} />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[24px] border border-border bg-surface p-5">
          <h2 className="text-[15px] font-medium">Orders by hour</h2>
          <p className="mt-0.5 text-[13px] text-muted">Paid orders since midnight.</p>
          {stats.hours.length === 0 ? (
            <p className="mt-8 text-[14px] text-muted">Nothing paid yet today.</p>
          ) : (
            <div className="mt-5 flex h-40 items-end gap-2">
              {stats.hours.map((bar) => (
                <div key={bar.hour} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="flex h-32 w-full items-end">
                    <div
                      className="w-full rounded-t-xl bg-foreground"
                      style={{ height: `${Math.max(8, (bar.count / peak) * 100)}%` }}
                      title={`${bar.count} orders`}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums text-muted">{hourLabel(bar.hour)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[24px] border border-border bg-surface p-5">
          <h2 className="text-[15px] font-medium">Today by status</h2>
          <ul className="mt-4 flex flex-col gap-2">
            {(Object.keys(STATUS_LABELS) as KitchenStatus[]).map((status) => (
              <li key={status} className="flex items-center justify-between text-[14px]">
                <span>{STATUS_LABELS[status]}</span>
                <span className="font-medium tabular-nums">{stats.byStatus[status]}</span>
              </li>
            ))}
          </ul>
          <Link href={`/${stadium}/management/orders`} className="button button--primary button--lg mt-5 w-full text-center">
            Open active orders
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-border bg-surface px-5 py-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="font-display mt-2 text-[28px] font-semibold leading-none tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

function hourLabel(hour: number) {
  const h = hour % 12 || 12;
  return `${h}${hour < 12 ? "a" : "p"}`;
}
