"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AnimatePresence, m } from "framer-motion";
import { PillButton } from "@/components/ui/pill-button";
import { SpotGradient } from "@/components/ui/spot-gradient";
import { EASE, SPRING, fadeUp, stagger } from "@/components/motion/variants";
import { useNow } from "@/lib/hooks/use-now";
import { formatSeat } from "@/lib/seat/store";
import {
  clearReceipt,
  confirmDigits,
  formatClock,
  isValidEmail,
  writeReceipt,
  type Receipt,
} from "@/lib/orders/receipt";

type Props = {
  receipt: Receipt;
  onDismiss: () => void;
};

function formatRemain(ms: number) {
  const total = Math.ceil(ms / 1000);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export function OnTheWay({ receipt: initial, onDismiss }: Props) {
  const [receipt, setReceipt] = useState(initial);
  const tick = useNow(1000);
  // Server snapshot is 0 — fall back to paidAt so SSR shows the full countdown.
  const now = tick || initial.paidAt;
  const [note, setNote] = useState(initial.runnerNote);
  const [savedNote, setSavedNote] = useState(false);
  const [email, setEmail] = useState(initial.email ?? "");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState(!initial.email);

  const total = Math.max(1, receipt.readyAt - receipt.paidAt);
  const left = Math.max(0, receipt.readyAt - now);
  const progress = Math.min(1, 1 - left / total);
  const arrived = left === 0;
  const delivery = receipt.fulfillment === "delivery";

  const steps = delivery
    ? ["Paid", "Preparing", "On the way", "At your seat"]
    : ["Paid", "Preparing", "Ready"];
  const stepIndex = arrived
    ? steps.length - 1
    : Math.min(steps.length - 2, Math.floor(progress * (steps.length - 1)));

  function update(patch: Partial<Receipt>) {
    const next = { ...receipt, ...patch };
    writeReceipt(next);
    setReceipt(next);
  }

  function saveNote() {
    update({ runnerNote: note.trim() });
    setSavedNote(true);
    window.setTimeout(() => setSavedNote(false), 1600);
  }

  function saveEmail(e: FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setEmailError("That email does not look right.");
      return;
    }
    setEmailError(null);
    // Sending is wired up later — for now the address travels with the receipt.
    update({ email: email.trim() });
    setEditingEmail(false);
  }

  function dismiss() {
    clearReceipt(receipt.stadiumSlug);
    onDismiss();
  }

  const title = arrived
    ? delivery
      ? "At your seat"
      : "Ready for pickup"
    : delivery
      ? "On the way"
      : "Being prepared";

  return (
    <m.div
      variants={stagger(0.08, 0.5)}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-5 pb-10"
    >
      <header className="flex flex-col items-start">
        <SuccessMark />
        <m.p variants={fadeUp} className="mt-5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
          {receipt.stadiumName} · Order {receipt.orderNumber}
        </m.p>
        <m.h1
          variants={fadeUp}
          className="font-display mt-2 text-[32px] font-semibold leading-[0.95] tracking-[-0.045em]"
        >
          <AnimatePresence mode="wait" initial={false}>
            <m.span
              key={title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="inline-block"
            >
              {title}
            </m.span>
          </AnimatePresence>
        </m.h1>
        <m.p variants={fadeUp} className="mt-2 text-[15px] text-muted">
          {delivery && receipt.seat ? (
            <>
              Heading to <span className="font-medium text-foreground">{formatSeat(receipt.seat, true)}</span>
            </>
          ) : (
            "Show your order number at the counter."
          )}
        </m.p>
      </header>

      <m.section
        variants={fadeUp}
        className="rounded-[20px] border border-border bg-surface px-5 py-6"
        aria-label="Hand-off code"
      >
        <p className="text-center text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
          Show this to the runner
        </p>
        <HandOffCode code={receipt.confirmCode} fallback={receipt.orderNumber} />
        <p className="mt-4 text-center text-[13px] leading-snug text-muted">
          They type these four digits to confirm the order reached you.
        </p>
      </m.section>

      <m.section variants={fadeUp} className="spot px-5 py-5">
        <SpotGradient speed={0.6} scrim={0.4} />
        <div className="flex items-center gap-5">
          <Ring progress={progress} arrived={arrived}>
            <span className="font-display text-[26px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-white">
              {arrived ? "Now" : formatRemain(left)}
            </span>
          </Ring>
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/60">
              {receipt.timing === "scheduled" ? "Scheduled for" : arrived ? "Status" : "Arriving"}
            </p>
            <p className="font-display mt-1 text-[22px] font-semibold tracking-tight text-white">
              {formatClock(receipt.readyAt)}
            </p>
            <p className="mt-1 text-[13px] text-white/60">
              {receipt.timing === "asap" ? `Usually ${receipt.etaMin}–${receipt.etaMax} min` : "Exact time you picked"}
            </p>
          </div>
        </div>

        <ol className="mt-5 grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0,1fr))` }}>
          {steps.map((s, i) => {
            const done = i <= stepIndex;
            const current = i === stepIndex;
            return (
              <li key={s} className="relative flex flex-col items-start">
                <div className="flex w-full items-center">
                  <m.span
                    className="relative z-10 grid size-3 place-items-center rounded-full"
                    animate={{ backgroundColor: done ? "#ffffff" : "rgba(255,255,255,0.25)", scale: current ? 1.15 : 1 }}
                    transition={SPRING}
                  >
                    {current && !arrived ? (
                      <span className="absolute inset-0 rounded-full bg-white/60 [animation:ping_1.8s_ease-out_infinite]" />
                    ) : null}
                  </m.span>
                  {i < steps.length - 1 ? (
                    <span className="relative mx-1 h-px flex-1 overflow-hidden rounded-full bg-white/20">
                      <m.span
                        className="absolute inset-y-0 left-0 bg-white"
                        initial={{ width: 0 }}
                        animate={{ width: i < stepIndex ? "100%" : i === stepIndex ? `${Math.round(((progress * (steps.length - 1)) % 1) * 100)}%` : "0%" }}
                        transition={{ duration: 0.8, ease: EASE }}
                      />
                    </span>
                  ) : null}
                </div>
                <span className={["mt-2 text-[11px] font-medium", done ? "text-white" : "text-white/45"].join(" ")}>
                  {s}
                </span>
              </li>
            );
          })}
        </ol>
      </m.section>

      {delivery ? (
        <m.section variants={fadeUp} className="rounded-[20px] border border-border bg-surface p-5">
          <div className="flex items-start gap-3">
            <RunnerIcon />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium">A runner has your order</p>
              <p className="mt-1 text-[13px] leading-snug text-muted">
                They look for the seat number first. Add a landmark if the aisle is packed.
              </p>
            </div>
          </div>
          <label htmlFor="runner-note" className="sr-only">
            Note for the runner
          </label>
          <div className="mt-4 flex gap-2">
            <input
              id="runner-note"
              type="text"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="Aisle end, blue jacket"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="input input--secondary input--full-width min-h-11 rounded-xl"
            />
            <PillButton size="md" variant="primary" onClick={saveNote} className="shrink-0">
              <AnimatePresence mode="popLayout" initial={false}>
                <m.span
                  key={savedNote ? "saved" : "save"}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="inline-block"
                >
                  {savedNote ? "Saved" : "Send"}
                </m.span>
              </AnimatePresence>
            </PillButton>
          </div>
        </m.section>
      ) : null}

      <m.section variants={fadeUp} className="rounded-[20px] border border-border bg-surface p-5">
        <div className="flex items-start gap-3">
          <MailIcon />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium">Receipt by email</p>
            <p className="mt-1 text-[13px] leading-snug text-muted">Optional. Nothing else, no newsletter.</p>
          </div>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {editingEmail ? (
            <m.form
              key="edit"
              onSubmit={saveEmail}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="mt-4"
            >
              <label htmlFor="receipt-email" className="sr-only">
                Email address
              </label>
              <div className="flex gap-2">
                <input
                  id="receipt-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  enterKeyHint="send"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(null);
                  }}
                  aria-invalid={emailError ? true : undefined}
                  className="input input--secondary input--full-width min-h-11 rounded-xl"
                />
                <PillButton type="submit" size="md" variant="primary" className="shrink-0">
                  Send
                </PillButton>
              </div>
              <AnimatePresence>
                {emailError ? (
                  <m.p
                    key="err"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden text-[13px] text-danger"
                  >
                    <span className="block pt-2">{emailError}</span>
                  </m.p>
                ) : null}
              </AnimatePresence>
            </m.form>
          ) : (
            <m.div
              key="done"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-surface-secondary px-4 py-3"
            >
              <span className="min-w-0 truncate text-[15px]">
                Going to <span className="font-medium">{receipt.email}</span>
              </span>
              <button type="button" onClick={() => setEditingEmail(true)} className="shrink-0 text-[13px] font-medium text-link">
                Change
              </button>
            </m.div>
          )}
        </AnimatePresence>
      </m.section>

      <m.section variants={fadeUp} className="rounded-[20px] border border-border bg-surface px-4">
        <ul className="rule">
          {receipt.lines.map((l) => (
            <li key={l.productId} className="flex items-baseline justify-between gap-3 py-3 text-[15px]">
              <span className="min-w-0">
                <span className="mr-1 inline-block min-w-5 rounded-md bg-surface-secondary px-1 text-center text-[12px] font-semibold tabular-nums">
                  {l.qty}
                </span>
                <span className="font-medium">{l.name}</span>
                {l.note ? <span className="mt-0.5 block text-[13px] text-muted">{l.note}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </m.section>

      <m.div variants={fadeUp} className="flex flex-col gap-2 pt-1">
        <Link href={`/${receipt.stadiumSlug}`} className="button button--primary button--lg w-full text-center">
          Back to the shop
        </Link>
        <PillButton variant="ghost" size="lg" fullWidth onClick={dismiss}>
          Order again
        </PillButton>
      </m.div>
    </m.div>
  );
}

function HandOffCode({ code, fallback }: { code?: string; fallback: string }) {
  const digits = confirmDigits(code, fallback);
  return (
    <p
      className="mt-4 flex justify-center gap-2.5"
      aria-label={`Hand-off code ${digits.join("")}`}
    >
      {digits.map((d, i) => (
        <m.span
          key={`${d}-${i}`}
          initial={{ opacity: 0, y: 10, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...SPRING, delay: 0.08 + i * 0.06 }}
          className="font-display grid size-[4.25rem] place-items-center rounded-[20px] bg-foreground text-[40px] font-semibold leading-none tracking-tight text-background tabular-nums"
        >
          {d}
        </m.span>
      ))}
    </p>
  );
}

function SuccessMark() {
  return (
    <m.div
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ ...SPRING, delay: 0.05 }}
      className="grid size-14 place-items-center rounded-full bg-foreground text-background shadow-[0_12px_28px_-10px_rgba(17,17,17,0.5)]"
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <m.path
          d="M5 12.5l4.2 4.2L19 7"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.25 }}
        />
      </svg>
    </m.div>
  );
}

function Ring({ progress, arrived, children }: { progress: number; arrived: boolean; children: React.ReactNode }) {
  const size = 112;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.18)" strokeWidth={stroke} fill="none" />
        <m.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#ffffff"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - (arrived ? 1 : progress)) }}
          transition={{ duration: 1, ease: "linear" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

function RunnerIcon() {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-secondary">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="14" cy="4.5" r="1.8" />
        <path d="M6 20l3.5-6 3 2.5L14 12l3 2 3-1" />
        <path d="M9.5 14 8 10.5l4-1.5 2.5 3" />
      </svg>
    </span>
  );
}

function MailIcon() {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-secondary">
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
        <path d="m4.5 7 7.5 6 7.5-6" />
      </svg>
    </span>
  );
}
