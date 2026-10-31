import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminConsole } from "@/components/management/admin/admin-console";
import { getPublishedSeatMap, getSeatMap } from "@/lib/management/seat-map";
import { requireKitchen } from "@/lib/management/session";
import { api } from "@/server/trpc/server";

type Props = { params: Promise<{ stadium: string }> };

export const metadata: Metadata = { title: "Admin" };
export const instant = false;

export default async function ManagementAdminPage({ params }: Props) {
  const { stadium } = await params;
  await requireKitchen(stadium);
  const menu = await api.stadium.menu({ slug: stadium });
  if (!menu) notFound();
  const doc = (await getPublishedSeatMap(stadium)) ?? (await getSeatMap(stadium))?.draft;
  const settings = await api.admin.get({ stadium });
  if (!doc || !settings) notFound();

  return <AdminConsole stadiumSlug={menu.slug} stadiumName={menu.name} doc={doc} settings={settings} />;
}
