"use client";

import { useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Check, Minus, Plus } from "lucide-react";
import { useToast } from "@/components/toast/toast-provider";
import { getCartStore } from "@/lib/cart/store";
import { checkSelection, defaultSelection, groupRule, unitPrice, type MenuOptionGroup } from "@/lib/menu/options";
import { formatCents } from "@/lib/money";

type Props = {
  stadiumSlug: string;
  currency: string;
  product: {
    id: string;
    name: string;
    priceCents: number;
    isSoldOut: boolean;
    optionGroups: MenuOptionGroup[];
  };
};

const MAX_QTY = 20;

/** Option groups, quantity and the add button. Prices here are a preview; checkout re-prices on the server. */
export function ProductOrder({ stadiumSlug, currency, product }: Props) {
  const groups = product.optionGroups;
  const [selected, setSelected] = useState(() => defaultSelection(groups));
  const [qty, setQty] = useState(1);
  const [tried, setTried] = useState(false);
  const { toast } = useToast();

  const check = checkSelection(groups, selected);
  const unit = unitPrice(product.priceCents, check.ok ? check.extraCents : extraFor(groups, selected));
  const invalidGroup = tried && !check.ok ? check.groupId : null;

  function pickSingle(group: MenuOptionGroup, optionId: string) {
    const ids = new Set(group.options.map((o) => o.id));
    const was = selected.includes(optionId);
    const rest = selected.filter((id) => !ids.has(id));
    setSelected(was && !group.required ? rest : [...rest, optionId]);
  }

  function toggleMultiple(optionId: string) {
    setSelected((prev) => (prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]));
  }

  function add() {
    if (product.isSoldOut) return;
    if (!check.ok) {
      setTried(true);
      if (check.groupId) document.getElementById(`group-${check.groupId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    getCartStore(stadiumSlug).add(
      { productId: product.id, name: product.name, unitCents: unit, options: check.chosen },
      qty,
    );
    navigator.vibrate?.(10);
    toast({ message: qty > 1 ? `${qty} × ${product.name} added` : `${product.name} added`, status: "success" });
    setSelected(defaultSelection(groups));
    setQty(1);
    setTried(false);
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {groups.map((group) => {
        const picks = group.options.filter((o) => selected.includes(o.id)).length;
        const full = group.selection === "MULTIPLE" && group.maxSelect !== null && picks >= group.maxSelect;
        const invalid = invalidGroup === group.id;
        return (
          <fieldset
            key={group.id}
            id={`group-${group.id}`}
            aria-describedby={`rule-${group.id}`}
            className={[
              "min-w-0 rounded-[20px] border bg-surface px-4 pt-3.5 pb-1.5 transition-colors duration-200",
              invalid ? "border-danger" : "border-border",
            ].join(" ")}
          >
            <legend className="sr-only">{group.name}</legend>
            <div className="flex items-baseline justify-between gap-3">
              <p aria-hidden className="text-[15px] font-medium">
                {group.name}
              </p>
              <p
                id={`rule-${group.id}`}
                className={[
                  "shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium",
                  invalid ? "bg-danger text-white" : group.required ? "bg-foreground text-background" : "bg-surface-secondary text-muted",
                ].join(" ")}
              >
                {invalid ? "Required" : groupRule(group)}
              </p>
            </div>
            <ul className="mt-1.5">
              {group.options.map((option) => {
                const on = selected.includes(option.id);
                const disabled = option.isSoldOut || (!on && full);
                const type = group.selection === "SINGLE" ? "radio" : "checkbox";
                return (
                  <li key={option.id} className="border-t border-separator first:border-t-0">
                    <label
                      className={[
                        "flex min-h-12 items-center gap-3 py-2",
                        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
                      ].join(" ")}
                    >
                      <input
                        type={type}
                        name={group.id}
                        checked={on}
                        disabled={disabled}
                        onChange={() => (type === "radio" ? pickSingle(group, option.id) : toggleMultiple(option.id))}
                        onClick={() => {
                          if (type === "radio" && on && !group.required) pickSingle(group, option.id);
                        }}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden
                        className={[
                          "grid size-[22px] shrink-0 place-items-center border-[1.5px] transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-[#0066cc] peer-focus-visible:ring-offset-2",
                          type === "radio" ? "rounded-full" : "rounded-[7px]",
                          on ? "border-foreground bg-foreground text-background" : "border-border bg-surface",
                        ].join(" ")}
                      >
                        {on ? (
                          type === "radio" ? (
                            <span className="size-2 rounded-full bg-background" />
                          ) : (
                            <Check className="size-3.5" strokeWidth={3} />
                          )
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 text-[15px] leading-snug">{option.name}</span>
                      <span className="shrink-0 text-[14px] tabular-nums text-muted">
                        {option.isSoldOut ? "Sold out" : priceDelta(option.priceCents, currency)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}

      <div className="flex items-center gap-3 rounded-[20px] border border-border bg-surface p-2 pl-3">
        <div className="flex items-center gap-0.5 rounded-full bg-surface-secondary p-0.5" role="group" aria-label="Quantity">
          <button
            type="button"
            onClick={() => setQty((n) => Math.max(1, n - 1))}
            disabled={qty <= 1 || product.isSoldOut}
            aria-label="Decrease quantity"
            className="grid size-9 place-items-center rounded-full disabled:opacity-35"
          >
            <Minus className="size-4" strokeWidth={2.2} />
          </button>
          <span className="min-w-6 text-center text-[15px] font-semibold tabular-nums" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => setQty((n) => Math.min(MAX_QTY, n + 1))}
            disabled={qty >= MAX_QTY || product.isSoldOut}
            aria-label="Increase quantity"
            className="grid size-9 place-items-center rounded-full disabled:opacity-35"
          >
            <Plus className="size-4" strokeWidth={2.2} />
          </button>
        </div>
        <button
          type="button"
          onClick={add}
          disabled={product.isSoldOut}
          className="button button--primary button--lg min-w-0 flex-1 justify-between active:scale-[0.98] disabled:opacity-50"
        >
          <span>{product.isSoldOut ? "Sold out" : "Add to cart"}</span>
          {product.isSoldOut ? null : (
            <AnimatePresence mode="wait" initial={false}>
              <m.span
                key={unit * qty}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="tabular-nums"
              >
                {formatCents(unit * qty, currency)}
              </m.span>
            </AnimatePresence>
          )}
        </button>
      </div>
      {tried && !check.ok ? (
        <p role="alert" className="-mt-2 px-1 text-[13px] text-danger">
          {check.message}
        </p>
      ) : null}
    </div>
  );
}

function extraFor(groups: MenuOptionGroup[], selected: string[]) {
  let cents = 0;
  for (const g of groups) for (const o of g.options) if (selected.includes(o.id)) cents += o.priceCents;
  return cents;
}

function priceDelta(cents: number, currency: string) {
  if (cents === 0) return "";
  return `${cents > 0 ? "+" : "−"}${formatCents(Math.abs(cents), currency)}`;
}
