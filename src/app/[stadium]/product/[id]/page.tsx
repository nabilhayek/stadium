import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/ui/back-link";
import { CartBar } from "@/components/shop/cart-bar";
import { ProductMark } from "@/components/shop/product-mark";
import { ProductOrder } from "@/components/shop/product-order";
import { formatCents } from "@/lib/money";
import { formatPer } from "@/lib/menu/nutrition";
import { findMenuProduct } from "@/lib/queries/stadium";
import { api } from "@/server/trpc/server";

type Props = { params: Promise<{ stadium: string; id: string }> };

export const revalidate = 60;
export const dynamicParams = true;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stadium, id } = await params;
  const menu = await api.stadium.menu({ slug: stadium });
  const found = menu ? findMenuProduct(menu, id) : null;
  if (!menu || !found) return { title: "Product" };
  return {
    title: `${found.product.name} · ${menu.name}`,
    description: found.product.description ?? `Order ${found.product.name} at ${menu.name}.`,
  };
}

export default async function ProductPage({ params }: Props) {
  const { stadium, id } = await params;
  const menu = await api.stadium.menu({ slug: stadium });
  if (!menu) notFound();
  const found = findMenuProduct(menu, id);
  if (!found) notFound();

  const { product, category } = found;
  const { nutrition, allergens } = product;
  const facts = nutrition
    ? [
        { label: "kcal", value: String(nutrition.kcal) },
        { label: "Protein", value: grams(nutrition.proteinG) },
        { label: "Carbs", value: grams(nutrition.carbsG) },
        { label: "Fat", value: grams(nutrition.fatG) },
      ]
    : [];
  const minor = nutrition
    ? [
        nutrition.sugarG !== undefined ? `Of which sugars ${grams(nutrition.sugarG)}` : null,
        nutrition.saltG !== undefined ? `Salt ${grams(nutrition.saltG)}` : null,
      ].filter(Boolean)
    : [];

  return (
    <main data-has-cart-bar className="mx-auto w-full max-w-md px-4 pt-6 pb-6">
      <header className="pr-12">
        <BackLink href={`/${menu.slug}`}>Back</BackLink>
      </header>

      <div className="relative mt-5">
        <ProductMark
          name={product.name}
          categoryId={product.categoryId}
          imageUrl={product.imageUrl}
          priority
          sizes="(max-width: 448px) 100vw, 448px"
          className={["h-52 w-full rounded-[28px] text-[64px]", product.isSoldOut ? "grayscale" : ""].join(" ")}
        />
        {product.isSoldOut ? (
          <span className="absolute left-3 top-3 rounded-full bg-foreground px-2.5 py-1 text-[12px] font-semibold text-background">
            Sold out
          </span>
        ) : null}
      </div>

      {category ? (
        <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{category.name}</p>
      ) : null}
      <div className="mt-2 flex items-baseline justify-between gap-4">
        <h1 className="font-display text-[32px] font-semibold leading-[0.95] tracking-[-0.045em]">{product.name}</h1>
        <p className="font-display shrink-0 text-[22px] font-semibold tracking-tight tabular-nums">
          {formatCents(product.priceCents, menu.currency)}
        </p>
      </div>
      {product.description ? (
        <p className="mt-3 text-[15px] leading-snug text-muted">{product.description}</p>
      ) : null}

      <ProductOrder stadiumSlug={menu.slug} currency={menu.currency} product={product} />

      {nutrition || allergens.length > 0 ? (
        <section className="mt-4 rounded-[20px] border border-border bg-surface px-5 py-5" aria-labelledby="nutrition">
          <h2 id="nutrition" className="text-[15px] font-medium">
            {nutrition ? "Nutrition" : "Allergens"}
          </h2>
          {nutrition ? (
            <>
              <p className="mt-0.5 text-[13px] text-muted">Per {formatPer(nutrition.per)}. Approximate.</p>
              <dl className="mt-4 grid grid-cols-4 gap-2">
                {facts.map((fact) => (
                  <div key={fact.label} className="rounded-2xl bg-surface-secondary px-2 py-3 text-center">
                    <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{fact.label}</dt>
                    <dd className="font-display mt-1 text-[18px] font-semibold tracking-tight tabular-nums">{fact.value}</dd>
                  </div>
                ))}
              </dl>
              {minor.length ? <p className="mt-3 text-[13px] text-muted tabular-nums">{minor.join(" · ")}</p> : null}
            </>
          ) : null}
          <p className="mt-3 text-[13px] leading-snug text-muted">
            {allergens.length > 0 ? `Contains ${listAllergens(allergens)}.` : "No allergens listed."}
          </p>
        </section>
      ) : null}

      <CartBar stadiumSlug={menu.slug} currency={menu.currency} />
    </main>
  );
}

function grams(n: number) {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}g`;
}

function listAllergens(names: string[]) {
  if (names.length === 1) return names[0].toLowerCase();
  return `${names.slice(0, -1).join(", ").toLowerCase()} and ${names[names.length - 1].toLowerCase()}`;
}
