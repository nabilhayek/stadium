import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, type Locale } from "./config";

async function loadMessages(locale: Locale) {
  switch (locale) {
    case "sv":
      return (await import("../../messages/sv.json")).default;
    case "da":
      return (await import("../../messages/da.json")).default;
    case "en":
      return (await import("../../messages/en.json")).default;
  }
}

/** The locale comes from the `[locale]` segment, which `src/proxy.ts` fills in from the cookie or the device language. */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : defaultLocale;

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
