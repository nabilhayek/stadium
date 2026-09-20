"use client";

import { m } from "framer-motion";
import type { ReactNode } from "react";
import { useEntrance } from "@/components/motion/entrance";
import { SpotGradient } from "@/components/ui/spot-gradient";
import { EASE, fadeUp, stagger } from "@/components/motion/variants";

type Props = {
  name: string;
  city: string | null;
  vendorCount: number;
  children: ReactNode;
};

/** Dark spotlight hero on the light canvas — venue name, seat chip, drifting glows. */
export function Hero({ name, city, vendorCount, children }: Props) {
  const entrance = useEntrance();
  return (
    <m.section
      className="spot mt-4 px-5 pb-5 pt-6"
      initial={entrance ? { opacity: 0, y: 16, scale: 0.985 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: EASE }}
    >
      <SpotGradient speed={0.7} />

      <m.div variants={stagger(0.07, 0.15)} initial={entrance ? "hidden" : false} animate="show">
        <m.p
          variants={fadeUp}
          className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/70"
        >
          Order to your seat
        </m.p>
        <m.h1
          variants={fadeUp}
          className="font-display mt-2 text-[32px] font-semibold leading-[0.95] tracking-[-0.045em] text-white"
        >
          {name}
        </m.h1>
        <m.p variants={fadeUp} className="mt-2 text-[13px] text-white/75">
          {[city, `${vendorCount} stands open`].filter(Boolean).join(" · ")}
        </m.p>
        <m.div variants={fadeUp} className="mt-5">
          {children}
        </m.div>
      </m.div>
    </m.section>
  );
}
