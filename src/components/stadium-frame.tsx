"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ShopNav } from "@/components/shop/shop-nav";
import { OrderSync } from "@/components/orders/order-sync";

type Props = { stadiumSlug: string; children: ReactNode };

/** Shop chrome stays off the kitchen desk. */
export function StadiumFrame({ stadiumSlug, children }: Props) {
  const pathname = usePathname();
  const desk = pathname.includes("/management");
  return (
    <>
      {children}
      {desk ? null : (
        <>
          <ShopNav stadiumSlug={stadiumSlug} />
          <OrderSync />
        </>
      )}
    </>
  );
}
