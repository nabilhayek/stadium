# To do

Later work, roughly in the order it pays off.

## Rate limiting

- [ ] Limit sign-in and account creation per IP and per email (Better Auth has a built-in rate limiter; store it in Postgres, not memory, so it works across server instances).
- [ ] Limit payment intents and order writes (`orders.put`) per device and per IP.
- [ ] Limit the live order stream (`/api/live/orders`) per IP, so one client cannot open hundreds of connections.
- [ ] Turn on Vercel Firewall rules for the obvious ones (bots, a hard cap on `/api/auth`).
- [ ] Decide whether Upstash Redis is worth it, or whether a Postgres table is enough for this traffic.

## Two-factor sign-in for the kitchen

- [ ] Add Better Auth’s `twoFactor` plugin (authenticator app, with backup codes).
- [ ] Require it for the Admin and Manager roles; optional for Kitchen and Runner.
- [ ] Add “Trust this device for 30 days” so a shared kitchen tablet is not asked every shift.
- [ ] Recovery: an admin can reset another person’s two-factor from **Admin → Team**.

## Load testing with k6

- [ ] Script a match-day spike: thousands of fans opening the shop, a few hundred paying in the same minute, and every order stream open.
- [ ] Script the kitchen side: several boards open, cards moving every few seconds.
- [ ] Run against a Vercel preview with a Neon branch, never production.
- [ ] Watch: response times, Postgres connections, function duration, and how many live connections one server instance holds.
- [ ] Write down the numbers that pass, and rerun before each new venue.
- [ ] Separate from these scripts: a real Stripe test-mode run against Stripe’s API. Pay → accept → ready across two browsers stays a manual check.

## Backups

- [ ] Check Neon’s point-in-time restore window on the current plan; raise it to at least 7 days before the first real match.
- [ ] Practice a restore once: restore to a new branch, point a preview at it, and check that orders and the seat map are intact.
- [ ] A nightly `pg_dump` to storage outside Neon (a different provider), kept for 30 days.
- [ ] Back up Vercel Blob product photos, or keep the originals somewhere else.
- [ ] Write a short runbook: who restores, how long it takes, and what fans and kitchens see meanwhile.

## Uptime and status

- [ ] A health route that does not touch the database (for example `/api/health` returning the build id), watched by Sentry Cron or Better Stack.
- [ ] Never health-check the database on a schedule. A check every minute keeps Neon awake and defeats the sleep work.
- [ ] A public status page that fans and venue staff can open when the shop seems down.

## Privacy and legal

- [ ] A privacy policy and terms page, in Swedish, Danish, and English, linked from the shop menu and checkout.
- [ ] GDPR data export and delete for staff accounts.
- [ ] A retention job that removes or anonymises old receipts and orders after a set period.
- [ ] A data processing note for venues: what the app stores about fans (seat, order, optional email) and for how long.

## Audit log

- [ ] Record who accepted, declined, or refunded which order, and who changed prices or published the seat map.
- [ ] Show it in **Admin**, filterable by person and by day.

## Analytics

- [ ] Turn on Vercel Web Analytics (no cookies). Speed Insights is already in `src/app/[locale]/layout.tsx`.
- [ ] Track the funnel: shop opened, item added, checkout started, paid.

## Stripe operations

- [ ] Test that `paymentIntents.create` and `refunds.create` are called with an idempotency key. The calls in `src/lib/payments/service.ts` already pass one. Webhook replay is already covered (`tests/integration/webhook.test.ts`).
- [ ] Refund a finished order from the desk, and record who did it on the audit log. Declining an order already refunds (`tests/integration/kitchen.test.ts`). `autoRefundMinutes` is saved in Admin and never applied.
- [ ] Payouts per venue with Stripe Connect, if venues are paid directly.

## Accessibility

- [ ] A screen reader pass on the shop and checkout (VoiceOver on iPhone, TalkBack on Android).
- [ ] A contrast check of the shop’s muted text and the desk’s status colours.
- [ ] Translate the remaining English. “Add” and “Sold out” are still hardcoded in `src/components/shop/product-card.tsx`, `add-to-cart-button.tsx`, and `product-order.tsx` (visible label and screen-reader text). Checkout, the order tracker, order history, and support are still English too.

## Shop menu

- [ ] The currency row in the menu drawer is still “coming soon” (`ComingSoonRow` in `src/components/shop/nav-drawer.tsx`). Admin currency already drives prices.

## Performance

- [ ] Re-measure the shop’s JavaScript and a mobile Lighthouse run. The old notes (~370 KB gzipped, score 78, LCP 4.5 s) are not current until measured again.
- [ ] `LazyMotion` already loads `domMax` in `src/components/motion/motion.tsx`. After the new numbers, decide whether that feature set should stay.
- [ ] Sentry’s browser client still starts in `instrumentation-client.ts`. Load it after the page is interactive if the new trace puts it on the critical path.

## Support

- [ ] The page exists (`src/app/[locale]/[stadium]/support/page.tsx`) with four hardcoded English topics (where is my order, wrong seat, payment, allergies).
- [ ] The button is `mailto:support@seatservice.app`. Outgoing mail is sent from `seatize.com`. Point the button at a seatize.com address, or write down why this one stays.
- [ ] Translate the page (Swedish, Danish, English). Per-venue copy only if the answers should differ by stadium.
