import { Suspense } from "react";
import { PaymentReturn } from "@/components/checkout/payment-return";

type Props = { params: Promise<{ stadium: string }> };

export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({ params }: Props) {
  const { stadium } = await params;
  return (
    <main className="mx-auto w-full max-w-md px-4 pt-6">
      <Suspense fallback={<p className="pt-16 text-[15px] text-muted">Confirming your payment…</p>}>
        <PaymentReturn stadiumSlug={stadium} />
      </Suspense>
    </main>
  );
}
