"use client";

import dynamic from "next/dynamic";

// WebGL shader — loaded after first paint so the shop's critical path stays light.
const MeshGradient = dynamic(
  () => import("@paper-design/shaders-react").then((mod) => mod.MeshGradient),
  { ssr: false },
);

/** Matches theme ink / surface / link (#111, #fff, #0066cc) with a soft sky stop. */
export const SPOT_COLORS = ["#ffffff", "#d6e8ff", "#0066cc", "#111111"];

type Props = {
  colors?: string[];
  speed?: number;
  distortion?: number;
  swirl?: number;
  /** 0–1 darkness of the scrim that keeps white type readable. */
  scrim?: number;
  className?: string;
};

/**
 * Animated mesh-gradient fill for `.spot` cards. Absolutely positioned; the
 * parent supplies size, radius and overflow clipping. The canvas mounts once
 * its chunk arrives and fades in over the #111 fallback (see `.spot-in`).
 */
export function SpotGradient({
  colors = SPOT_COLORS,
  speed = 0.6,
  distortion = 0.8,
  swirl = 0.1,
  scrim = 0.35,
  className,
}: Props) {
  return (
    <div
      aria-hidden
      className={["pointer-events-none absolute inset-0 -z-10", className].filter(Boolean).join(" ")}
    >
      <MeshGradient
        className="spot-in absolute inset-0 size-full"
        colors={colors}
        distortion={distortion}
        swirl={swirl}
        grainMixer={0}
        grainOverlay={0}
        speed={speed}
        maxPixelCount={1280 * 720}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, rgba(10,10,14,${scrim * 0.6}) 0%, rgba(10,10,14,${scrim}) 100%)`,
        }}
      />
    </div>
  );
}
