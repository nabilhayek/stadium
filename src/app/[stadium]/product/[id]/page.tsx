import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink } from "@/components/ui/back-link";
import { AddToCartButton } from "@/components/shop/add-to-cart-button";
import { CartBar } from "@/components/shop/cart-bar";
import { ProductMark } from "@/components/shop/product-mark";
import { formatCents } from "@/lib/money";
import { descriptionFor, nutritionFor } from "@/lib/menu/nutrition";
import { findMenuProduct, getStadiumMenu } from "@/lib/queries/stadium";

type Props = { params: Promise<{ stadium: string; id: string }> };

export const revalidate = 60;
export const dynamicParams = true;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stadium, id } = await params;
  const menu = await getStadiumMenu(stadium);
  const found = menu ? findMenuProduct(menu, id) : null;
  if (!menu || !found) return { title: "Product" };
  return {
    title: `${found.product.name} · ${menu.name}`,
    description: found.product.description ?? `Order ${found.product.name} at ${menu.name}.`,
  };
}

export default async function ProductPage({ params }: Props) {
  const { stadium, id } = await params;
  const menu = await getStadiumMenu(stadium);
  if (!menu) notFound();
  const found = findMenuProduct(menu, id);
  if (!found) notFound();

  const { product, category } = found;
  const description = product.description ?? descriptionFor(product.name);
  const nutrition = nutritionFor(product.name);
  const facts = nutrition
    ? [
        { label: "kcal", value: String(nutrition.calories) },
        { label: "Protein", value: `${nutrition.proteinG}g` },
        { label: "Carbs", value: `${nutrition.carbsG}g` },
        { label: "Fat", value: `${nutrition.fatG}g` },
      ]
    : [];

  return (
    <main data-has-cart-bar className="mx-auto w-full max-w-md px-4 pt-6">
      <header className="pr-12">
        <BackLink href={`/${menu.slug}`}>Back</BackLink>
      </header>

      <ProductMark
        name={product.name}
        categoryId={product.categoryId}
        imageUrl={product.imageUrl}
        priority
        sizes="(max-width: 448px) 100vw, 448px"
        className="mt-5 h-52 w-full rounded-[28px] text-[64px]"
      />

      {category ? (
        <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{category.name}</p>
      ) : null}
      <h1 className="font-display mt-2 text-[32px] font-semibold leading-[0.95] tracking-[-0.045em]">
        {product.name}
      </h1>
      {description ? (
        <p className="mt-3 text-[15px] leading-snug text-muted">{description}</p>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-4 rounded-[20px] border border-border bg-surface px-4 py-3">
        <p className="font-display text-[22px] font-semibold tracking-tight tabular-nums">
          {formatCents(product.priceCents, menu.currency)}
        </p>
        <AddToCartButton
          stadiumSlug={menu.slug}
          product={{
            productId: product.id,
            name: product.name,
            unitCents: product.priceCents,
          }}
        />
      </div>

      {nutrition ? (
        <section className="mt-4 rounded-[20px] border border-border bg-surface px-5 py-5" aria-labelledby="nutrition">
          <h2 id="nutrition" className="text-[15px] font-medium">
            Nutrition
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">Per {nutrition.serving}. Approximate.</p>
          <dl className="mt-4 grid grid-cols-4 gap-2">
            {facts.map((fact) => (
              <div key={fact.label} className="rounded-2xl bg-surface-secondary px-2 py-3 text-center">
                <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{fact.label}</dt>
                <dd className="font-display mt-1 text-[18px] font-semibold tracking-tight tabular-nums">{fact.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[13px] leading-snug text-muted">
            {nutrition.allergens.length > 0
              ? `Contains ${listAllergens(nutrition.allergens)}.`
              : "No allergens listed."}
          </p>
        </section>
      ) : null}

      <CartBar stadiumSlug={menu.slug} currency={menu.currency} />
    </main>
  );
}

function listAllergens(names: string[]) {
  if (names.length === 1) return names[0].toLowerCase();
  return `${names.slice(0, -1).join(", ").toLowerCase()} and ${names[names.length - 1].toLowerCase()}`;
}
