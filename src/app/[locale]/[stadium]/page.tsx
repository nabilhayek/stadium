import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { api } from "@/server/trpc/server";
import { Menu } from "@/components/shop/menu";
import { CartBar, CartBarFromUrl } from "@/components/shop/cart-bar";
import { Hero } from "@/components/shop/hero";
import { SeatStatus, SeatStatusFromUrl } from "@/components/shop/seat-status";

type Props = {
  params: Promise<{ locale: Locale; stadium: string }>;
};

export async function generateStaticParams() {
  try {
    const stadiums = await api.stadium.active();
    if (stadiums.length > 0) return stadiums.map((s) => ({ stadium: s.slug }));
  } catch {
    // No DB at build time — still prerender the seeded shop so the route has a shell.
  }
  return [{ stadium: "arena" }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stadium } = await params;
  const menu = await api.stadium.menu({ slug: stadium });
  if (!menu) return { title: "Not found" };
  return {
    title: menu.name,
    description: `Order food and drinks to your seat at ${menu.name}.`,
    alternates: { canonical: `/${menu.slug}` },
  };
}

export default function StadiumShopPage({ params }: Props) {
  return (
    <Suspense fallback={<main data-has-cart-bar className="mx-auto w-full max-w-md px-4 pt-8 text-[15px] text-muted">Loading the menu…</main>}>
      <ShopBody params={params} />
    </Suspense>
  );
}

async function ShopBody({ params }: Props) {
  const { locale, stadium: slug } = await params;
  setRequestLocale(locale);
  const menu = await api.stadium.menu({ slug });
  if (!menu) notFound();

  // The QR seat and `?cart=1` are read in the browser, so one static page serves every seat.
  const seat = { stadiumSlug: menu.slug, sections: menu.sections };
  const cart = { stadiumSlug: menu.slug, currency: menu.currency };

  return (
    <main data-has-cart-bar className="mx-auto w-full max-w-md px-4">
      <Hero name={menu.name} city={menu.city}>
        <Suspense fallback={<SeatStatus {...seat} />}>
          <SeatStatusFromUrl {...seat} />
        </Suspense>
      </Hero>

      <Menu stadiumSlug={menu.slug} currency={menu.currency} products={menu.products} categories={menu.categories} />

      <Suspense fallback={<CartBar {...cart} />}>
        <CartBarFromUrl {...cart} />
      </Suspense>
    </main>
  );
}
