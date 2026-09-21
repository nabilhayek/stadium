"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { historyKey, parseHistory } from "@/lib/orders/history";
import { useStorageValue } from "@/lib/hooks/use-storage";
import type { MenuCategory, MenuProduct, MenuVendor } from "@/lib/queries/stadium";
import { useEntrance } from "@/components/motion/entrance";
import { EASE, SPRING, fadeUp, stagger } from "@/components/motion/variants";
import { ProductCard } from "./product-card";
import { PopularRail } from "./popular-rail";

type Flat = MenuProduct & { vendorId: string; vendorName: string };

type Props = {
  stadiumSlug: string;
  currency: string;
  vendors: MenuVendor[];
  categories: MenuCategory[];
};

function flatten(vendors: MenuVendor[]): Flat[] {
  return vendors.flatMap((v) =>
    v.products.map((p) => ({ ...p, vendorId: v.id, vendorName: v.name })),
  );
}

const SEARCH_ALIASES: Record<string, string[]> = {
  coke: ["cola", "coca"],
  cola: ["coke", "coca"],
  coca: ["coke", "cola"],
  veggie: ["veg", "vegetarian", "salad"],
  fries: ["chips"],
  chips: ["fries"],
};

function normalize(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function tokensOf(value: string) {
  return normalize(value).split(/[^a-z0-9]+/).filter(Boolean);
}

function matchesQuery(p: Flat, q: string) {
  const query = normalize(q);
  if (!query) return true;
  const hay = normalize(`${p.name} ${p.description ?? ""} ${p.vendorName}`);
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

/**
 * Search + category filter + vendor sections. Filtering is client-side so a tap
 * never hits the network — stadiums have terrible connectivity.
 */
export function Menu({ stadiumSlug, currency, vendors, categories }: Props) {
  const entrance = useEntrance();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const historyRaw = useStorageValue("local", historyKey(stadiumSlug));
  const history = useMemo(() => parseHistory(historyRaw), [historyRaw]);

  const all = useMemo(() => flatten(vendors), [vendors]);
  const q = query.trim().toLowerCase();
  const searching = q.length >= 3;

  const popular = useMemo(() => {
    const byId = new Map(all.map((p) => [p.id, p]));
    const picked: Flat[] = [];
    const seen = new Set<string>();
    const push = (id: string) => {
      const p = byId.get(id);
      if (!p || seen.has(id)) return;
      seen.add(id);
      picked.push(p);
    };
    for (const id of history.lastIds) push(id);
    for (const [id] of Object.entries(history.counts).sort((a, b) => b[1] - a[1])) push(id);
    for (const p of all) {
      if (picked.length >= 6) break;
      push(p.id);
    }
    return picked.slice(0, 6);
  }, [all, history]);

  const visibleVendors = useMemo(
    () =>
      vendors
        .map((v) => ({
          ...v,
          products: v.products.filter((p) => {
            if (categoryId && p.categoryId !== categoryId) return false;
            if (searching && !matchesQuery({ ...p, vendorId: v.id, vendorName: v.name }, q)) return false;
            return true;
          }),
        }))
        .filter((v) => v.products.length > 0),
    [vendors, categoryId, searching, q],
  );

  const matchCount = visibleVendors.reduce((n, v) => n + v.products.length, 0);
  const lastSet = new Set(history.lastIds);
  const railTitle = history.lastIds.length > 0 ? "Last ordered" : "Popular";
  const resultsKey = `${searching ? q : ""}|${categoryId ?? "all"}`;

  return (
    <>
      <m.div
        initial={entrance ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE, delay: 0.25 }}
      >
        <label className="relative mt-4 block">
          <span className="sr-only">Search the menu</span>
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.5 13.5 3 3" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Search — coke, veggie, fries"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="input input--secondary input--full-width min-h-12 rounded-full border border-border bg-surface pl-11 pr-4 text-[15px] shadow-[0_1px_0_rgba(17,17,17,0.03)]"
          />
          <AnimatePresence>
            {query ? (
              <m.button
                type="button"
                key="clear"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-surface-secondary text-[14px]"
              >
                ×
              </m.button>
            ) : null}
          </AnimatePresence>
        </label>
        <AnimatePresence initial={false}>
          {q.length > 0 && q.length < 3 ? (
            <m.p
              key="hint"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden text-[13px] text-muted"
            >
              <span className="block pt-2">Type 3 letters to search.</span>
            </m.p>
          ) : null}
        </AnimatePresence>
      </m.div>

      <AnimatePresence mode="wait" initial={false}>
        {!searching ? (
          <m.nav
            key="cats"
            aria-label="Categories"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="-mx-4 mt-3 overflow-x-auto px-4 scrollbar-none"
          >
            <ul className="relative isolate flex w-max gap-1.5 py-1">
              {[{ id: null as string | null, name: "All" }, ...categories].map((c) => {
                const active = categoryId === c.id;
                return (
                  <li key={c.id ?? "all"}>
                    <button
                      type="button"
                      onClick={() => setCategoryId(c.id)}
                      aria-pressed={active}
                      className="relative rounded-full px-4 py-2 text-[14px] font-medium"
                    >
                      {active ? (
                        <m.span
                          layoutId="category-thumb"
                          transition={SPRING}
                          className="absolute inset-0 z-0 rounded-full bg-foreground"
                        />
                      ) : (
                        <span className="absolute inset-0 z-0 rounded-full border border-border bg-surface" />
                      )}
                      <span className={["relative z-10 transition-colors", active ? "text-background" : "text-foreground"].join(" ")}>
                        {c.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </m.nav>
        ) : (
          <m.p
            key="count"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="mt-4 text-[13px] text-muted"
          >
            {matchCount} {matchCount === 1 ? "match" : "matches"} for “{query.trim()}”
          </m.p>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {!searching && !categoryId && popular.length > 0 ? (
          <m.section
            key="rail"
            aria-labelledby="popular-rail"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            // Bleed to the page gutter so the rail's edge fade isn't clipped by the height-collapse overflow.
            className="-mx-4 overflow-hidden px-4"
          >
            <div className="pt-6">
              <h2
                id="popular-rail"
                className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted"
              >
                {railTitle}
              </h2>
              <PopularRail
                stadiumSlug={stadiumSlug}
                currency={currency}
                items={popular}
                lastIds={lastSet}
                animateIn={entrance}
              />
            </div>
          </m.section>
        ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={resultsKey}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: EASE }}
        >
          {visibleVendors.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-display text-[22px] font-semibold tracking-tight">Nothing here</p>
              <p className="mt-1 text-[15px] text-muted">
                {searching ? "Try another word, or clear the search." : "Nothing available in this category right now."}
              </p>
            </div>
          ) : (
            visibleVendors.map((vendor, i) => (
              <m.section
                key={vendor.id}
                aria-labelledby={`vendor-${vendor.id}`}
                variants={stagger(0.04, 0.05)}
                initial={entrance ? "hidden" : false}
                whileInView="show"
                viewport={{ once: true, margin: "0px 0px -60px 0px" }}
                className="mt-7"
              >
                <m.header variants={fadeUp} className="mb-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                      Stand {String(i + 1).padStart(2, "0")}
                    </p>
                    <h2
                      id={`vendor-${vendor.id}`}
                      className="font-display mt-1 text-[22px] font-semibold leading-none tracking-tight"
                    >
                      {vendor.name}
                    </h2>
                    {vendor.description ? (
                      <p className="mt-1 text-[13px] text-muted">{vendor.description}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted tabular-nums">
                    {vendor.products.length} items
                  </span>
                </m.header>
                <ul className="flex flex-col gap-2">
                  {vendor.products.map((p) => (
                    <ProductCard
                      key={p.id}
                      stadiumSlug={stadiumSlug}
                      currency={currency}
                      vendorId={vendor.id}
                      vendorName={vendor.name}
                      product={p}
                    />
                  ))}
                </ul>
              </m.section>
            ))
          )}
        </m.div>
      </AnimatePresence>
    </>
  );
}
