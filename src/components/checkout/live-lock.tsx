"use client";

import { useEffect, useState } from "react";
import { PillButton } from "@/components/ui/pill-button";
import { Pin } from "lucide-react";
import { useMounted } from "@/lib/hooks/use-storage";
import {
  liveLockPermission,
  liveLockSupported,
  pushLiveLock,
  requestLiveLock,
} from "@/lib/orders/live-lock";
import type { Receipt } from "@/lib/orders/receipt";

type Props = { receipt: Receipt; now: number };

/**
 * Asks once, then keeps a tagged lock-screen notification (countdown + code)
 * in sync. Dynamic Island itself is native-only; this is the PWA equivalent.
 */
export function LiveLock({ receipt, now }: Props) {
  // The browser's answer is read during render once mounted; the user's tap on "Pin" overrides it.
  const mounted = useMounted();
  const [answer, setAnswer] = useState<ReturnType<typeof liveLockPermission> | null>(null);
  const permission = answer ?? (mounted ? liveLockPermission() : "unsupported");

  useEffect(() => {
    if (permission !== "granted") return;
    pushLiveLock(receipt, now);
  }, [permission, receipt, now]);

  if (!liveLockSupported() || permission === "unsupported" || permission === "denied") {
    return null;
  }

  if (permission === "granted") {
    return (
      <p className="text-[13px] leading-snug text-muted">
        Countdown and code are on your lock screen.
      </p>
    );
  }

  async function enable() {
    const ok = await requestLiveLock();
    setAnswer(liveLockPermission());
    if (ok) pushLiveLock(receipt, Date.now());
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-secondary px-4 py-3">
      <p className="min-w-0 text-[13px] leading-snug">
        Keep the countdown and code on your lock screen.
      </p>
      <PillButton size="sm" variant="primary" className="shrink-0 gap-1.5" onClick={enable}>
        <Pin className="size-3.5" strokeWidth={2} aria-hidden />
        Pin
      </PillButton>
    </div>
  );
}
