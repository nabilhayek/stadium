import { Suspense } from "react";
import { connection } from "next/server";
import { PaymentReturn } from "@/components/checkout/payment-return";

type Props = { params: Promise<{ stadium: string }> };

/** Stripe's return URL is per payment. Do not prerender or cache this document. */
export const instant = false;

export default async function PaymentReturnPage({ params }: Props) {
  await connection();
  const { stadium } = await params;
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-6">
      <Suspense fallback={<p className="pt-16 text-[15px] text-muted">Confirming your payment…</p>}>
        <PaymentReturn stadiumSlug={stadium} />
      </Suspense>
    </main>
  );
}
