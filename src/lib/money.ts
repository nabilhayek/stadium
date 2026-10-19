// Fixed locale so server and client render identical strings (no hydration mismatch).
const formatters = new Map<string, Intl.NumberFormat>();

export function formatCents(cents: number, currency: string): string {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat("en", { style: "currency", currency });
    formatters.set(currency, f);
  }
  return f.format(cents / 100);
}

export function currencySymbol(currency: string): string {
  return formatCents(0, currency).replace(/[\d.,\s]/g, "") || currency;
}

/** "4.99", "4,99", "+1", "-0.50" → cents. Null when it is not a price. */
export function parseCents(input: string): number | null {
  const s = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^[+-]?\d*(\.\d{0,2})?$/.test(s) || !/\d/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** Cents as an editable amount: 499 → "4.99". */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
