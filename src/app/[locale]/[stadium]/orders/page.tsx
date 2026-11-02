import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { api } from "@/server/trpc/server";
import { OrderHistory } from "@/components/shop/order-history";
import { catalogFromProducts } from "@/lib/menu/catalog";

type Props = { params: Promise<{ stadium: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stadium } = await params;
  const menu = await api.stadium.menu({ slug: stadium });
  const t = await getTranslations("history");
  if (!menu) return { title: t("title") };
  return {
    title: `${t("title")} · ${menu.name}`,
    description: t("description", { name: menu.name }),
  };
}

export default function OrdersPage(props: Props) {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-md px-4 pt-6 text-[15px] text-muted">Loading…</main>}>
      <OrdersBody {...props} />
    </Suspense>
  );
}

async function OrdersBody({ params }: Props) {
  const { stadium: slug } = await params;
  const menu = await api.stadium.menu({ slug });
  if (!menu) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-6">
      <OrderHistory stadiumSlug={menu.slug} currency={menu.currency} catalog={catalogFromProducts(menu.products)} />
    </main>
  );
}
