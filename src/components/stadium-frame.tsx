"use client";

import { usePathname } from "@/i18n/navigation";
import { ShopNav } from "@/components/shop/shop-nav";
import { LiveOrders } from "@/components/orders/live-orders";
import { OrderSync } from "@/components/orders/order-sync";

type Props = { stadiumSlug: string };

/** Shop chrome stays off the kitchen desk. */
export function StadiumFrame({ stadiumSlug }: Props) {
  const pathname = usePathname();
  if (pathname.includes("/management")) return null;
  return (
    <>
      <ShopNav stadiumSlug={stadiumSlug} />
      <OrderSync />
      <LiveOrders stadiumSlug={stadiumSlug} />
    </>
  );
}
