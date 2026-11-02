"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { commitReceipt } from "@/lib/orders/sync";
import { recordOrdered } from "@/lib/orders/history";
import { useToast } from "@/components/toast/toast-provider";
import { useTRPCClient } from "@/lib/trpc/react";
import { useTranslations } from "next-intl";
import { trackFunnel } from "@/lib/analytics";

type Props = { stadiumSlug: string };

/** Bank redirects land here, still on our site, and we finish the order. */
export function PaymentReturn({ stadiumSlug }: Props) {
  const t = useTranslations("checkout");
  const params = useSearchParams();
  const router = useRouter();
  const [message, setMessage] = useState(t("returnBody"));
  const [failed, setFailed] = useState(false);
  const { toast } = useToast();
  const reported = useRef(false);
  const client = useTRPCClient();

  useEffect(() => {
    const paymentIntentId = params.get("payment_intent");
    const clientSecret = params.get("payment_intent_client_secret");
    const status = params.get("redirect_status");
    const fail = (text: string) => {
      setFailed(true);
      setMessage(text);
      if (reported.current) return;
      reported.current = true;
      toast({ message: text, status: "error" });
    };
    if (!paymentIntentId || !clientSecret) {
      fail(t("returnMissing"));
      return;
    }
    if (status === "failed") {
      fail(t("returnDeclined"));
      return;
    }

    let cancelled = false;
    void (async () => {
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          const data = await client.payments.finalize.mutate({ paymentIntentId, clientSecret });
          if (data.ok) {
            commitReceipt(data.receipt);
            recordOrdered(
              stadiumSlug,
              data.receipt.lines.flatMap((line) => Array.from({ length: line.qty }, () => line.productId)),
            );
            trackFunnel("paid", stadiumSlug);
            router.replace(`/${stadiumSlug}/order/${encodeURIComponent(data.receipt.orderNumber)}`);
            return;
          }
          if (data.status !== 202 && data.status < 500) {
            if (!cancelled) {
              fail(data.message || t("returnFailedBody"));
            }
            return;
          }
        } catch {
          /* the next attempt covers a dropped connection */
        }
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      }
      if (!cancelled) {
        setMessage(t("returnStill"));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, params, router, stadiumSlug, t, toast]);

  return (
    <div className="flex min-h-[70dvh] flex-col justify-center pr-12">
      <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em]">{failed ? t("returnFailed") : t("returnTitle")}</h1>
      <p className="mt-2 text-[15px] text-muted">{message}</p>
      {failed ? (
        <Link href={`/${stadiumSlug}/checkout`} className="button button--primary button--lg mt-8 w-full text-center">
          {t("backToCheckout")}
        </Link>
      ) : null}
    </div>
  );
}
