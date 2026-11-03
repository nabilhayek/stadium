import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductsManager } from "@/components/management/products/products-manager";
import { requireVenue } from "@/lib/management/session";
import { api } from "@/server/trpc/server";

type Props = { params: Promise<{ stadium: string }> };

export const metadata: Metadata = { title: "Products" };
export const instant = false;

export default async function ManagementProductsPage({ params }: Props) {
  const { stadium } = await params;
  await requireVenue(stadium, "menu.edit");
  const catalog = await api.products.list({ stadium });
  if (!catalog) notFound();

  return <ProductsManager stadiumSlug={stadium} catalog={catalog} />;
}
