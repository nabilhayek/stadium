"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { PillButton } from "@/components/ui/pill-button";
import { Field } from "@/components/ui/field";
import { useCart } from "@/lib/cart/use-cart";
import { cartTotals, type CartLine } from "@/lib/cart/store";
import { useSeat } from "@/lib/seat/use-seat";
import { formatSeat } from "@/lib/seat/store";
import { arrivalClock, estimateDelivery } from "@/lib/checkout/eta";
import { formatCents } from "@/lib/money";
import type { SeatSection } from "@/components/shop/seat-status";
import { ApplePayMark, CardMark, GooglePayMark } from "./pay-marks";

type Method = "apple" | "google" | "card";

type Props = {
  stadiumSlug: string;
  stadiumName: string;
  currency: string;
  sections: SeatSection[];
};

export function CheckoutView({ stadiumSlug, stadiumName, currency, sections }: Props) {
  const { state, store: cart } = useCart(stadiumSlug);
  const { seat, store: seats } = useSeat(stadiumSlug);
  const { count, cents } = cartTotals(state);
  const eta = estimateDelivery(state);

  const [method, setMethod] = useState<Method>("apple");
  const [row, setRow] = useState("");
  const [number, setNumber] = useState("");
  const [sectionCode, setSectionCode] = useState(sections[0]?.code ?? "");
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "" });
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptEta, setReceiptEta] = useState(eta);

  useEffect(() => {
    if (!seat) return;
    setRow((r) => r || seat.row);
    setNumber((n) => n || seat.number);
    setSectionCode((c) => c || seat.sectionCode);
  }, [seat]);

  const section = sections.find((s) => s.code === sectionCode) ?? sections[0];
  const confirmed: typeof seat =
    seat ??
    (section && row.trim() && number.trim()
      ? { sectionCode: section.code, sectionName: section.name, row: row.trim(), number: number.trim() }
      : null);

  const byVendor = useMemo(() => {
    const map = new Map<string, CartLine[]>();
    for (const line of state.lines) {
      const arr = map.get(line.vendorId) ?? [];
      arr.push(line);
      map.set(line.vendorId, arr);
    }
    return [...map.values()];
  }, [state.lines]);

  function persistSeat() {
    if (!section || !row.trim() || !number.trim()) return null;
    const next = {
      sectionCode: section.code,
      sectionName: section.name,
      row: row.trim(),
      number: number.trim(),
    };
    seats.set(next);
    return next;
  }

  async function onPay(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const nextSeat = persistSeat();
    if (!nextSeat) {
      setError("Set your stand, row and seat so the runner can find you.");
      document.getElementById("seat")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (count === 0) return;
    if (method === "card" && !validCard(card)) {
      setError("Check the card number, expiry and CVC.");
      return;
    }
    setPaying(true);
    await new Promise((r) => setTimeout(r, 900));
    setReceiptEta(estimateDelivery(state));
    cart.clear();
    setPaying(false);
    setPaid(true);
  }

  if (paid && confirmed) {
    return (
      <Paid
        stadiumSlug={stadiumSlug}
        stadiumName={stadiumName}
        seat={confirmed}
        eta={receiptEta}
      />
    );
  }

  if (count === 0) {
    return (
      <div className="flex min-h-[70dvh] flex-col justify-center">
        <h1 className="text-3xl font-semibold tracking-tighter">Nothing to check out</h1>
        <p className="mt-2 text-muted">Add something from the shop first.</p>
        <Link
          href={`/${stadiumSlug}`}
          className="button button--primary button--md mt-8 w-fit"
        >
          Back to the shop
        </Link>
      </div>
    );
  }

  const payLabel =
    method === "apple"
      ? `Apple Pay · ${formatCents(cents, currency)}`
      : method === "google"
        ? `Google Pay · ${formatCents(cents, currency)}`
        : `Pay ${formatCents(cents, currency)}`;

  return (
    <form onSubmit={onPay} className="flex flex-col gap-8 pb-[max(7rem,env(safe-area-inset-bottom))]">
      <header>
        <Link
          href={`/${stadiumSlug}`}
          className="text-[13px] text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          ← Menu
        </Link>
        <h1 className="mt-3 text-4xl font-semibold leading-none tracking-tighter">Checkout</h1>
        <p className="mt-2 text-sm text-muted">{stadiumName}</p>
      </header>

      <section id="seat" className="rounded-[20px] border border-separator bg-surface p-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Deliver to</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">
          {confirmed ? formatSeat(confirmed, true) : "Your seat"}
        </p>
        <p className="mt-1 text-sm text-muted">The runner uses this — it has to match the number on the aisle.</p>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Stand">
          {sections.map((s) => (
            <PillButton
              key={s.code}
              size="sm"
              variant={sectionCode === s.code ? "primary" : "secondary"}
              onClick={() => setSectionCode(s.code)}
              aria-pressed={sectionCode === s.code}
            >
              {s.code} · {s.name.replace(/ Stand$/, "")}
            </PillButton>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field
            label="Row"
            name="row"
            inputMode="numeric"
            autoComplete="off"
            placeholder="12"
            value={row}
            onChange={(e) => setRow(e.target.value)}
            required
          />
          <Field
            label="Seat"
            name="seatNumber"
            inputMode="numeric"
            autoComplete="off"
            placeholder="8"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            required
          />
        </div>
      </section>

      <section className="relative overflow-hidden rounded-[20px] border border-separator bg-surface p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-16 size-40 rounded-full"
          style={{ background: "radial-gradient(circle, #6a4cf555, transparent 70%)" }}
        />
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Estimated delivery</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
          {eta.min}–{eta.max} min
        </p>
        <p className="mt-1 text-sm text-muted">
          At your seat around <span className="text-foreground">{arrivalClock(eta.max)}</span>
          {byVendor.length > 1 ? ` · ${byVendor.length} vendors, two runners` : " · one runner"}
        </p>
      </section>

      <section>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Order</p>
        <ul className="mt-3 divide-y divide-separator">
          {state.lines.map((line) => (
            <li key={line.productId} className="flex items-baseline justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="text-[15px] font-medium">
                  <span className="tabular-nums text-muted">{line.qty}× </span>
                  {line.name}
                </span>
                <span className="mt-0.5 block text-[12px] text-muted">{line.vendorName}</span>
              </span>
              <span className="shrink-0 text-[15px] tabular-nums">
                {formatCents(line.qty * line.unitCents, currency)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-between pt-1 text-base">
          <span className="text-muted">Total</span>
          <span className="font-semibold tabular-nums">{formatCents(cents, currency)}</span>
        </div>
      </section>

      <fieldset className="min-w-0">
        <legend className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Pay</legend>
        <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label="Payment method">
          <PayChoice
            selected={method === "apple"}
            onSelect={() => setMethod("apple")}
            title="Apple Pay"
            hint="Face ID or Touch ID · one tap"
            mark={<ApplePayMark className="h-6 w-auto" />}
          />
          <PayChoice
            selected={method === "google"}
            onSelect={() => setMethod("google")}
            title="Google Pay"
            hint="Saved cards in your Google account"
            mark={<GooglePayMark className="h-6 w-auto text-foreground" />}
          />
          <PayChoice
            selected={method === "card"}
            onSelect={() => setMethod("card")}
            title="Credit or debit card"
            hint="Visa, Mastercard, Amex"
            mark={<CardMark className="text-foreground" />}
          />
        </div>

        {method === "card" ? (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-[20px] bg-surface p-4">
            <div className="col-span-2">
              <Field
                label="Card number"
                name="cc-number"
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="ACCT-000015"
                value={card.number}
                onChange={(e) => setCard((c) => ({ ...c, number: maskNumber(e.target.value) }))}
              />
            </div>
            <Field
              label="Expiry"
              name="cc-exp"
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="MM / YY"
              value={card.expiry}
              onChange={(e) => setCard((c) => ({ ...c, expiry: maskExpiry(e.target.value) }))}
            />
            <Field
              label="CVC"
              name="cc-csc"
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="123"
              maxLength={4}
              value={card.cvc}
              onChange={(e) => setCard((c) => ({ ...c, cvc: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
            />
          </div>
        ) : null}
      </fieldset>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-separator bg-background/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        <div className="mx-auto w-full max-w-md">
          <PillButton type="submit" size="lg" variant="primary" fullWidth disabled={paying}>
            {paying ? "Paying…" : payLabel}
          </PillButton>
        </div>
      </div>
    </form>
  );
}

function PayChoice({
  selected,
  onSelect,
  title,
  hint,
  mark,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
  mark: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={[
          "flex w-full flex-nowrap items-center gap-3 rounded-[20px] border px-4 py-3.5 text-left transition-colors",
          selected
            ? "border-foreground/40 bg-surface-secondary"
            : "border-separator bg-surface hover:border-foreground/20 hover:bg-surface-secondary",
        ].join(" ")}
    >
      <span
        className={[
          "grid size-5 shrink-0 place-items-center rounded-full border",
          selected ? "border-foreground bg-foreground" : "border-muted",
        ].join(" ")}
        aria-hidden
      >
        {selected ? <span className="size-2 rounded-full bg-background" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{title}</span>
        <span className="block text-[13px] text-muted">{hint}</span>
      </span>
      <span className="shrink-0 text-foreground">{mark}</span>
    </button>
  );
}

function Paid({
  stadiumSlug,
  stadiumName,
  seat,
  eta,
}: {
  stadiumSlug: string;
  stadiumName: string;
  seat: { sectionName: string; sectionCode: string; row: string; number: string };
  eta: { min: number; max: number };
}) {
  return (
    <div className="flex min-h-[80dvh] flex-col justify-center">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Paid · {stadiumName}</p>
      <h1 className="mt-3 text-4xl font-semibold leading-none tracking-tighter">On the way</h1>
      <p className="mt-4 text-lg text-muted">
        Heading to <span className="text-foreground">{formatSeat(seat, true)}</span>
      </p>
      <p className="mt-2 text-muted">
        Usually {eta.min}–{eta.max} min · around {arrivalClock(eta.max)}
      </p>
      <Link href={`/${stadiumSlug}`} className="button button--primary button--lg mt-10 w-fit">
        Back to the shop
      </Link>
    </div>
  );
}

function maskNumber(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function maskExpiry(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
}

function validCard(card: { number: string; expiry: string; cvc: string }) {
  const digits = card.number.replace(/\s/g, "");
  const exp = card.expiry.replace(/\D/g, "");
  return digits.length >= 13 && digits.length <= 19 && exp.length === 4 && card.cvc.length >= 3;
}
