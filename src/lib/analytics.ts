export type FunnelEvent = "shop_opened" | "item_added" | "checkout_started" | "paid";

/** Cookie-free Vercel Web Analytics custom event. No-ops when the script is absent. */
export function trackFunnel(event: FunnelEvent, stadium: string) {
  if (typeof window === "undefined") return;
  void import("@vercel/analytics").then(({ track }) => track(event, { stadium })).catch(() => {});
}
