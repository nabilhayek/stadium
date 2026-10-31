"use client";

import { usePathname as useNextPathname } from "next/navigation";
import { useLocale } from "next-intl";

/**
 * The address-bar path, without the `[locale]` segment the proxy adds.
 * Next's own hook reads `/en/arena` on the server and `/arena` in the browser.
 */
export function usePathname() {
  const pathname = useNextPathname();
  const locale = useLocale();
  if (pathname === `/${locale}`) return "/";
  return pathname.startsWith(`/${locale}/`) ? pathname.slice(locale.length + 1) : pathname;
}
