"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

// First pathname rendered in this tab, and whether a client navigation has left it since.
let firstPath: string | null = null;
let navigated = false;

/**
 * Whether a component should play its entrance animation.
 *
 * Server render + hydration → false, so the SSR HTML is visible immediately
 * (framer would otherwise ship `opacity: 0` in the markup and the page would be
 * blank until JS arrives — bad on stadium connections). Pages reached by a
 * client navigation → true.
 *
 * Keyed on the pathname rather than "has anything mounted yet": streamed
 * Suspense content hydrates after the root has mounted, but always on the
 * pathname the HTML was rendered for.
 */
export function useEntrance(): boolean {
  const pathname = usePathname();
  const [animate] = useState(() => {
    if (typeof window === "undefined") return false;
    firstPath ??= pathname;
    if (pathname !== firstPath) navigated = true;
    return navigated;
  });
  return animate;
}
