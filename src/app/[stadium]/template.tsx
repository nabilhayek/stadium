"use client";

import { m } from "framer-motion";
import type { ReactNode } from "react";
import { useEntrance } from "@/components/motion/entrance";
import { EASE } from "@/components/motion/variants";

/**
 * Re-mounts on every navigation inside /[stadium], so each page enters with a
 * soft rise. Only opacity + y are animated; transform resolves to `none` at rest,
 * so the fixed cart / pay bars keep their viewport anchoring. Skipped on the
 * very first load so SSR content paints instantly.
 */
export default function StadiumTemplate({ children }: { children: ReactNode }) {
  const entrance = useEntrance();
  return (
    <m.div
      initial={entrance ? { opacity: 0, y: 18 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: EASE }}
    >
      {children}
    </m.div>
  );
}
