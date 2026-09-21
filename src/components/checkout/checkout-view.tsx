"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, m } from "framer-motion";
import { PillButton } from "@/components/ui/pill-button";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { TimeWheel } from "@/components/ui/time-wheel";
import { SpotGradient } from "@/components/ui/spot-gradient";
import { SeatConfirm } from "@/components/shop/seat-confirm";
import { useEntrance } from "@/components/motion/entrance";
import { EASE, SPRING, fadeUp, stagger } from "@/components/motion/variants";
import { useCart } from "@/lib/cart/use-cart";
import { cartTotals, type CartLine, type CartState } from "@/lib/cart/store";
import { useSeat } from "@/lib/seat/use-seat";
import { formatSeat, getSeatStore, type Seat } from "@/lib/seat/store";
import { arrivalClock, estimateDelivery } from "@/lib/checkout/eta";
import { formatCents } from "@/lib/money";
import { recordOrdered } from "@/lib/orders/history";
import { commitReceipt } from "@/lib/orders/sync";
import { getDeviceId } from "@/lib/device";
import { useNow } from "@/lib/hooks/use-now";
import { useStorageValue, useMounted } from "@/lib/hooks/use-storage";
import {
  earliestSchedule,
  formatClock,
  isOrderLive,
  isValidSchedule,
  makeConfirmCode,
  makeOrderNumber,
  makeReceiptToken,
  parseReceipt,
  receiptKey,
  stampPaidAt,
  type Fulfillment,
  type Receipt,
  type Timing,
} from "@/lib/orders/receipt";
import type { SeatSection } from "@/components/shop/seat-status";
import { BackLink } from "@/components/ui/back-link";
import { Armchair, Check, ChevronDown, Loader2, ShoppingBag } from "lucide-react";
import { ApplePayMark, CardMark, GooglePayMark } from "./pay-marks";
import { requestLiveLock, pushLiveLock } from "@/lib/orders/live-lock";

type Method = "apple" | "google" | "card";

type Props = {
  stadiumSlug: string;
  stadiumName: string;
  currency: string;
  sections: SeatSection[];
};

const panelVariants = {
  enter: (dir: number) => ({ opacity: 0, x: 20 * dir, height: 0 }),
  center: { opacity: 1, x: 0, height: "auto" },
  exit: (dir: number) => ({ opacity: 0, x: -20 * dir, height: 0 }),
};

const LAYOUT = { duration: 0.32, ease: EASE };

export function CheckoutView({ stadiumSlug, stadiumName, currency, sections }: Props) {
  const router = useRouter();
  const { state: liveCart, store: cart } = useCart(stadiumSlug);
  const { seat } = useSeat(stadiumSlug);
  const entrance = useEntrance();

  // After pay we keep drawing the cart as it was, clear the real one, and move
  // to the order's own URL. The frozen copy stops the empty state flashing in between.
  const [paid, setPaid] = useState<{ receipt: Receipt; cart: CartState } | null>(null);
  const state = paid ? paid.cart : liveCart;
  const { count, cents } = cartTotals(state);

  useEffect(() => {
    if (!paid) return;
    cart.clear();
    router.replace(`/${stadiumSlug}/order/${encodeURIComponent(paid.receipt.orderNumber)}`);
  }, [paid, cart, router, stadiumSlug]);

  // Wallet default follows the platform; the user's explicit pick wins.
  const mounted = useMounted();
  const isApple = mounted && /iPhone|iPad|Mac/.test(navigator.userAgent);
  const [methodChoice, setMethodChoice] = useState<Method | null>(null);
  const method: Method = methodChoice ?? (isApple ? "apple" : "google");
  const setMethod = setMethodChoice;

  const [cardOpen, setCardOpen] = useState(false);
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "" });
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editSeat, setEditSeat] = useState(false);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("delivery");
  const [dir, setDir] = useState(1);
  const [timing, setTiming] = useState<Timing>("asap");

  // Clock ticks every 30s so "earliest" stays honest while the page sits open.
  const now = useNow(30_000);
  const [pickedAt, setPickedAt] = useState<number | null>(null);
  const scheduledAt = pickedAt ?? earliestSchedule(now);
  const setScheduledAt = setPickedAt;

  // An order already in flight — offered as a link when there is nothing to pay for.
  const storedRaw = useStorageValue("session", receiptKey(stadiumSlug));
  const tracking = useMemo(() => {
    const stored = parseReceipt(storedRaw);
    return stored && now && isOrderLive(stored, now) ? stored : null;
  }, [storedRaw, now]);

  const eta = estimateDelivery(state, fulfillment);
  const byVendor = useMemo(() => {
    const map = new Map<string, CartLine[]>();
    for (const line of state.lines) {
      const arr = map.get(line.vendorId) ?? [];
      arr.push(line);
      map.set(line.vendorId, arr);
    }
    return [...map.values()];
  }, [state.lines]);

  const scheduleOk = timing !== "scheduled" || isValidSchedule(scheduledAt, now);

  function changeFulfillment(next: Fulfillment) {
    setDir(next === "pickup" ? 1 : -1);
    setFulfillment(next);
  }

  async function onPay(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (fulfillment === "delivery" && !seat) {
      setError("Confirm your seat so the runner can find you.");
      setEditSeat(true);
      return;
    }
    if (count === 0) return;
    if (!scheduleOk) {
      setError(`Pick a time from ${formatClock(earliestSchedule(now))} onwards.`);
      return;
    }
    if (method === "card" && !validCard(card)) {
      setError("Check the card number, expiry and CVC.");
      return;
    }
    setPaying(true);
    const orderNumber = makeOrderNumber();
    // Warm the order page while the wallet sheet is up, so the hand-off is instant.
    router.prefetch(`/${stadiumSlug}/order/${encodeURIComponent(orderNumber)}`);
    const lock = requestLiveLock();
    await new Promise((r) => setTimeout(r, 1100));
    const paidAt = stampPaidAt();
    const readyAt = timing === "scheduled" ? scheduledAt : paidAt + eta.max * 60_000;
    const next: Receipt = {
      orderNumber,
      confirmCode: makeConfirmCode(),
      deviceId: getDeviceId() ?? undefined,
      token: makeReceiptToken(),
      stadiumSlug,
      stadiumName,
      seat,
      fulfillment,
      timing,
      scheduledAt: timing === "scheduled" ? scheduledAt : null,
      etaMin: eta.min,
      etaMax: eta.max,
      paidAt,
      readyAt,
      runnerNote: "",
      currency,
      totalCents: cents,
      lines: state.lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        qty: l.qty,
        note: l.note,
        vendorId: l.vendorId,
        vendorName: l.vendorName,
        unitCents: l.unitCents,
      })),
    };
    // Local first: phone storage now, server copy in the background.
    commitReceipt(next);
    recordOrdered(
      stadiumSlug,
      state.lines.flatMap((l) => Array.from({ length: l.qty }, () => l.productId)),
    );
    setPaid({ receipt: next, cart: state });
    if (await lock) pushLiveLock(next, paidAt);
  }

  if (count === 0) {
    return (
      <m.div
        variants={stagger(0.08)}
        initial={entrance ? "hidden" : false}
        animate="show"
        className="flex min-h-[70dvh] flex-col justify-center pr-12"
      >
        <m.h1 variants={fadeUp} className="font-display text-[28px] font-semibold tracking-[-0.03em]">
          Nothing to check out
        </m.h1>
        <m.p variants={fadeUp} className="mt-2 text-[15px] text-muted">
          {tracking ? "Your last order is still on its way." : "Add something from the shop first."}
        </m.p>
        <m.div variants={fadeUp} className="mt-8 flex flex-col gap-2">
          {tracking ? (
            <Link
              href={`/${stadiumSlug}/order/${encodeURIComponent(tracking.orderNumber)}`}
              className="button button--primary button--lg w-full text-center"
            >
              Track order {tracking.orderNumber}
            </Link>
          ) : null}
          <Link
            href={`/${stadiumSlug}`}
            className={`button button--lg w-full text-center ${tracking ? "button--secondary" : "button--primary"}`}
          >
            Back to the shop
          </Link>
        </m.div>
      </m.div>
    );
  }

  const payLabel =
    method === "apple"
      ? `Pay with Apple Pay · ${formatCents(cents, currency)}`
      : method === "google"
        ? `Pay with Google Pay · ${formatCents(cents, currency)}`
        : `Pay ${formatCents(cents, currency)}`;

  const whenLabel = timing === "scheduled" ? formatClock(scheduledAt) : `${eta.min}–${eta.max} min`;
  const whenSub =
    timing === "scheduled"
      ? fulfillment === "delivery"
        ? "Runner arrives at that time"
        : "Ready at the counter then"
      : `Around ${arrivalClock(eta.max)} · ${byVendor.length > 1 ? `${byVendor.length} stands` : "one stand"}`;

  return (
    <m.form
      onSubmit={onPay}
      variants={stagger(0.07, 0.1)}
      initial={entrance ? "hidden" : false}
      animate="show"
      className="flex flex-col gap-7 pb-[max(7.5rem,env(safe-area-inset-bottom))]"
    >
      <m.header variants={fadeUp} className="pr-12">
        <BackLink href={`/${stadiumSlug}`}>Menu</BackLink>
        <h1 className="font-display mt-3 text-[28px] font-semibold leading-none tracking-[-0.03em]">
          Checkout
        </h1>
        <p className="mt-2 text-[15px] text-muted">{stadiumName}</p>
      </m.header>

      <m.section variants={fadeUp}>
        <Segmented<Fulfillment>
          aria-label="Delivery or pickup"
          layoutId="fulfillment"
          size="lg"
          value={fulfillment}
          onChange={changeFulfillment}
          options={[
            { id: "delivery", label: "Delivery", hint: "To your seat" },
            { id: "pickup", label: "Pickup", hint: "At the stand" },
          ]}
        />

        <div className="relative mt-3 overflow-hidden">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            {fulfillment === "delivery" ? (
              <m.div
                key="delivery"
                custom={dir}
                variants={panelVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.32, ease: EASE }}
                className="overflow-hidden"
              >
                <div className="flex items-center justify-between gap-3 rounded-[20px] border border-border bg-surface p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-secondary">
                      <Armchair className="size-5" strokeWidth={1.7} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Deliver to</p>
                      <p className="mt-0.5 truncate text-[15px] font-medium">
                        {seat ? formatSeat(seat, true) : "Seat not set"}
                      </p>
                    </div>
                  </div>
                  <PillButton size="sm" variant="secondary" onClick={() => setEditSeat(true)}>
                    {seat ? "Edit" : "Set"}
                  </PillButton>
                </div>
              </m.div>
            ) : (
              <m.div
                key="pickup"
                custom={dir}
                variants={panelVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.32, ease: EASE }}
                className="overflow-hidden"
              >
                <div className="rounded-[20px] border border-border bg-surface p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-secondary">
                      <ShoppingBag className="size-5" strokeWidth={1.7} aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Collect at</p>
                      <p className="mt-0.5 text-[15px] font-medium">
                        {byVendor.map((lines) => lines[0].vendorName).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-[13px] leading-snug text-muted">
                    Skip the queue — show your order number at the counter and it is handed straight over.
                  </p>
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </m.section>

      <m.section variants={fadeUp} layout transition={{ layout: LAYOUT }}>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">When</p>
        <Segmented<Timing>
          aria-label="When"
          layoutId="timing"
          value={timing}
          onChange={setTiming}
          options={[
            { id: "asap", label: "ASAP" },
            { id: "scheduled", label: "Schedule" },
          ]}
        />
        <AnimatePresence initial={false}>
          {timing === "scheduled" ? (
            <m.div
              key="wheel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="pt-3">
                <TimeWheel value={scheduledAt} onChange={setScheduledAt} />
                <p className={["mt-2 text-[13px]", scheduleOk ? "text-muted" : "text-danger"].join(" ")}>
                  {scheduleOk
                    ? `Earliest ${formatClock(earliestSchedule(now))} · scroll to set the exact minute`
                    : `Too soon — earliest is ${formatClock(earliestSchedule(now))}`}
                </p>
              </div>
            </m.div>
          ) : null}
        </AnimatePresence>
      </m.section>

      <m.section variants={fadeUp} layout transition={{ layout: LAYOUT }} className="spot px-5 py-5">
        <SpotGradient />
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/70">
          {fulfillment === "delivery" ? "Estimated delivery" : "Ready in"}
        </p>
        <div className="mt-2 h-[38px] overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <m.p
              key={whenLabel}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -24, opacity: 0 }}
              transition={SPRING}
              className="font-display text-[32px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-white"
            >
              {whenLabel}
            </m.p>
          </AnimatePresence>
        </div>
        <p className="mt-2 text-[13px] text-white/75">{whenSub}</p>
      </m.section>

      <m.section variants={fadeUp} layout transition={{ layout: LAYOUT }}>
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Order</p>
          <Link href={`/${stadiumSlug}`} className="text-[13px] font-medium text-link">
            Add more
          </Link>
        </div>
        <ul className="rule mt-3 rounded-[20px] border border-border bg-surface px-4">
          {state.lines.map((line) => (
            <li key={line.productId} className="flex items-baseline justify-between gap-3 py-3">
              <span className="min-w-0">
                <span className="text-[15px] font-medium">
                  <span className="mr-1 inline-block min-w-5 rounded-md bg-surface-secondary px-1 text-center text-[12px] font-semibold tabular-nums">
                    {line.qty}
                  </span>
                  {line.name}
                </span>
                <span className="mt-0.5 block text-[13px] text-muted">
                  {line.vendorName}
                  {line.note ? ` · ${line.note}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-[15px] tabular-nums">
                {formatCents(line.qty * line.unitCents, currency)}
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between py-3 text-[15px]">
            <span className="text-muted">Total</span>
            <span className="font-semibold tabular-nums">{formatCents(cents, currency)}</span>
          </li>
        </ul>
      </m.section>

      <m.fieldset variants={fadeUp} layout transition={{ layout: LAYOUT }} className="min-w-0">
        <legend className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Pay with</legend>
        <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label="Payment method">
          <WalletPay
            selected={method === "apple"}
            onSelect={() => {
              setMethod("apple");
              setCardOpen(false);
            }}
            title="Apple Pay"
            hint="Face ID · one tap"
            mark={<ApplePayMark />}
          />
          <WalletPay
            selected={method === "google"}
            onSelect={() => {
              setMethod("google");
              setCardOpen(false);
            }}
            title="Google Pay"
            hint="Saved cards"
            mark={<GooglePayMark />}
          />
        </div>
        <button
          type="button"
          className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-link"
          onClick={() => {
            setCardOpen((o) => !o);
            setMethod("card");
          }}
        >
          {cardOpen ? "Hide card" : "Pay another way"}
          <m.span aria-hidden animate={{ rotate: cardOpen ? 180 : 0 }} className="inline-flex">
            <ChevronDown className="size-3.5" strokeWidth={2} />
          </m.span>
        </button>
        <AnimatePresence initial={false}>
          {cardOpen ? (
            <m.div
              key="card"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-[20px] border border-border bg-surface p-4">
                <div className="col-span-2 flex items-center justify-between">
                  <p className="text-[15px] font-medium">Credit or debit</p>
                  <CardMark className="text-foreground" />
                </div>
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
            </m.div>
          ) : null}
        </AnimatePresence>
      </m.fieldset>

      <AnimatePresence>
        {error ? (
          <m.p
            key="error"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0, x: [0, -4, 4, -3, 3, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="rounded-2xl bg-[#fff1f0] px-4 py-3 text-[14px] text-danger"
            role="alert"
          >
            {error}
          </m.p>
        ) : null}
      </AnimatePresence>

      <m.div
        initial={entrance ? { y: 80, opacity: 0 } : false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ ...SPRING, delay: 0.45 }}
        className="fixed inset-x-0 bottom-0 z-20 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto w-full max-w-md">
          <PillButton
            type="submit"
            size="lg"
            variant="primary"
            fullWidth
            disabled={paying || paid !== null}
            className="relative overflow-hidden shadow-[0_12px_32px_-12px_rgba(17,17,17,0.55)]"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <m.span
                key={paid ? "paid" : paying ? "paying" : payLabel}
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -16, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="inline-flex items-center gap-2"
              >
                {paid ? (
                  <>
                    <Check className="size-4" strokeWidth={2.6} aria-hidden />
                    Paid
                  </>
                ) : paying ? (
                  <>
                    <Spinner />
                    Confirming…
                  </>
                ) : (
                  payLabel
                )}
              </m.span>
            </AnimatePresence>
          </PillButton>
        </div>
      </m.div>

      <SeatConfirm
        open={editSeat}
        sections={sections}
        draft={seat}
        onClose={() => setEditSeat(false)}
        onConfirm={(next: Seat) => {
          getSeatStore(stadiumSlug).set(next);
          setEditSeat(false);
        }}
      />
    </m.form>
  );
}

function WalletPay({
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
    <m.button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      whileTap={{ scale: 0.985 }}
      animate={{ borderColor: selected ? "rgba(17,17,17,0.9)" : "rgba(226,226,220,1)" }}
      transition={{ duration: 0.2 }}
      className="flex w-full flex-nowrap items-center gap-3 rounded-[20px] border bg-surface px-4 py-3.5 text-left"
    >
      <span
        className={[
          "grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
          selected ? "border-foreground bg-foreground" : "border-border",
        ].join(" ")}
        aria-hidden
      >
        <AnimatePresence>
          {selected ? (
            <m.span
              key="check"
              className="grid place-items-center"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={SPRING}
            >
              <Check className="size-3 text-background" strokeWidth={3} />
            </m.span>
          ) : null}
        </AnimatePresence>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{title}</span>
        <span className="block text-[13px] text-muted">{hint}</span>
      </span>
      <span className="shrink-0 text-foreground">{mark}</span>
    </m.button>
  );
}

function Spinner() {
  return <Loader2 className="size-4 animate-spin" aria-hidden />;
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
