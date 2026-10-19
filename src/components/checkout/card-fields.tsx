"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CardCvcElement, CardExpiryElement, CardNumberElement } from "@stripe/react-stripe-js";
import type { StripeElementStyle } from "@stripe/stripe-js";
import { CardMark } from "./pay-marks";

const style: StripeElementStyle = {
  base: {
    color: "#111111",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    fontSize: "15px",
    fontSmoothing: "antialiased",
    "::placeholder": { color: "#6b6b66" },
  },
  invalid: { color: "#b42318" },
};

const options = { style, disableLink: true };

type Props = { onComplete: (complete: boolean) => void };

/** Our labels and layout. The card numbers themselves are typed into Stripe, not our server. */
export function CardFields({ onComplete }: Props) {
  const [parts, setParts] = useState({ number: false, expiry: false, cvc: false });

  useEffect(() => {
    onComplete(parts.number && parts.expiry && parts.cvc);
  }, [onComplete, parts]);

  return (
    <div className="grid grid-cols-2 gap-3 rounded-[20px] border border-border bg-surface p-4">
      <div className="col-span-2 flex items-center justify-between">
        <p className="text-[15px] font-medium">Credit or debit</p>
        <CardMark className="text-foreground" />
      </div>
      <Field label="Card number" className="col-span-2">
        <CardNumberElement
          options={{ ...options, placeholder: "ACCT-000015" }}
          onChange={(event) => setParts((prev) => ({ ...prev, number: event.complete }))}
        />
      </Field>
      <Field label="Expiry">
        <CardExpiryElement
          options={{ ...options, placeholder: "MM / YY" }}
          onChange={(event) => setParts((prev) => ({ ...prev, expiry: event.complete }))}
        />
      </Field>
      <Field label="CVC">
        <CardCvcElement
          options={{ ...options, placeholder: "123" }}
          onChange={(event) => setParts((prev) => ({ ...prev, cvc: event.complete }))}
        />
      </Field>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={["flex min-w-0 flex-col gap-1.5", className].filter(Boolean).join(" ")}>
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <span className="flex min-h-11 items-center rounded-xl border border-border bg-background px-3 focus-within:border-foreground">
        <span className="block w-full">{children}</span>
      </span>
    </label>
  );
}
