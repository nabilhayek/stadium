import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { DeskNav } from "@/components/management/desk-nav";
import { kitchenSession } from "@/lib/management/session";
import { getStadiumMenu } from "@/lib/queries/stadium";

type Props = { children: ReactNode; params: Promise<{ stadium: string }> };

export default async function DeskLayout({ children, params }: Props) {
  const { stadium } = await params;
  const menu = await getStadiumMenu(stadium);
  if (!menu) notFound();
  const session = await kitchenSession();
  if (!session) redirect(`/${menu.slug}/management/login`);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <DeskNav stadiumSlug={menu.slug} stadiumName={menu.name} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
