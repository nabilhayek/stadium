import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api } from "@/server/trpc/server";
import { CheckoutView } from "@/components/checkout/checkout-view";
import { publishableKey } from "@/lib/stripe";

type Props = { params: Promise<{ stadium: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stadium } = await params;
  const menu = await api.stadium.menu({ slug: stadium });
  if (!menu) return { title: "Checkout" };
  return {
    title: `Checkout · ${menu.name}`,
    description: `Pay and send food to your seat at ${menu.name}.`,
  };
}

export default async function CheckoutPage({ params }: Props) {
  const { stadium: slug } = await params;
  const menu = await api.stadium.menu({ slug });
  if (!menu) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-6">
      <link rel="preconnect" href="https://js.stripe.com" />
      <link rel="preconnect" href="https://api.stripe.com" />
      <CheckoutView
        stadiumSlug={menu.slug}
        stadiumName={menu.name}
        currency={menu.currency}
        sections={menu.sections}
        publishableKey={publishableKey()}
      />
    </main>
  );
}
