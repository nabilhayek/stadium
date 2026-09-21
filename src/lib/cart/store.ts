/**
 * Minimal external cart store — no state library, ~1KB.
 * One cart per stadium, persisted to localStorage, cross-tab synced via the `storage` event.
 * Consumed through `useSyncExternalStore` (see use-cart.ts).
 */

export type CartLine = {
  productId: string;
  vendorId: string;
  vendorName: string;
  name: string;
  unitCents: number;
  qty: number;
  /** Allergies / extras for this line. */
  note?: string;
};

export type CartState = {
  lines: CartLine[];
};

export type AddableProduct = Omit<CartLine, "qty">;

const EMPTY: CartState = { lines: [] };
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
        const parsed = JSON.parse(raw) as CartState;
        if (Array.isArray(parsed?.lines)) this.state = parsed;
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

  add = (p: AddableProduct) => {
    const lines = this.state.lines;
    const i = lines.findIndex((l) => l.productId === p.productId);
    if (i === -1) return this.set([...lines, { ...p, qty: 1 }]);
    this.set(lines.map((l, idx) => (idx === i ? { ...l, qty: l.qty + 1 } : l)));
  };

  setQty = (productId: string, qty: number) => {
    if (qty <= 0) return this.set(this.state.lines.filter((l) => l.productId !== productId));
    this.set(this.state.lines.map((l) => (l.productId === productId ? { ...l, qty } : l)));
  };

  setNote = (productId: string, note: string) => {
    const trimmed = note.trim();
    this.set(
      this.state.lines.map((l) =>
        l.productId === productId ? { ...l, note: trimmed || undefined } : l,
      ),
    );
  };

  remove = (productId: string) => this.setQty(productId, 0);

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

export function cartTotals(state: CartState) {
  let count = 0;
  let cents = 0;
  for (const l of state.lines) {
    count += l.qty;
    cents += l.qty * l.unitCents;
  }
  return { count, cents };
}
