import type { ReactNode } from "react";
import { ShopNav } from "@/components/shop/shop-nav";

type Props = {
  children: ReactNode;
  params: Promise<{ stadium: string }>;
};

export default async function StadiumLayout({ children, params }: Props) {
  const { stadium } = await params;
  return (
    <>
      {children}
      <ShopNav stadiumSlug={stadium} />
    </>
  );
}
