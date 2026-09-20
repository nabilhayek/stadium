import type { Transition, Variants } from "framer-motion";

/** Editorial ease — fast out, soft landing. */
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const SPRING: Transition = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 };
export const SOFT_SPRING: Transition = { type: "spring", stiffness: 260, damping: 28 };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.35, ease: EASE } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: SPRING },
};

export function stagger(children = 0.045, delay = 0.04): Variants {
  return {
    hidden: {},
    show: { transition: { staggerChildren: children, delayChildren: delay } },
  };
}
