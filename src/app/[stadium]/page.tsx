import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActiveStadiums, getStadiumMenu } from "@/lib/queries/stadium";
import { Menu } from "@/components/shop/menu";
import { CartBar } from "@/components/shop/cart-bar";
import { Hero } from "@/components/shop/hero";
import { SeatStatus } from "@/components/shop/seat-status";

type Props = {
  params: Promise<{ stadium: string }>;
  searchParams: Promise<{ section?: string; row?: string; seat?: string; cart?: string }>;
};

// Statically pre-render known stadiums; unknown slugs render on demand, then get cached.
// Must be a literal (Next parses segment config statically). Keep in sync with MENU_REVALIDATE_SECONDS.
export const revalidate = 60;
export const dynamicParams = true;

export async function generateStaticParams() {
  try {
    const stadiums = await getActiveStadiums();
    return stadiums.map((s) => ({ stadium: s.slug }));
  } catch {
    // No DB at build time (e.g. CI) — fall back to on-demand rendering.
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stadium } = await params;
  const menu = await getStadiumMenu(stadium);
  if (!menu) return { title: "Not found" };
  return {
    title: menu.name,
    description: `Order food and drinks to your seat at ${menu.name}.`,
  };
}

export default async function StadiumShopPage({ params, searchParams }: Props) {
  const { stadium: slug } = await params;
  const query = await searchParams;
  const menu = await getStadiumMenu(slug);
  if (!menu) notFound();

  return (
    <main data-has-cart-bar className="mx-auto w-full max-w-md px-4">
      <Hero name={menu.name} city={menu.city} vendorCount={menu.vendors.length}>
        <SeatStatus
          stadiumSlug={menu.slug}
          sections={menu.sections}
          fromQuery={{ section: query.section, row: query.row, seat: query.seat }}
        />
      </Hero>

      <Menu
        stadiumSlug={menu.slug}
        currency={menu.currency}
        vendors={menu.vendors}
        categories={menu.categories}
      />

      <CartBar stadiumSlug={menu.slug} currency={menu.currency} openCart={query.cart === "1"} />
    </main>
  );
}
