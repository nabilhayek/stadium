import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { LanguageField } from "@/components/i18n/language-field";
import { TwoFactorPanel } from "@/components/management/two-factor-panel";
import { withDb } from "@/lib/db";
import { requireKitchen } from "@/lib/management/session";
import { roleNeedsTwoFactor } from "@/lib/two-factor-policy";
import { api } from "@/server/trpc/server";

type Props = { params: Promise<{ locale: Locale; stadium: string }>; searchParams: Promise<{ required?: string }> };

/** Reads the staff session, so it stays request-fresh. Lives outside the desk layout so a required setup can't redirect-loop. */
export const instant = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "security" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function SecurityPage({ params, searchParams }: Props) {
  const { locale, stadium } = await params;
  const { required } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("security");
  const menu = await api.stadium.menu({ slug: stadium });
  if (!menu) notFound();
  const session = await requireKitchen(menu.slug);
  const locked = await withDb((db) => roleNeedsTwoFactor(db, session.user));
  const enabled = Boolean((session.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <LanguageField tone="shop" className="w-fit" />
      </div>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{menu.name}</p>
      <h1 className="font-display mt-2 text-[32px] font-semibold leading-[0.95] tracking-[-0.045em]">{t("title")}</h1>
      <div className="mt-6 rounded-[28px] border border-border bg-surface p-5">
        <TwoFactorPanel stadiumSlug={menu.slug} enabled={enabled} locked={locked} required={required === "1" || locked} />
      </div>
    </main>
  );
}
