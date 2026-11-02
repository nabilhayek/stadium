import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { DeskShell } from "@/components/management/desk-shell";
import { kitchenBadge, requireKitchen } from "@/lib/management/session";
import { twoFactorRequired } from "@/lib/management/two-factor";
import { api } from "@/server/trpc/server";

type Props = { children: ReactNode; params: Promise<{ stadium: string }> };

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The desk reads the staff session and the live board. Those stay request-fresh. */
export const instant = false;

export default function DeskLayout({ children, params }: Props) {
  return (
    <Suspense fallback={null}>
      <DeskLayoutBody params={params}>{children}</DeskLayoutBody>
    </Suspense>
  );
}

async function DeskLayoutBody({ children, params }: Props) {
  const { stadium } = await params;
  const menu = await api.stadium.menu({ slug: stadium });
  if (!menu) notFound();
  const session = await requireKitchen(menu.slug);
  // Admins and Managers must set up an authenticator before the desk opens. That page sits outside this layout.
  if (await twoFactorRequired(session.user)) redirect(`/${menu.slug}/management/security?required=1`);
  const badge = await kitchenBadge();
  const { board, waiting } = await api.kitchen.summary({ stadium: menu.slug });

  return (
    <DeskShell stadiumSlug={menu.slug} stadiumName={menu.name} email={badge?.email ?? session.user.email} board={board} waiting={waiting}>
      {children}
    </DeskShell>
  );
}
