import type { Locale } from "@/i18n/config";

/** ISO 3166-1-alpha-2 codes used by flag-icons. English uses GB (shared en locale). */
export function localeFlag(locale: Locale): string {
  if (locale === "sv") return "se";
  if (locale === "da") return "dk";
  return "gb";
}

/** Primary country/region flag for a checkout currency code. */
export function currencyFlag(currency: string): string {
  switch (currency.toUpperCase()) {
    case "EUR":
      return "eu";
    case "SEK":
      return "se";
    case "NOK":
      return "no";
    case "DKK":
      return "dk";
    case "GBP":
      return "gb";
    case "CHF":
      return "ch";
    case "USD":
      return "us";
    default:
      return "eu";
  }
}
