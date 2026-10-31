import Stripe from "stripe";

let client: Stripe | null = null;

/** Point the SDK at a local fake during tests. Never allowed on Vercel production. */
function testApiBase(): { host: string; port: number; protocol: "http" | "https" } | undefined {
  const base = process.env.STRIPE_API_BASE?.trim();
  if (!base || process.env.VERCEL_ENV === "production") return undefined;
  const url = new URL(base);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
    protocol: url.protocol === "https:" ? "https" : "http",
  };
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!client) {
    client = new Stripe(key, {
      maxNetworkRetries: 2,
      ...testApiBase(),
    });
  }
  return client;
}

/** Drop the cached client so the next call picks up a new STRIPE_API_BASE. Tests only. */
export function resetStripeClient() {
  client = null;
}

/** Publishable key. Safe to hand to the browser; the secret never is. */
export function publishableKey(): string | null {
  const key = process.env.STRIPE_PUB_KEY?.trim();
  if (!key?.startsWith("pk_")) return null;
  return key;
}
