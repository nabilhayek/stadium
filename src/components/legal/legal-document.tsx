import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";

type Section = { heading: string; body: string };

type Props = {
  locale: string;
  titleKey: "privacyTitle" | "termsTitle" | "venuesTitle";
  leadKey: "privacyLead" | "termsLead" | "venuesLead";
  sectionsKey: "privacySections" | "termsSections" | "venueSections";
};

export async function LegalDocument({ locale, titleKey, leadKey, sectionsKey }: Props) {
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "legal" });
  const sections = t.raw(sectionsKey) as Section[];

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-8 pb-16">
      <h1 className="font-display text-[32px] font-semibold leading-none tracking-[-0.04em]">{t(titleKey)}</h1>
      <p className="mt-2 text-[13px] text-muted">{t("updated")}</p>
      <p className="mt-4 text-[15px] leading-snug">{t(leadKey)}</p>
      <div className="mt-6 flex flex-col gap-5">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-[15px] font-medium">{section.heading}</h2>
            <p className="mt-1 text-[14px] leading-snug text-muted">{section.body}</p>
          </section>
        ))}
      </div>
      <nav className="mt-8 flex flex-col gap-2 text-[14px]">
        <Link href="/privacy" className="text-link">
          {t("privacyLink")}
        </Link>
        <Link href="/terms" className="text-link">
          {t("termsLink")}
        </Link>
        <Link href="/venues/data" className="text-link">
          {t("venuesLink")}
        </Link>
      </nav>
    </main>
  );
}
