"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LAST_STADIUM_KEY, shortcutPath } from "@/lib/pwa/last-stadium";

/** Home-screen shortcuts open `/?go=menu` or `/?go=orders`; send them on to the venue this phone used last. */
export function ShortcutRedirect({ slugs }: { slugs: string[] }) {
  const router = useRouter();
  useEffect(() => {
    let last: string | null = null;
    try {
      last = window.localStorage.getItem(LAST_STADIUM_KEY);
    } catch {
      /* private mode */
    }
    const path = shortcutPath(new URLSearchParams(window.location.search).get("go"), last, slugs);
    if (path) router.replace(path);
  }, [router, slugs]);
  return null;
}
