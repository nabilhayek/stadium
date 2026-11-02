# To do

Later work, roughly in the order it pays off.

## Rate limiting

- [ ] Limit sign-in and account creation per IP and per email (Better Auth has a built-in rate limiter; store it in Postgres, not memory, so it works across server instances).
- [ ] Limit payment intents and order writes (`orders.put`) per device and per IP.
- [ ] Limit the live order stream (`/api/live/orders`) per IP, so one client cannot open hundreds of connections.
- [ ] Turn on Vercel Firewall rules for the obvious ones (bots, a hard cap on `/api/auth`).
- [ ] Decide whether Upstash Redis is worth it, or whether a Postgres table is enough for this traffic.

## Two-factor sign-in for the kitchen

- [x] Add Better Auth’s `twoFactor` plugin (authenticator app, with backup codes). Setup page: `/<stadium>/management/security`.
- [x] Require it for the Admin and Manager roles; optional for Kitchen and Runner. Enforced in the desk layout, in `kitchenProcedure`, and by blocking “turn off” for those roles. Accounts with no staff row (the bootstrap account) are not forced.
- [x] Add “Trust this device for 30 days” so a shared kitchen tablet is not asked every shift.
- [x] Recovery: an admin can reset another person’s two-factor from **Admin → Team**. It also signs them out, drops trusted devices, and writes an audit row.

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

- [x] `GET /api/health` returns `{ ok, buildId }` and does not touch the database. Point Sentry Cron or Better Stack at it by hand; the app does not poll itself.
- [x] No scheduled database health check. Auto-refund is a nightly backstop plus a sweep when the orders board is open, so a quiet day does not keep Neon awake.
- [x] Public status page at `/status` (shop menu links to it). It fetches `/api/health` only.

## Privacy and legal

- [x] Privacy, terms, and a venue data note at `/privacy`, `/terms`, and `/venues/data`, in Swedish, Danish, and English. Linked from the shop menu and checkout. Admin → Payments links the venue note.
- [x] Staff accounts can download their data and delete the account from Admin → Team. The last active admin at a venue cannot delete themselves. Fans have no accounts; the privacy page tells them to email support.
- [x] Nightly `/api/cron/retention` anonymises receipts older than `RECEIPT_RETENTION_DAYS` (default 365, `0` turns it off). Totals and order numbers stay.
- [x] `/venues/data` says what is stored (seat, order, optional email) and for how long.

## Audit log

- [x] `AuditEvent` records accept, decline, refund, auto-refund, price changes, and seat-map publish.
- [x] Admin → Activity lists the latest events, filterable by person and by day in the venue timezone.

## Analytics

- [x] Vercel Web Analytics is on next to Speed Insights (no cookies).
- [x] Funnel events: `shop_opened`, `item_added`, `checkout_started`, `paid`.

## Stripe operations

- [x] `paymentIntents.create` and `refunds.create` use an idempotency key. Covered in `tests/integration/payments.test.ts` and `tests/integration/kitchen.test.ts`. Webhook replay stays in `tests/integration/webhook.test.ts`.
- [x] Refund a finished order from the desk, and record who did it. Declining an order already refunds. `autoRefundMinutes` is applied while the orders board is open, with a nightly `/api/cron/auto-refund` backstop. A five-minute cron was removed so it does not keep Neon awake.
- [x] Payouts per venue are not built. Venues are not Stripe Connect accounts. Refunds stay on the platform account. Settle with venues outside the app until Connect is a real product decision.

## Accessibility

- [ ] A device screen-reader pass (VoiceOver / TalkBack) still needs a person with a phone. Labels and live status text are in place; the agent cannot complete that pass.
- [x] Shop muted text is `#4e4e49` (was `#6b6b66`). Desk order-type chips use darker fills so white text clears contrast. Status is text plus a colour dot.
- [x] Shop add / sold out, checkout, the order tracker, order history, and support follow the selected language. Desk pages stay English.

## Shop menu

- [x] The drawer shows the venue currency from the menu (the same code Admin uses for prices), plus privacy, terms, and status. The “coming soon” currency row is gone.

## Performance

- [x] Measured 2 Nov 2026 on a production build (`next start`, Lighthouse mobile, simulated slow 4G, `/en/arena`): performance 79, accessibility 100, best practices 96, SEO 100. FCP 1.2 s, LCP 4.6 s, TBT 250 ms, CLS 0. Shop scripts are 369 KB transferred (1.3 MB parsed, 28 files), so the old ~370 KB / 78 / 4.5 s numbers still hold. Real LCP on the local server was about 0.3 s; the 4.6 s is mostly Lighthouse’s 4x CPU slowdown. If it matters: trim unused JS (about 48 KB flagged) and render-blocking CSS (about 430 ms).
- [x] `LazyMotion` stays on `domMax`. Toasts use drag and the shop uses `layoutId`; `domAnimation` would drop those.
- [x] Sentry’s browser init waits for idle (2s timeout). Next still loads `instrumentation-client.ts` early because the router transition hook has to be a static export.

## Support

- [x] One shared support page, translated (sv/da/en). Topics do not differ by stadium.
- [x] The button is `mailto:support@seatize.com`. Create that mailbox; `orders@seatize.com` is the transactional From address, not the support inbox.
