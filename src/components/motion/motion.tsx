"use client";

import { LazyMotion, MotionConfig, domMax } from "framer-motion";
import type { ReactNode } from "react";

/** One motion runtime for the app. `m.*` components stay tiny; features load here. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
