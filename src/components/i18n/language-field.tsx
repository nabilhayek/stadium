"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { locales, localeCookie, LOCALE_STORAGE_KEY, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

type Props = {
  tone: "shop" | "desk";
  layout?: "grid" | "select";
};

export function LanguageField({ tone, layout = "grid" }: Props) {
  const t = useTranslations("language");
  const current = useLocale();
  const setLocale = useSetLocale();

  if (layout === "select") {
    return (
      <select
        aria-label={t("label")}
        value={current}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="h-8 rounded-lg border border-neutral-200 bg-white px-2 text-[13px] text-neutral-700"
      >
        {locales.map((code) => (
          <option key={code} value={code}>
            {t(code)}
          </option>
        ))}
      </select>
    );
  }

  const shop = tone === "shop";

  return (
    <div role="radiogroup" aria-label={t("label")} className="grid grid-cols-3 gap-1.5">
      {locales.map((code) => {
        const selected = current === code;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setLocale(code)}
            className={cn(
              "min-h-9 rounded-xl px-2 text-[13px] font-medium transition-colors",
              shop
                ? selected
                  ? "bg-foreground text-background"
                  : "bg-surface-secondary text-foreground"
                : selected
                  ? "bg-neutral-900 text-white"
                  : "border border-neutral-200 bg-white text-neutral-600 hover:text-neutral-900",
            )}
          >
            {t(code)}
          </button>
        );
      })}
    </div>
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
