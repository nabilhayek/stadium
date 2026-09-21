import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStadiumMenu } from "@/lib/queries/stadium";
import { CheckoutView } from "@/components/checkout/checkout-view";

type Props = { params: Promise<{ stadium: string }> };

export const revalidate = 60;
export const dynamicParams = true;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { stadium } = await params;
  const menu = await getStadiumMenu(stadium);
  if (!menu) return { title: "Checkout" };
  return {
    title: `Checkout · ${menu.name}`,
    description: `Pay and send food to your seat at ${menu.name}.`,
  };
}

export default async function CheckoutPage({ params }: Props) {
  const { stadium: slug } = await params;
  const menu = await getStadiumMenu(slug);
  if (!menu) notFound();

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-6">
      <CheckoutView
        stadiumSlug={menu.slug}
        stadiumName={menu.name}
        currency={menu.currency}
        sections={menu.sections}
      />
    </main>
  );
}
