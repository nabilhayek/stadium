/**
 * Option rules shared by the product page, the cart and server pricing.
 * No browser or DB imports: the server re-runs `checkSelection` on every quote.
 */

export type OptionSelection = "SINGLE" | "MULTIPLE";

export type MenuOption = {
  id: string;
  name: string;
  /** Added to the product price; may be negative. */
  priceCents: number;
  isDefault: boolean;
  isSoldOut: boolean;
};

export type MenuOptionGroup = {
  id: string;
  name: string;
  selection: OptionSelection;
  required: boolean;
  /** MULTIPLE only; null is no limit. */
  maxSelect: number | null;
  options: MenuOption[];
};

/** What a cart or receipt line remembers about a pick, so later menu edits do not rewrite history. */
export type ChosenOption = { id: string; group: string; name: string; cents: number };

export type SelectionCheck =
  | { ok: true; chosen: ChosenOption[]; extraCents: number }
  | { ok: false; groupId: string | null; message: string };

/** Defaults the kitchen marked, minus anything sold out. */
export function defaultSelection(groups: MenuOptionGroup[]): string[] {
  const ids: string[] = [];
  for (const group of groups) {
    const picks = group.options.filter((o) => o.isDefault && !o.isSoldOut);
    const limit = group.selection === "SINGLE" ? 1 : (group.maxSelect ?? picks.length);
    ids.push(...picks.slice(0, limit).map((o) => o.id));
  }
  return ids;
}

export function groupRule(group: Pick<MenuOptionGroup, "selection" | "required" | "maxSelect">) {
  if (group.selection === "SINGLE") return group.required ? "Pick 1" : "Optional, pick 1";
  if (group.maxSelect) return group.required ? `Pick 1 to ${group.maxSelect}` : `Up to ${group.maxSelect}`;
  return group.required ? "Pick at least 1" : "Optional";
}

export function checkSelection(groups: MenuOptionGroup[], selectedIds: readonly string[]): SelectionCheck {
  const selected = new Set(selectedIds);
  if (selected.size !== selectedIds.length) return { ok: false, groupId: null, message: "An option was picked twice." };

  const chosen: ChosenOption[] = [];
  let extraCents = 0;
  let matched = 0;

  for (const group of groups) {
    const picks = group.options.filter((o) => selected.has(o.id));
    matched += picks.length;
    if (picks.some((o) => o.isSoldOut)) {
      return { ok: false, groupId: group.id, message: `${picks.find((o) => o.isSoldOut)!.name} is sold out.` };
    }
    if (group.selection === "SINGLE" && picks.length > 1) {
      return { ok: false, groupId: group.id, message: `Pick one ${group.name.toLowerCase()}.` };
    }
    if (group.required && picks.length === 0) {
      return { ok: false, groupId: group.id, message: `Choose ${group.name.toLowerCase()}.` };
    }
    if (group.selection === "MULTIPLE" && group.maxSelect && picks.length > group.maxSelect) {
      return { ok: false, groupId: group.id, message: `Pick up to ${group.maxSelect} ${group.name.toLowerCase()}.` };
    }
    for (const o of picks) {
      chosen.push({ id: o.id, group: group.name, name: o.name, cents: o.priceCents });
      extraCents += o.priceCents;
    }
  }

  if (matched !== selected.size) return { ok: false, groupId: null, message: "That option is no longer on the menu." };
  return { ok: true, chosen, extraCents };
}

/** Same product with different picks is a different cart line. No options keeps the old key: the product id. */
export function lineKey(productId: string, optionIds: readonly string[] = []) {
  if (optionIds.length === 0) return productId;
  return `${productId}|${[...optionIds].sort().join(",")}`;
}

/** Product price plus picks, never below zero. */
export function unitPrice(baseCents: number, extraCents: number) {
  return Math.max(0, baseCents + extraCents);
}

/** "No tomatoes, Extra patty, Cola" for tickets and cart rows. */
export function optionSummary(options: readonly ChosenOption[] | undefined) {
  return (options ?? []).map((o) => o.name).join(", ");
}

export function hasRequiredChoice(groups: readonly MenuOptionGroup[]) {
  return groups.some((g) => g.required);
}
