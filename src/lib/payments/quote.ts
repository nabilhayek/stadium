import { withDb } from "@/lib/db";
import { checkSelection, unitPrice } from "@/lib/menu/options";
import type { ReceiptLine } from "@/lib/orders/receipt";

const MAX_LINES = 40;
const MAX_QTY = 20;
const MAX_OPTIONS = 30;
/** Stripe's minimum charge for EUR and most card currencies. */
const MIN_CENTS = 50;

export type QuoteRequestLine = { productId: string; qty: number; note?: string; options?: string[] };

export type PricedOrder = {
  stadiumId: string;
  stadiumName: string;
  currency: string;
  totalCents: number;
  lines: ReceiptLine[];
};

export type QuoteError = { error: "no-stadium" | "bad-lines" | "unavailable" | "sold-out" | "options" | "too-small" };

/** Price a basket from the database. Client prices are ignored; options are re-checked against the live menu. */
export async function quoteOrder(
  stadiumSlug: string,
  requested: QuoteRequestLine[],
): Promise<PricedOrder | QuoteError> {
  if (!Array.isArray(requested) || requested.length === 0 || requested.length > MAX_LINES) {
    return { error: "bad-lines" };
  }

  return withDb(async (db) => {
    const stadium = await db.stadium.findFirst({
      where: { slug: stadiumSlug, isActive: true },
      select: { id: true, name: true, currency: true },
    });
    if (!stadium) return { error: "no-stadium" };

    const ids = [...new Set(requested.map((line) => line.productId))];
    const products = await db.product.findMany({
      where: { stadiumId: stadium.id, id: { in: ids }, isAvailable: true },
      select: {
        id: true,
        name: true,
        priceCents: true,
        isSoldOut: true,
        optionGroups: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            selection: true,
            required: true,
            maxSelect: true,
            options: {
              orderBy: { sortOrder: "asc" },
              select: { id: true, name: true, priceCents: true, isDefault: true, isSoldOut: true },
            },
          },
        },
      },
    });
    const byId = new Map(products.map((product) => [product.id, product]));

    const lines: ReceiptLine[] = [];
    let totalCents = 0;
    for (const line of requested) {
      const qty = Math.floor(line.qty);
      if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY) return { error: "bad-lines" };
      const product = byId.get(line.productId);
      if (!product) return { error: "unavailable" };
      if (product.isSoldOut) return { error: "sold-out" };

      const picked = line.options ?? [];
      if (picked.length > MAX_OPTIONS) return { error: "bad-lines" };
      const check = checkSelection(product.optionGroups, picked);
      if (!check.ok) return { error: "options" };

      const unitCents = unitPrice(product.priceCents, check.extraCents);
      const note = typeof line.note === "string" ? line.note.trim().slice(0, 200) : "";
      lines.push({
        productId: product.id,
        name: product.name,
        qty,
        unitCents,
        ...(check.chosen.length ? { options: check.chosen } : {}),
        ...(note ? { note } : {}),
      });
      totalCents += unitCents * qty;
    }

    if (totalCents < MIN_CENTS) return { error: "too-small" };

    return {
      stadiumId: stadium.id,
      stadiumName: stadium.name,
      currency: stadium.currency.toUpperCase(),
      totalCents,
      lines,
    };
  });
}

export function isQuoteError(value: PricedOrder | QuoteError): value is QuoteError {
  return "error" in value;
}
