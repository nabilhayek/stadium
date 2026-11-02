import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { LanguageField } from "@/components/i18n/language-field";
import { LoginForm } from "@/components/management/login-form";
import { authPrisma } from "@/lib/auth";
import { kitchenSession } from "@/lib/management/session";
import { api } from "@/server/trpc/server";

type Props = { params: Promise<{ locale: Locale; stadium: string }> };

/** Sign-in reads the session cookie so a signed-in cook is redirected. That stays request-fresh. */
export const instant = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "login" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function KitchenLoginPage({ params }: Props) {
  const { locale, stadium } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("login");
  const menu = await api.stadium.menu({ slug: stadium });
  if (!menu) notFound();

  const session = await kitchenSession();
  if (session) redirect(`/${menu.slug}/management`);

  const users = await authPrisma.user.count();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <LanguageField tone="shop" className="w-fit" />
      </div>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{t("eyebrow")}</p>
      <h1 className="font-display mt-2 text-[32px] font-semibold leading-[0.95] tracking-[-0.045em]">{menu.name}</h1>
      <p className="mt-2 text-[15px] text-muted">{users === 0 ? t("createFirst") : t("signInLead")}</p>
      <div className="mt-6 rounded-[28px] border border-border bg-surface p-5">
        <LoginForm stadiumSlug={menu.slug} canRegister={users === 0} />
      </div>
    </main>
  );
}
