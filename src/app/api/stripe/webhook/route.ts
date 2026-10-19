import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { finalizeFromStripe, markPaymentFailed, markPaymentProcessing, markRefunded } from "@/lib/payments/service";

export const runtime = "nodejs";

/**
 * Backup for a phone that pays and then loses signal.
 * The order is created here even if the browser never calls us back.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("missing signature", { status: 400 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await finalizeFromStripe(event.data.object.id);
        break;
      case "payment_intent.processing":
        await markPaymentProcessing(event.data.object.id);
        break;
      case "payment_intent.payment_failed": {
        const intent = event.data.object;
        await markPaymentFailed(intent.id, intent.last_payment_error?.decline_code ?? intent.last_payment_error?.code ?? null, intent.status);
        break;
      }
      case "payment_intent.canceled":
        await markPaymentFailed(event.data.object.id, "canceled", "canceled");
        break;
      case "charge.refunded": {
        const charge = event.data.object;
        const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (intentId) await markRefunded(intentId, null);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("stripe webhook failed", event.type, error);
    return new Response("retry", { status: 500 });
  }

  return new Response("ok");
}
