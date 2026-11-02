"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LanguageSelectorDropdown } from "@/components/ui/language-selector-dropdown";
import { locales, localeCookie, LOCALE_STORAGE_KEY, type Locale } from "@/i18n/config";
import { localeFlag } from "@/lib/flag-codes";

type Props = {
  tone: "shop" | "desk";
  /** @deprecated Kept for call sites. All layouts use the pill dropdown. */
  layout?: "grid" | "select";
  fullWidth?: boolean;
  menuSide?: "top" | "bottom";
  align?: "start" | "end";
  className?: string;
};

export function LanguageField({ tone, className, fullWidth, menuSide, align }: Props) {
  const t = useTranslations("language");
  const current = useLocale() as Locale;
  const setLocale = useSetLocale();
  const options = locales.map((code) => ({ code, label: t(code), flagCode: localeFlag(code) }));

  return (
    <LanguageSelectorDropdown
      tone={tone}
      value={current}
      onChange={(code) => setLocale(code as Locale)}
      options={options}
      aria-label={t("label")}
      fullWidth={fullWidth}
      menuSide={menuSide}
      align={align}
      className={className}
    />
  );
}

function useSetLocale() {
  const router = useRouter();
  const current = useLocale();

  return (locale: Locale) => {
    if (!locales.includes(locale) || locale === current) return;
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    sessionStorage.removeItem("locale-boot");
    document.cookie = localeCookie(locale, window.location.protocol === "https:");
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
    router.refresh();
  };
}
