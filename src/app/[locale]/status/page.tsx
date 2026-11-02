import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { StatusLight } from "@/components/status/status-light";
import { isLocale } from "@/i18n/config";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return { title: "Status" };
  const t = await getTranslations({ locale, namespace: "status" });
  return { title: t("title"), description: t("lead") };
}

export default async function StatusPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "status" });

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-8 pb-16">
      <h1 className="font-display text-[32px] font-semibold leading-none tracking-[-0.04em]">{t("title")}</h1>
      <p className="mt-3 text-[15px] leading-snug text-muted">{t("lead")}</p>
      <StatusLight checking={t("checking")} ok={t("ok")} down={t("down")} />
      <p className="mt-4 text-[13px] leading-snug text-muted">{t("hint")}</p>
    </main>
  );
}
