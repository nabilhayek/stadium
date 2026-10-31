"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Button, Drawer } from "@heroui/react";
import { Minus, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCart } from "@/lib/cart/use-cart";
import { cartTotals, type CartLine } from "@/lib/cart/store";
import { formatCents } from "@/lib/money";
import { optionSummary } from "@/lib/menu/options";
import { EASE } from "@/components/motion/variants";

type Props = {
  stadiumSlug: string;
  currency: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CartDrawer({ stadiumSlug, currency, isOpen, onOpenChange }: Props) {
  const t = useTranslations("cart");
  const { state, store } = useCart(stadiumSlug);
  const { count, cents } = cartTotals(state);

  return (
    <Drawer.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      {/* Height cap belongs on the dialog, not Content — Content is `fixed inset-0`,
          so max-h there pins the panel to the top 85% and leaves a gap at the bottom. */}
      <Drawer.Content placement="bottom">
        <Drawer.Dialog aria-label={t("yourCart")} className="max-h-[85dvh] rounded-b-none pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <Drawer.Handle />
          <Drawer.Header>
            <Drawer.Heading>{t("yourCart")}</Drawer.Heading>
          </Drawer.Header>

          <Drawer.Body className="flex flex-col gap-5">
            {count === 0 ? (
              <p className="py-8 text-center text-muted">{t("empty")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {state.lines.map((line) => (
                  <CartLineRow
                    key={line.key}
                    line={line}
                    currency={currency}
                    onQty={(qty) => store.setQty(line.key, qty)}
                    onNote={(note) => store.setNote(line.key, note)}
                  />
                ))}
              </ul>
            )}
          </Drawer.Body>

          <Drawer.Footer className="flex-col items-stretch gap-3">
            <div className="flex items-center justify-between text-base">
              <span className="text-muted">{t("total")}</span>
              <span className="font-semibold tabular-nums">{formatCents(cents, currency)}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onPress={store.clear} isDisabled={count === 0}>
                {t("clear")}
              </Button>
              <Link
                href={`/${stadiumSlug}/checkout`}
                prefetch
                aria-disabled={count === 0}
                onClick={(event) => {
                  if (count === 0) {
                    event.preventDefault();
                    return;
                  }
                  onOpenChange(false);
                }}
                className={`button button--primary button--lg flex-1 text-center ${count === 0 ? "pointer-events-none opacity-50" : ""}`}
              >
                {t("checkout")}
              </Link>
            </div>
          </Drawer.Footer>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  );
}

function CartLineRow({ line, currency, onQty, onNote }: { line: CartLine; currency: string; onQty: (qty: number) => void; onNote: (note: string) => void }) {
  const t = useTranslations("cart");
  const [editing, setEditing] = useState(false);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const hasNote = Boolean(line.note);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{line.name}</p>
          {line.options?.length ? <p className="line-clamp-2 text-[13px] leading-snug text-muted">{optionSummary(line.options)}</p> : null}
          <p className="text-[13px] tabular-nums text-muted">{formatCents(line.unitCents, currency)}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((open) => !open)}
          aria-expanded={editing}
          aria-controls={inputId}
          aria-label={editing ? t("hideNote", { name: line.name }) : hasNote ? t("editNote", { name: line.name }) : t("addNote", { name: line.name })}
          className={[
            "grid size-9 shrink-0 place-items-center rounded-full",
            editing || hasNote ? "bg-foreground text-background" : "bg-default text-muted",
          ].join(" ")}
        >
          <Pencil className="size-4" strokeWidth={1.7} aria-hidden />
        </button>
        <div className="flex items-center gap-1 rounded-full bg-default p-0.5">
          <Button size="sm" variant="ghost" isIconOnly onPress={() => onQty(line.qty - 1)} aria-label={t("decrease", { name: line.name })}>
            <Minus className="size-4" strokeWidth={2} />
          </Button>
          <span className="min-w-5 text-center text-sm font-medium tabular-nums">{line.qty}</span>
          <Button size="sm" variant="ghost" isIconOnly onPress={() => onQty(line.qty + 1)} aria-label={t("increase", { name: line.name })}>
            <Plus className="size-4" strokeWidth={2} />
          </Button>
        </div>
        <p className="w-14 shrink-0 text-right text-sm font-medium tabular-nums">{formatCents(line.qty * line.unitCents, currency)}</p>
      </div>

      {!editing && hasNote ? <p className="truncate pl-0.5 text-[13px] text-muted">{line.note}</p> : null}

      <AnimatePresence initial={false}>
        {editing ? (
          <m.label
            key="note"
            htmlFor={inputId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="block overflow-hidden p-1"
          >
            <span className="sr-only">{t("noteFor", { name: line.name })}</span>
            <input
              id={inputId}
              ref={inputRef}
              type="text"
              enterKeyHint="done"
              autoComplete="off"
              placeholder={t("notePlaceholder")}
              defaultValue={line.note ?? ""}
              onChange={(e) => onNote(e.target.value)}
              onBlur={() => {
                if (!line.note) setEditing(false);
              }}
              className="input input--secondary input--full-width mt-0.5 min-h-10 rounded-xl border border-border bg-surface px-3 text-[13px]"
            />
          </m.label>
        ) : null}
      </AnimatePresence>
    </li>
  );
}
