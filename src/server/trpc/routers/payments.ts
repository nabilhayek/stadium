import { z } from "zod";
import { chargeExtra, finalizeCheckout, prepareCheckout } from "@/lib/payments/service";
import { publicProcedure, router } from "../init";
import { quoteLine, seat, stadiumSlug } from "../schemas";

/**
 * Business outcomes come back as `{ ok: false, status, message }` rather than
 * thrown errors: callers retry on 202 and 5xx and stop on anything else.
 * A thrown error means the request itself failed and is always worth retrying.
 */
export const paymentsRouter = router({
  /** Open a PaymentIntent for the current basket. Retries reuse the same charge. */
  prepare: publicProcedure
    .input(
      z.object({
        stadiumSlug,
        orderNumber: z.string(),
        deviceId: z.string(),
        token: z.string(),
        confirmCode: z.string(),
        fulfillment: z.enum(["delivery", "pickup"]),
        timing: z.enum(["asap", "scheduled"]),
        scheduledAt: z.number().nullable(),
        etaMin: z.number(),
        etaMax: z.number(),
        seat,
        lines: z.array(quoteLine),
      }),
    )
    .mutation(({ input }) => prepareCheckout(input)),

  /** After Stripe.js confirms, write the kitchen ticket. Safe to retry. */
  finalize: publicProcedure
    .input(z.object({ paymentIntentId: z.string().min(1), clientSecret: z.string().min(1) }))
    .mutation(({ input }) => finalizeCheckout(input.paymentIntentId, input.clientSecret)),

  /** Charge the saved card for a drink added after the first payment. */
  extra: publicProcedure
    .input(
      z.object({
        stadiumSlug,
        orderNumber: z.string().min(1),
        token: z.string().min(1),
        idempotencyKey: z.string().min(1),
        lines: z.array(quoteLine),
      }),
    )
    .mutation(({ input }) => chargeExtra(input)),
});
