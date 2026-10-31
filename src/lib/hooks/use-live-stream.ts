"use client";

import { useEffect, useRef, useState } from "react";

type Handlers = Record<string, (data: unknown) => void>;

export function kitchenStreamUrl(stadiumSlug: string, token: string) {
  return `/api/live/kitchen/${encodeURIComponent(stadiumSlug)}?t=${encodeURIComponent(token)}`;
}

/**
 * Subscribe to a Server-Sent Events URL. Pass null to stay disconnected.
 * Returns whether the stream is open, so callers can fall back to polling.
 */
export function useLiveStream(url: string | null, handlers: Handlers): boolean {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!url || typeof EventSource === "undefined") return;
    const source = new EventSource(url);
    const names = Object.keys(ref.current);
    const listeners = names.map((name) => {
      const listener = (event: MessageEvent<string>) => {
        try {
          ref.current[name]?.(JSON.parse(event.data));
        } catch {}
      };
      source.addEventListener(name, listener);
      return [name, listener] as const;
    });
    source.onopen = () => setOpen(true);
    source.onerror = () => setOpen(false);
    return () => {
      for (const [name, listener] of listeners) source.removeEventListener(name, listener);
      source.close();
      setOpen(false);
    };
  }, [url]);

  return url ? open : false;
}
