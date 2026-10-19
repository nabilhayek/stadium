import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductsManager } from "@/components/management/products/products-manager";
import { requireKitchen } from "@/lib/management/session";
import { api } from "@/server/trpc/server";

type Props = { params: Promise<{ stadium: string }> };

export const metadata: Metadata = { title: "Products" };

export default async function ManagementProductsPage({ params }: Props) {
  const { stadium } = await params;
  await requireKitchen(stadium);
  const catalog = await api.products.list({ stadium });
  if (!catalog) notFound();

  return <ProductsManager stadiumSlug={stadium} catalog={catalog} />;
}
