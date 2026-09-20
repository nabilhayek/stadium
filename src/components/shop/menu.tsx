"use client";

import { useMemo, useState } from "react";
import { PillButton } from "@/components/ui/pill-button";
import type { MenuCategory, MenuVendor } from "@/lib/queries/stadium";
import { ProductCard } from "./product-card";

type Props = {
  stadiumSlug: string;
  currency: string;
  vendors: MenuVendor[];
  categories: MenuCategory[];
};

/**
 * Category filter + vendor sections. Filtering is client-side so a tap never
 * hits the network — stadiums have terrible connectivity.
 */
export function Menu({ stadiumSlug, currency, vendors, categories }: Props) {
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const visibleVendors = useMemo(() => {
    if (!categoryId) return vendors;
    return vendors
      .map((v) => ({ ...v, products: v.products.filter((p) => p.categoryId === categoryId) }))
      .filter((v) => v.products.length > 0);
  }, [vendors, categoryId]);

  return (
    <>
      <nav
        aria-label="Categories"
        className="sticky top-0 z-10 -mx-4 bg-background/90 px-4 py-3 backdrop-blur-sm"
      >
        <ul className="scrollbar-none flex gap-2 overflow-x-auto">
          <li className="shrink-0">
            <PillButton
              size="sm"
              variant={categoryId === null ? "primary" : "secondary"}
              onClick={() => setCategoryId(null)}
              aria-pressed={categoryId === null}
            >
              All
            </PillButton>
          </li>
          {categories.map((c) => (
            <li key={c.id} className="shrink-0">
              <PillButton
                size="sm"
                variant={categoryId === c.id ? "primary" : "secondary"}
                onClick={() => setCategoryId(c.id)}
                aria-pressed={categoryId === c.id}
              >
                {c.icon ? <span aria-hidden>{c.icon} </span> : null}
                {c.name}
              </PillButton>
            </li>
          ))}
        </ul>
      </nav>

      {visibleVendors.length === 0 ? (
        <p className="py-16 text-center text-muted">Nothing available in this category right now.</p>
      ) : (
        visibleVendors.map((vendor) => (
          <section key={vendor.id} aria-labelledby={`vendor-${vendor.id}`} className="mt-6">
            <header className="mb-3">
              <h2 id={`vendor-${vendor.id}`} className="text-xl font-semibold tracking-tight">
                {vendor.name}
              </h2>
              {vendor.description ? (
                <p className="text-sm text-muted">{vendor.description}</p>
              ) : null}
            </header>
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
          </section>
        ))
      )}
    </>
  );
}
