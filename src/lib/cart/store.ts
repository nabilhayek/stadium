/**
 * Minimal external cart store — no state library, ~1KB.
 * One cart per stadium, persisted to localStorage, cross-tab synced via the `storage` event.
 * Consumed through `useSyncExternalStore` (see use-cart.ts).
 */

import { lineKey, type ChosenOption } from "@/lib/menu/options";

export type CartLine = {
  /** Product id plus picked option ids. Two burgers with different sauces are two lines. */
  key: string;
  productId: string;
  name: string;
  /** Includes the option prices. */
  unitCents: number;
  qty: number;
  options?: ChosenOption[];
  /** Allergies / extras for this line. */
  note?: string;
};

export type CartState = {
  lines: CartLine[];
};

export type AddableProduct = Omit<CartLine, "qty" | "key">;

const EMPTY: CartState = { lines: [] };

function asOption(raw: unknown): ChosenOption | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.group !== "string" || typeof o.name !== "string") return null;
  if (typeof o.cents !== "number") return null;
  return { id: o.id, group: o.group, name: o.name, cents: o.cents };
}

/** Drops leftover stand fields from carts saved before the single-shop menu. */
function asLine(raw: unknown): CartLine | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.productId !== "string" || typeof o.name !== "string") return null;
  if (typeof o.unitCents !== "number" || typeof o.qty !== "number" || o.qty <= 0) return null;
  const options = Array.isArray(o.options)
    ? o.options.map(asOption).filter((x): x is ChosenOption => x !== null)
    : [];
  const line: CartLine = {
    key: lineKey(o.productId, options.map((x) => x.id)),
    productId: o.productId,
    name: o.name,
    unitCents: o.unitCents,
    qty: Math.floor(o.qty),
  };
  if (options.length) line.options = options;
  if (typeof o.note === "string" && o.note) line.note = o.note;
  return line;
}

export function toCartLine(p: AddableProduct, qty = 1): CartLine {
  const line: CartLine = { ...p, key: lineKey(p.productId, (p.options ?? []).map((o) => o.id)), qty };
  if (!line.options?.length) delete line.options;
  return line;
}

const STORAGE_PREFIX = "cart:v1:";

type Listener = () => void;

class CartStore {
  private state: CartState = EMPTY;
  private listeners = new Set<Listener>();
  private loaded = false;
  readonly key: string;

  constructor(readonly stadiumSlug: string) {
    this.key = STORAGE_PREFIX + stadiumSlug;
  }

  private load() {
    if (this.loaded || typeof window === "undefined") return;
    this.loaded = true;
    try {
      const raw = window.localStorage.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw) as { lines?: unknown };
        if (Array.isArray(parsed?.lines)) {
          this.state = { lines: parsed.lines.map(asLine).filter((l): l is CartLine => l !== null) };
        }
      }
    } catch {
      /* corrupted or unavailable storage: start empty */
    }
    window.addEventListener("storage", (e) => {
      if (e.key === this.key) {
        this.loaded = false;
        this.load();
        this.emit();
      }
    });
  }

  private persist() {
    try {
      if (this.state.lines.length === 0) window.localStorage.removeItem(this.key);
      else window.localStorage.setItem(this.key, JSON.stringify(this.state));
    } catch {
      /* quota / private mode — cart still works in memory */
    }
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private set(lines: CartLine[]) {
    this.state = { lines };
    this.persist();
    this.emit();
  }

  subscribe = (listener: Listener) => {
    this.load();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): CartState => {
    this.load();
    return this.state;
  };

  getServerSnapshot = (): CartState => EMPTY;

  add = (p: AddableProduct, qty = 1) => {
    const next = toCartLine(p, qty);
    const lines = this.state.lines;
    const i = lines.findIndex((l) => l.key === next.key);
    if (i === -1) return this.set([...lines, next]);
    this.set(lines.map((l, idx) => (idx === i ? { ...l, qty: l.qty + qty } : l)));
  };

  setQty = (key: string, qty: number) => {
    if (qty <= 0) return this.set(this.state.lines.filter((l) => l.key !== key));
    this.set(this.state.lines.map((l) => (l.key === key ? { ...l, qty } : l)));
  };

  setNote = (key: string, note: string) => {
    const trimmed = note.trim();
    this.set(
      this.state.lines.map((l) =>
        l.key === key ? { ...l, note: trimmed || undefined } : l,
      ),
    );
  };

  remove = (key: string) => this.setQty(key, 0);

  /** Replace the whole cart — used by “Same again” from history. */
  replace = (lines: CartLine[]) => this.set(lines.filter((l) => l.qty > 0));

  clear = () => this.set([]);
}

const stores = new Map<string, CartStore>();

export function getCartStore(stadiumSlug: string): CartStore {
  let s = stores.get(stadiumSlug);
  if (!s) {
    s = new CartStore(stadiumSlug);
    stores.set(stadiumSlug, s);
  }
  return s;
}

/** What checkout sends: ids and quantities only. The server re-prices everything. */
export function quoteLines(lines: readonly CartLine[]) {
  return lines.map((line) => ({
    productId: line.productId,
    qty: line.qty,
    note: line.note,
    ...(line.options?.length ? { options: line.options.map((o) => o.id) } : {}),
  }));
}

export function cartTotals(state: CartState) {
  let count = 0;
  let cents = 0;
  for (const l of state.lines) {
    count += l.qty;
    cents += l.qty * l.unitCents;
  }
  return { count, cents };
}
