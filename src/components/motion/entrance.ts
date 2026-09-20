"use client";

import { useEffect, useState } from "react";

// Flips to true after the first hydrated mount in this tab.
let hydratedOnce = false;

/**
 * Whether a component should play its entrance animation.
 *
 * Server render + hydration → false, so the SSR HTML is visible immediately
 * (framer would otherwise ship `opacity: 0` in the markup and the page would be
 * blank until JS arrives — bad on stadium connections). Client navigations and
 * anything mounted afterwards → true.
 */
export function useEntrance(): boolean {
  const [animate] = useState(() => hydratedOnce);
  useEffect(() => {
    hydratedOnce = true;
  }, []);
  return animate;
}
