import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStadiumMenu } from "@/lib/queries/stadium";
import { OrderReceipt } from "@/components/shop/order-receipt";
import { catalogFromVendors } from "@/lib/menu/catalog";

type Props = { params: Promise<{ stadium: string; orderNumber: string }> };

export const revalidate = 60;
export const dynamicParams = true;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stadium, orderNumber } = await params;
  const menu = await getStadiumMenu(stadium);
  const decoded = decodeURIComponent(orderNumber);
  if (!menu) return { title: `Order ${decoded}` };
  return {
    title: `Order ${decoded} · ${menu.name}`,
    description: `Receipt for ${decoded} at ${menu.name}.`,
  };
}

export default async function OrderReceiptPage({ params }: Props) {
  const { stadium: slug, orderNumber } = await params;
  const menu = await getStadiumMenu(slug);
  if (!menu) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-6">
      <OrderReceipt
        stadiumSlug={menu.slug}
        orderNumber={decodeURIComponent(orderNumber)}
        currency={menu.currency}
        catalog={catalogFromVendors(menu.vendors)}
      />
    </main>
  );
}
