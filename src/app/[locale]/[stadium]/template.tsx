"use client";

import { m } from "framer-motion";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { EASE } from "@/components/motion/variants";

// First pathname rendered in this tab, and whether a client navigation has left it since.
let firstPath: string | null = null;
let navigated = false;

function rememberPath(pathname: string) {
  if (typeof window === "undefined") return;
  firstPath ??= pathname;
  if (pathname !== firstPath) navigated = true;
}

/**
 * The pathname for a fallback param (an order number, a product id) is not
 * known while the shell prerenders, so `usePathname` suspends. Reading it here,
 * beside the page rather than around it, lets the shell stay in the HTML.
 */
function EntranceProbe() {
  const pathname = usePathname();
  useState(() => {
    rememberPath(pathname);
    return null;
  });
  return null;
}

function EntranceFrame({ children }: { children: ReactNode }) {
  const [animate] = useState(() => typeof window !== "undefined" && navigated);
  return (
    <m.div initial={animate ? { opacity: 0, y: 18 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: EASE }}>
      {children}
    </m.div>
  );
}

/**
 * Re-mounts on every navigation inside /[stadium], so each page enters with a
 * soft rise. Only opacity + y are animated; transform resolves to `none` at rest,
 * so the fixed cart / pay bars keep their viewport anchoring. Skipped on the
 * very first load so SSR content paints instantly.
 */
export default function StadiumTemplate({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <EntranceProbe />
      </Suspense>
      <EntranceFrame>{children}</EntranceFrame>
    </>
  );
}
