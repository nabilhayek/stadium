"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#111111", "#ffffff", "#0066cc", "#d6e8ff"];

/** One-shot celebration burst — theme ink, white, and link blue. */
export function ConfettiBurst() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    let cancelled = false;

    void import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const end = Date.now() + 900;
      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.65 },
          colors: COLORS,
          disableForReducedMotion: true,
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.65 },
          colors: COLORS,
          disableForReducedMotion: true,
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      confetti({
        particleCount: 70,
        spread: 80,
        origin: { y: 0.55 },
        colors: COLORS,
        disableForReducedMotion: true,
      });
      frame();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
