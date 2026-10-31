"use client";

import { LOCALE_COOKIE, LOCALE_STORAGE_KEY, locales } from "@/i18n/config";

const allowed = locales.map((locale) => JSON.stringify(locale)).join(",");

/**
 * localStorage is the remembered choice. The server cannot see it, so if it
 * disagrees with the rendered locale we write the cookie and load once more.
 * sessionStorage stops a reload loop when cookies are blocked.
 */
const source = `(function(){try{var saved=localStorage.getItem(${JSON.stringify(LOCALE_STORAGE_KEY)});var ok=[${allowed}];if(ok.indexOf(saved)<0)return;if(saved===document.documentElement.getAttribute("data-locale"))return;if(sessionStorage.getItem("locale-boot")===saved)return;sessionStorage.setItem("locale-boot",saved);var secure=location.protocol==="https:"?";secure":"";document.cookie=${JSON.stringify(LOCALE_COOKIE)}+"="+saved+";path=/;max-age=31536000;samesite=lax"+secure;location.replace(location.href);}catch(e){}})();`;

/** Runs while the HTML parses. On the client React would warn about rendering a script, so it renders inert text instead. */
export function LocaleBoot() {
  return <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: source }} />;
}
