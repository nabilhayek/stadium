import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/legal-document";
import { isLocale } from "@/i18n/config";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return { title: "Privacy" };
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("privacyTitle"), description: t("privacyLead") };
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  return <LegalDocument locale={locale} titleKey="privacyTitle" leadKey="privacyLead" sectionsKey="privacySections" />;
}
