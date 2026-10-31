import type { MenuProduct } from "@/lib/queries/stadium";

const SEARCH_ALIASES: Record<string, string[]> = {
  coke: ["cola", "coca"],
  cola: ["coke", "coca"],
  coca: ["coke", "cola"],
  veggie: ["veg", "vegetarian", "salad"],
  fries: ["chips"],
  chips: ["fries"],
};

export function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokensOf(value: string) {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** True when the product name or description matches the fan's search, including drink aliases. */
export function matchesQuery(p: MenuProduct, q: string) {
  const query = normalize(q);
  if (!query) return true;
  const hay = normalize(`${p.name} ${p.description ?? ""}`);
  const tokens = tokensOf(hay);
  if (hay.includes(query) || tokens.some((t) => t.startsWith(query))) return true;

  for (const [key, alts] of Object.entries(SEARCH_ALIASES)) {
    const names = [key, ...alts];
    const touchesQuery = names.some((name) => name.startsWith(query) || query.startsWith(name));
    if (!touchesQuery) continue;
    if (names.some((name) => hay.includes(name) || tokens.some((t) => t.startsWith(name)))) return true;
  }
  return false;
}
