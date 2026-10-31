export const locales = ["sv", "da", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Cookie the server reads. The explicit choice is also stored in localStorage. */
export const LOCALE_COOKIE = "locale";

export const LOCALE_STORAGE_KEY = "locale";

const YEAR = 60 * 60 * 24 * 365;

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "sv" || value === "da" || value === "en";
}

/** Pick sv, da, or en from an Accept-Language header. Anything else is English. */
export function matchAcceptLanguage(header: string | null): Locale {
  if (!header) return defaultLocale;

  const ranked = header
    .split(",")
    .map((part) => {
      const [rawTag, ...params] = part.trim().split(";");
      const qParam = params.find((param) => param.trim().toLowerCase().startsWith("q="));
      const q = qParam ? Number(qParam.trim().slice(2)) : 1;
      return { tag: rawTag.toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((item) => item.tag.length > 0 && item.tag !== "*")
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const primary = tag.split("-")[0];
    if (isLocale(primary)) return primary;
  }

  return defaultLocale;
}

export function localeCookie(locale: Locale, secure: boolean) {
  return `${LOCALE_COOKIE}=${locale};path=/;max-age=${YEAR};samesite=lax${secure ? ";secure" : ""}`;
}
