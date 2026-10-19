import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/server/trpc/server";
import { OrderView } from "@/components/checkout/order-view";

type Props = { params: Promise<{ stadium: string }> };

export const revalidate = 60;
export const dynamicParams = true;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stadium } = await params;
  const menu = await api.stadium.menu({ slug: stadium });
  if (!menu) return { title: "Your order" };
  return {
    title: `Your order · ${menu.name}`,
    description: `Track your order at ${menu.name}.`,
  };
}

export default async function OrderIndexPage({ params }: Props) {
  const { stadium: slug } = await params;
  const menu = await api.stadium.menu({ slug });
  if (!menu) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-6">
      <OrderView stadiumSlug={menu.slug} />
    </main>
  );
}
