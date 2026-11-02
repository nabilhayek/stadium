import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/legal/legal-document";
import { isLocale } from "@/i18n/config";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return { title: "Data" };
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("venuesTitle"), description: t("venuesLead") };
}

export default async function VenueDataPage({ params }: Props) {
  const { locale } = await params;
  return <LegalDocument locale={locale} titleKey="venuesTitle" leadKey="venuesLead" sectionsKey="venueSections" />;
}
