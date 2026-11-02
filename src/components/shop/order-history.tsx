"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { m } from "framer-motion";
import { useMounted, useStorageValue } from "@/lib/hooks/use-storage";
import { formatCents } from "@/lib/money";
import { isOrderLive, parseReceipt, receiptKey, statusKey, type Receipt } from "@/lib/orders/receipt";
import { useTranslations } from "next-intl";
import { formatOrderWhen, lineCount, parsePastOrders, pastOrdersKey, recordPastOrder } from "@/lib/orders/past";
import { restoreDeviceHistory } from "@/lib/orders/sync";
import { formatSeat } from "@/lib/seat/store";
import { useNow } from "@/lib/hooks/use-now";
import { fadeUp, stagger } from "@/components/motion/variants";
import { BackLink } from "@/components/ui/back-link";
import { SameAgain } from "./same-again";
import type { CatalogItem } from "@/lib/menu/catalog";

type Props = { stadiumSlug: string; currency: string; catalog: CatalogItem[] };

export function OrderHistory({ stadiumSlug, currency, catalog }: Props) {
  const t = useTranslations("history");
  const mounted = useMounted();
  const now = useNow(30_000);
  const pastRaw = useStorageValue("local", pastOrdersKey(stadiumSlug));
  const liveRaw = useStorageValue("session", receiptKey(stadiumSlug));

  const live = useMemo(() => parseReceipt(liveRaw), [liveRaw]);
  const past = useMemo(() => parsePastOrders(pastRaw), [pastRaw]);

  useEffect(() => {
    if (live && !past.some((o) => o.orderNumber === live.orderNumber)) {
      recordPastOrder(live);
    }
  }, [live, past]);

  // Local first: the list above renders straight from storage. Then ask the
  // server once for anything this phone placed but no longer has.
  const [restoring, setRestoring] = useState(false);
  const restored = useRef(false);
  useEffect(() => {
    if (!mounted || restored.current) return;
    restored.current = true;
    setRestoring(true);
    void restoreDeviceHistory(stadiumSlug).finally(() => setRestoring(false));
  }, [mounted, stadiumSlug]);

  const orders = useMemo(() => {
    if (!live) return past;
    if (past.some((o) => o.orderNumber === live.orderNumber)) return past;
    return [live, ...past];
  }, [live, past]);

  if (!mounted) return null;

  return (
    <m.div variants={stagger(0.07, 0.08)} initial="hidden" animate="show" className="flex flex-col gap-6 pb-16">
      <m.header variants={fadeUp} className="pr-12">
        <BackLink href={`/${stadiumSlug}`}>{t("back")}</BackLink>
        <h1 className="font-display mt-3 text-[28px] font-semibold leading-none tracking-[-0.03em]">{t("title")}</h1>
        <p className="mt-2 text-[15px] text-muted">{t("lead")}</p>
      </m.header>

      {orders.length === 0 ? (
        <m.div variants={fadeUp} className="rounded-[20px] border border-border bg-surface px-5 py-10 text-center">
          {restoring ? (
            <p className="text-[15px] font-medium" role="status">
              {t("checking")}
            </p>
          ) : (
            <>
              <p className="text-[15px] font-medium">{t("empty")}</p>
              <p className="mt-1 text-[13px] text-muted">{t("emptyHint")}</p>
              <Link href={`/${stadiumSlug}`} className="button button--primary button--md mt-6 inline-flex">
                {t("orderSomething")}
              </Link>
            </>
          )}
        </m.div>
      ) : (
        <m.ul variants={fadeUp} className="flex flex-col gap-2">
          {orders.map((order) => (
            <HistoryRow
              key={order.orderNumber}
              order={order}
              stadiumSlug={stadiumSlug}
              currency={order.currency ?? currency}
              catalog={catalog}
              now={now}
              tracking={live?.orderNumber === order.orderNumber && isOrderLive(order, now)}
            />
          ))}
        </m.ul>
      )}
    </m.div>
  );
}

function HistoryRow({
  order,
  stadiumSlug,
  currency,
  catalog,
  now,
  tracking,
}: {
  order: Receipt;
  stadiumSlug: string;
  currency: string;
  catalog: CatalogItem[];
  now: number;
  tracking: boolean;
}) {
  const t = useTranslations("history");
  const tracker = useTranslations("tracker");
  const href = `/${stadiumSlug}/order/${encodeURIComponent(order.orderNumber)}`;
  const count = lineCount(order);
  const status = order.kitchenStatus === "declined" ? t("declined") : isOrderLive(order, now) ? tracker(statusKey(order, now)) : t("completed");

  return (
    <li className="rounded-[20px] border border-border bg-surface">
      <Link href={href} className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-surface-secondary">
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium">{t("order", { order: order.orderNumber })}</span>
          <span className="mt-0.5 block truncate text-[13px] text-muted">
            {formatOrderWhen(order.paidAt)}
            {order.seat ? ` · ${formatSeat(order.seat)}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[13px] font-medium tabular-nums">
            {order.totalCents != null ? formatCents(order.totalCents, currency) : t("items", { count })}
          </span>
          <span className="mt-0.5 block text-[12px] text-muted">{status}</span>
        </span>
      </Link>
      {!tracking ? (
        <div className="border-t border-separator px-4 py-3">
          <SameAgain order={order} catalog={catalog} />
        </div>
      ) : null}
    </li>
  );
}
