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
