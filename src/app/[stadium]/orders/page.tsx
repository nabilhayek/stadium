import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStadiumMenu } from "@/lib/queries/stadium";
import { OrderHistory } from "@/components/shop/order-history";
import { catalogFromVendors } from "@/lib/menu/catalog";

type Props = { params: Promise<{ stadium: string }> };

export const revalidate = 60;
export const dynamicParams = true;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stadium } = await params;
  const menu = await getStadiumMenu(stadium);
  if (!menu) return { title: "Order history" };
  return {
    title: `Order history · ${menu.name}`,
    description: `Past orders at ${menu.name}.`,
  };
}

export default async function OrdersPage({ params }: Props) {
  const { stadium: slug } = await params;
  const menu = await getStadiumMenu(slug);
  if (!menu) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-6">
      <OrderHistory stadiumSlug={menu.slug} currency={menu.currency} catalog={catalogFromVendors(menu.vendors)} />
    </main>
  );
}
