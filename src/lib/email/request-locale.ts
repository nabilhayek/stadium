import { defaultLocale, isLocale, matchAcceptLanguage, type Locale } from "@/i18n/config";

/** Language for an email, from the desk or shop cookie, else the browser language. */
export function localeFromRequest(request?: Request | null): Locale {
  if (!request) return defaultLocale;
  const cookie = request.headers.get("cookie") ?? "";
  const saved = /(?:^|;\s*)locale=(sv|da|en)(?:;|$)/.exec(cookie)?.[1];
  if (isLocale(saved)) return saved;
  return matchAcceptLanguage(request.headers.get("accept-language"));
}

export function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
