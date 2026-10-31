import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { api } from "@/server/trpc/server";
import { OrderView } from "@/components/checkout/order-view";

type Props = { params: Promise<{ stadium: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stadium } = await params;
  const menu = await api.stadium.menu({ slug: stadium });
  if (!menu) return { title: "Your order" };
  return {
    title: `Your order · ${menu.name}`,
    description: `Track your order at ${menu.name}.`,
  };
}

export default function OrderIndexPage(props: Props) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-md px-4 pt-6 text-[15px] text-muted">Loading…</main>}>
      <OrderIndexBody {...props} />
    </Suspense>
  );
}

async function OrderIndexBody({ params }: Props) {
  const { stadium: slug } = await params;
  const menu = await api.stadium.menu({ slug });
  if (!menu) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-6">
      <OrderView stadiumSlug={menu.slug} />
    </main>
  );
}
