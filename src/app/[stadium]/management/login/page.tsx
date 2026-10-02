import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LoginForm } from "@/components/management/login-form";
import { authPrisma } from "@/lib/auth";
import { kitchenSession } from "@/lib/management/session";
import { getStadiumMenu } from "@/lib/queries/stadium";

type Props = { params: Promise<{ stadium: string }> };

export const metadata: Metadata = { title: "Kitchen sign in" };

export default async function KitchenLoginPage({ params }: Props) {
  const { stadium } = await params;
  const menu = await getStadiumMenu(stadium);
  if (!menu) notFound();

  const session = await kitchenSession();
  if (session) redirect(`/${menu.slug}/management`);

  const users = await authPrisma.user.count();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Kitchen</p>
      <h1 className="font-display mt-2 text-[32px] font-semibold leading-[0.95] tracking-[-0.045em]">
        {menu.name}
      </h1>
      <p className="mt-2 text-[15px] text-muted">
        {users === 0 ? "Create the first kitchen account to open the desk." : "Sign in to run the desk."}
      </p>
      <div className="mt-6 rounded-[28px] border border-border bg-surface p-5">
        <LoginForm stadiumSlug={menu.slug} canRegister={users === 0} />
      </div>
    </main>
  );
}
