/** One confirmed seat per stadium, persisted like the cart. QR codes write here via URL params. */

export type Seat = {
  sectionCode: string;
  sectionName: string;
  row: string;
  number: string;
};

type Listener = () => void;

const STORAGE_PREFIX = "seat:v1:";

class SeatStore {
  private seat: Seat | null = null;
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
        const parsed = JSON.parse(raw) as Seat;
        if (parsed?.sectionCode && parsed.row && parsed.number) this.seat = parsed;
      }
    } catch {
      /* ignore */
    }
    window.addEventListener("storage", (e) => {
      if (e.key === this.key) {
        this.loaded = false;
        this.load();
        this.emit();
      }
    });
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  subscribe = (listener: Listener) => {
    this.load();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Seat | null => {
    this.load();
    return this.seat;
  };

  getServerSnapshot = (): Seat | null => null;

  set = (seat: Seat) => {
    this.seat = seat;
    try {
      window.localStorage.setItem(this.key, JSON.stringify(seat));
    } catch {
      /* private mode */
    }
    this.emit();
  };
}

const stores = new Map<string, SeatStore>();

export function getSeatStore(stadiumSlug: string): SeatStore {
  let s = stores.get(stadiumSlug);
  if (!s) {
    s = new SeatStore(stadiumSlug);
    stores.set(stadiumSlug, s);
  }
  return s;
}

export function formatSeat(seat: Seat, long = false): string {
  if (long) return `${seat.sectionName} · Row ${seat.row} · Seat ${seat.number}`;
  return `${seat.sectionCode}-${seat.row}-${seat.number}`;
}
