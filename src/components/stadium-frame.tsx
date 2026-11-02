"use client";

import { useEffect } from "react";
import { trackFunnel } from "@/lib/analytics";
import { usePathname } from "@/i18n/navigation";
import { writeStorage } from "@/lib/hooks/use-storage";
import { LAST_STADIUM_KEY } from "@/lib/pwa/last-stadium";
import { ShopNav } from "@/components/shop/shop-nav";
import { LiveOrders } from "@/components/orders/live-orders";
import { OrderSync } from "@/components/orders/order-sync";

type Props = { stadiumSlug: string; currency: string | null };

/** Shop chrome stays off the kitchen desk. */
export function StadiumFrame({ stadiumSlug, currency }: Props) {
  const pathname = usePathname();
  const desk = pathname.includes("/management");
  useEffect(() => {
    if (!desk) writeStorage("local", LAST_STADIUM_KEY, stadiumSlug);
  }, [desk, stadiumSlug]);
  useEffect(() => {
    if (!desk) trackFunnel("shop_opened", stadiumSlug);
  }, [desk, stadiumSlug]);
  if (desk) return null;
  return (
    <>
      <ShopNav stadiumSlug={stadiumSlug} currency={currency} />
      <OrderSync />
      <LiveOrders stadiumSlug={stadiumSlug} />
    </>
  );
}
