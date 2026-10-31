"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { kitchenStreamUrl, useLiveStream } from "@/lib/hooks/use-live-stream";

/** Poll this often only while the live stream is down. */
const REFRESH_MS = 20_000;
/** Many orders can land in one second at kickoff; refetch once for the batch. */
const SETTLE_MS = 1_000;

export function AutoRefresh({ stadiumSlug, streamToken }: { stadiumSlug: string; streamToken: string }) {
  const router = useRouter();
  const [stale, setStale] = useState(0);
  const live = useLiveStream(kitchenStreamUrl(stadiumSlug, streamToken), { order: () => setStale((n) => n + 1) });

  useEffect(() => {
    if (!stale) return;
    const id = window.setTimeout(() => {
      setStale(0);
      router.refresh();
    }, SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [stale, router]);

  // While the stream is open, refetch only on a change, so a quiet day lets the database sleep.
  useEffect(() => {
    if (live) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [live, router]);

  return null;
}
