import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStadiumMenu } from "@/lib/queries/stadium";
import { OrderPage } from "@/components/checkout/order-page";
import { catalogFromVendors, drinksFromCatalog } from "@/lib/menu/catalog";
import { isOrderNumber } from "@/lib/orders/receipt";

type Props = { params: Promise<{ stadium: string; orderNumber: string }> };

export const revalidate = 60;
export const dynamicParams = true;

function readNumber(raw: string) {
  const decoded = decodeURIComponent(raw).toUpperCase();
  return isOrderNumber(decoded) ? decoded : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stadium, orderNumber } = await params;
  const number = readNumber(orderNumber) ?? "";
  const menu = await getStadiumMenu(stadium);
  if (!menu) return { title: `Order ${number}` };
  return {
    title: `Order ${number} · ${menu.name}`,
    description: `Track or review order ${number} at ${menu.name}.`,
    robots: { index: false },
  };
}

/**
 * Canonical order URL. The page itself is cacheable; the receipt is resolved on
 * the phone (local storage first, then the API) so the same address works for
 * the live tracker, a past receipt, and a link opened on another device.
 */
export default async function OrderNumberPage({ params }: Props) {
  const { stadium: slug, orderNumber } = await params;
  const number = readNumber(orderNumber);
  if (!number) notFound();

  const menu = await getStadiumMenu(slug);
  if (!menu) notFound();

  const catalog = catalogFromVendors(menu.vendors);

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-6">
      <OrderPage
        stadiumSlug={menu.slug}
        orderNumber={number}
        currency={menu.currency}
        catalog={catalog}
        drinks={drinksFromCatalog(catalog, menu.categories)}
      />
    </main>
  );
}
