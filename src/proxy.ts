import { NextResponse, type NextRequest } from "next/server";
import { LOCALE_COOKIE, isLocale, matchAcceptLanguage } from "@/i18n/config";

/**
 * URLs carry no language (/arena stays /arena). The saved choice, else the
 * device language, picks which static copy under `app/[locale]` is served.
 * An explicit /sv/arena is served as is, so share links can pin a language.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isLocale(pathname.split("/")[1])) return NextResponse.next();

  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : matchAcceptLanguage(request.headers.get("accept-language"));
  return NextResponse.rewrite(new URL(`/${locale}${pathname === "/" ? "" : pathname}${search}`, request.url));
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|monitoring|\\.well-known|__nextjs|.*\\..*).*)"],
};
