import { startFakeStripe } from "../support/fake-stripe/server";

/**
 * Second `webServer` entry in playwright.config.ts: the fake Stripe REST API the Next app talks to through
 * STRIPE_API_BASE. It has to be a long-lived process on a fixed port because the app reads STRIPE_API_BASE at boot.
 * Specs reach the same instance over HTTP (e.g. to confirm a PaymentIntent, as Stripe.js would in a browser).
 */
const PORT = Number(process.env.PLAYWRIGHT_STRIPE_PORT ?? 3198);

startFakeStripe(PORT)
  .then(({ url }) => console.log(`[e2e-stripe] fake Stripe API on ${url}`))
  .catch((error) => {
    console.error("[e2e-stripe] failed to start", error);
    process.exit(1);
  });
