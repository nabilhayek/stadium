# To do

Later work, roughly in the order it pays off.

## Email with Resend

- [x] Create a Resend account and verify the sending domain (SPF, DKIM, DMARC records). `seatize.com` is verified.
- [x] Add `RESEND_API_KEY` to `.env.example`, `.env.local`, and Vercel.
- [x] Hook Better Auth’s password reset and email verification to Resend.
- [x] Send a receipt email when the fan left an email at checkout.
- [x] Send invites from **Admin → Team**, once the team list is saved to the database.
- [x] Write the emails in Swedish, Danish, and English, using the same language files as the app.

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

## Testing libraries

- [x] **Vitest** for pure logic: money, receipt merging, board status changes, seat-map geometry, `matchAcceptLanguage`, plus component and integration layers (embedded Postgres locally; CI Postgres service).
- [x] **Playwright** for the flows in `MANUAL-TEST.md`: shop, checkout (fake Stripe), kitchen desk smoke, products, seat map, assistant (stubbed stream), admin, auth, i18n/SEO, axe a11y. See `MANUAL-TEST.md` for what stays manual.
- [x] A separate test database (embedded Postgres on localhost locally; throwaway service DB in CI) so tests never touch live Neon.
- [x] Run unit, integration, and e2e in GitHub Actions next to format, lint, and typecheck. Coverage is report-only for now; thresholds of 80% lines on `src/lib/**` and `src/server/**` come after the suite settles.
- [ ] Out of scope for this suite: k6 load tests, a real Stripe test-mode run against Stripe’s API, server-side admin roles persisted to the database, full kitchen live two-context pay→accept→ready with two browsers (partially covered by integration + desk smoke).

## Load testing with k6

- [ ] Script a match-day spike: thousands of fans opening the shop, a few hundred paying in the same minute, and every order stream open.
- [ ] Script the kitchen side: several boards open, cards moving every few seconds.
- [ ] Run against a Vercel preview with a Neon branch, never production.
- [ ] Watch: response times, Postgres connections, function duration, and how many live connections one server instance holds.
- [ ] Write down the numbers that pass, and rerun before each new venue.

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

## Feature flags and kill switches

- [ ] “Pause ordering at this stadium”: the shop stays open but checkout says ordering is paused.
- [ ] “Hide product” and “sold out everywhere” switches that work without a deploy.
- [ ] Decide between Vercel Flags and a flag table in Postgres. A database flag must be cached, or every shop view wakes Neon.

## Privacy and legal

- [ ] A privacy policy and terms page, in Swedish, Danish, and English, linked from the shop menu and checkout.
- [ ] GDPR data export and delete for staff accounts.
- [ ] A retention job that removes or anonymises old receipts and orders after a set period.
- [ ] A data processing note for venues: what the app stores about fans (seat, order, optional email) and for how long.

## Audit log

- [ ] Record who accepted, declined, or refunded which order, and who changed prices or published the seat map.
- [ ] Show it in **Admin**, filterable by person and by day.

## Analytics

- [ ] Turn on Vercel Web Analytics (no cookies) next to Speed Insights.
- [ ] Track the funnel: shop opened, item added, checkout started, paid.

## Stripe operations

- [ ] Idempotency keys on every payment intent and refund call.
- [ ] Check webhook retries: replaying the same event must not create a second order or a second status change.
- [ ] A refunds flow in the desk, tied to the audit log.
- [ ] Payouts per venue with Stripe Connect, if venues are paid directly.

## Accessibility

- [ ] A screen reader pass on the shop and checkout (VoiceOver on iPhone, TalkBack on Android).
- [ ] A contrast check of the shop’s muted text and the desk’s status colours.
- [ ] Translate the rest of the shop’s English labels (“Add”, “Sold out”, product-card screen reader text), not just the shop chrome.

## Performance

- [ ] The shop loads about 370 KB of JavaScript (gzipped) before it is interactive. Lighthouse mobile scores it 78, with LCP at 4.5 s on a simulated slow phone.
- [ ] The biggest pieces are React DOM with the Sentry client (about 120 KB) and `framer-motion` (about 75 KB across chunks). Try `LazyMotion` with the `domAnimation` feature set, and load Sentry’s client after the page is interactive.

## Support

- [ ] A support contact and a short FAQ per venue (where is my order, refunds, allergens).
