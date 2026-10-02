"use client";

import { useEffect, useState } from "react";
import { DECLINE_REASONS, MAX_DECLINE_REASON } from "@/lib/management/board";

type Props = {
  orderNumber: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

/** Pick a reason the customer will see. "Other" needs a line of text. */
export function DeclineDialog({ orderNumber, onCancel, onConfirm }: Props) {
  const [picked, setPicked] = useState<(typeof DECLINE_REASONS)[number]["id"]>("missing-items");
  const [other, setOther] = useState("");
  const reason = picked === "other" ? other.trim() : DECLINE_REASONS.find((r) => r.id === picked)?.text ?? "";
  const canConfirm = reason.length > 0 && reason.length <= MAX_DECLINE_REASON;

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-backdrop p-4" onPointerDown={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="decline-title"
        onPointerDown={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-[24px] bg-overlay p-5 shadow-[var(--overlay-shadow)]"
      >
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">Order {orderNumber}</p>
        <h2 id="decline-title" className="font-display mt-1 text-[24px] font-semibold leading-none tracking-tight">
          Decline this order?
        </h2>
        <p className="mt-2 text-[14px] text-muted">The customer sees the reason and is refunded.</p>

        <div role="radiogroup" aria-label="Reason" className="mt-4 flex flex-col gap-1.5">
          {DECLINE_REASONS.map((r) => {
            const on = picked === r.id;
            return (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPicked(r.id)}
                className={[
                  "flex items-center justify-between rounded-2xl px-4 py-3 text-left text-[15px] font-medium",
                  on ? "bg-foreground text-background" : "bg-surface-secondary",
                ].join(" ")}
              >
                {r.label}
                <span
                  aria-hidden
                  className={["size-2.5 rounded-full", on ? "bg-background" : "border border-border bg-transparent"].join(" ")}
                />
              </button>
            );
          })}
        </div>

        {picked === "other" ? (
          <label className="mt-3 block">
            <span className="sr-only">Reason for the customer</span>
            <textarea
              autoFocus
              rows={2}
              maxLength={MAX_DECLINE_REASON}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder="Tell the customer why"
              className="w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] outline-none focus:border-focus"
            />
          </label>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onCancel} className="button button--secondary button--lg flex-1">
            Keep order
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(reason)}
            className="button button--danger button--lg flex-1 disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
