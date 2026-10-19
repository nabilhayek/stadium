import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!client) client = new Stripe(key, { maxNetworkRetries: 2 });
  return client;
}

/** Publishable key. Safe to hand to the browser; the secret never is. */
export function publishableKey(): string | null {
  const key = process.env.STRIPE_PUB_KEY?.trim();
  if (!key?.startsWith("pk_")) return null;
  return key;
}
