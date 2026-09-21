import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStadiumMenu } from "@/lib/queries/stadium";
import { OrderView } from "@/components/checkout/order-view";
import { catalogFromVendors, drinksFromCatalog } from "@/lib/menu/catalog";

type Props = { params: Promise<{ stadium: string }> };

export const revalidate = 60;
export const dynamicParams = true;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stadium } = await params;
  const menu = await getStadiumMenu(stadium);
  if (!menu) return { title: "Your order" };
  return {
    title: `Your order · ${menu.name}`,
    description: `Track your order at ${menu.name}.`,
  };
}

export default async function OrderPage({ params }: Props) {
  const { stadium: slug } = await params;
  const menu = await getStadiumMenu(slug);
  if (!menu) notFound();

  const catalog = catalogFromVendors(menu.vendors);
  const drinks = drinksFromCatalog(catalog, menu.categories);

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-6">
      <OrderView stadiumSlug={menu.slug} drinks={drinks} />
    </main>
  );
}
