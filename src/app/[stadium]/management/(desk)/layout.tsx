import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { DeskShell } from "@/components/management/desk-shell";
import { requireKitchen } from "@/lib/management/session";
import { api } from "@/server/trpc/server";

type Props = { children: ReactNode; params: Promise<{ stadium: string }> };

export default async function DeskLayout({ children, params }: Props) {
  const { stadium } = await params;
  const menu = await api.stadium.menu({ slug: stadium });
  if (!menu) notFound();
  const session = await requireKitchen(menu.slug);
  const { board, waiting } = await api.kitchen.summary({ stadium: menu.slug });

  return (
    <DeskShell stadiumSlug={menu.slug} stadiumName={menu.name} email={session.user.email} board={board} waiting={waiting}>
      {children}
    </DeskShell>
  );
}
