# Seat Service — stadium food delivery

Fans scan a QR code on their seat, land on `example.com/[stadium]`, and get the shop immediately.

**Stack:** Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind CSS v4 · HeroUI v3 · PostgreSQL · Prisma 7 · PWA.

## Run it

```bash
npm install
cp .env.example .env           # set DATABASE_URL

# Option A: you have PostgreSQL
#   DATABASE_URL="postgresql://user:pass@localhost:5432/stadium?schema=public"
# Option B: no Postgres installed — Prisma ships a local one
npm run db:dev                 # prints a postgres:// URL; put it in .env

npm run db:migrate             # apply prisma/migrations
npm run db:seed                # demo stadium at /arena
npm run dev                    # http://localhost:3000/arena
```

`npm run build` runs `prisma generate` first, so CI/hosts need `DATABASE_URL` at build time only if
you want `generateStaticParams` to pre-render venues (it falls back to on-demand rendering otherwise).

## Routes

| Route            | Rendering                                   | Purpose                                  |
| ---------------- | ------------------------------------------- | ---------------------------------------- |
| `/`              | static, revalidate 60s                      | Venue directory (fallback, not the QR target) |
| `/[stadium]`     | SSG + ISR 60s, on-demand for unknown slugs  | The shop: categories, vendors, products, cart |
| `/manifest.webmanifest` | static                               | PWA manifest                             |
| `/sw.js`         | static file                                 | Service worker (registered in production only) |

Customer flow (planned): scan QR → landing → **confirm seat** → browse → **add to cart** ✅ → checkout → payment → confirmation → live tracking → delivery.

## Why it's light

Measured on `/arena` (production build, gzip):

- **HTML** ~24 KB with the full menu server-rendered — usable before any JS runs.
- **CSS** ~9 KB. HeroUI is imported selectively (`button`, `chip`, `drawer`, `close-button`, `spinner`)
  instead of the ~430 KB full bundle. See `src/app/globals.css`.
- **JS** ~147 KB, of which ~138 KB is the React 19 + Next runtime baseline. App code is ~9 KB.
- **Cart drawer** (~41 KB, HeroUI `Drawer` + react-aria) is `next/dynamic` and downloads only when
  the cart is first opened.
- Hot-path buttons (20+ "Add" buttons, category chips, cart bar) use `PillButton` — a plain `<button>`
  with HeroUI's documented BEM classes — so react-aria is not in the initial bundle. The full
  `@heroui/react` `Button`/`Drawer` components are used inside the lazy drawer.
- Cart state is a ~1 KB `useSyncExternalStore` store persisted to `localStorage`, no state library.
- System font stack (no web-font download). Product images (when present) use `next/image` with lazy
  loading and a phone-sized `deviceSizes` set.
- Category filtering is client-side: a tap never hits the network (stadium connectivity is bad).
- Service worker: cache-first for hashed `/_next/static`, network-first for pages with offline fallback.

## Data model

`prisma/schema.prisma` — `Stadium` → `Section`, `Vendor` → `Product` (→ `Category`), `Order` → `OrderItem`.
Prices are integer cents. One order per vendor; a multi-vendor cart splits into several orders at checkout.
`Section`/`seatRow`/`seatNumber` on `Order` are the slots for the seat-confirmation step.

## Project layout

```
prisma/               schema, migrations, seed
prisma.config.ts      Prisma 7 config (DATABASE_URL lives here, not in the schema)
public/sw.js          service worker
public/icons/         PWA icons
src/app/              routes, layout, manifest, globals.css
src/components/shop/  menu, product card, add-to-cart, cart bar, cart drawer (lazy)
src/components/ui/    pill-button (HeroUI-styled native button)
src/lib/cart/         cart store + hooks
src/lib/queries/      cached Prisma queries (unstable_cache, 60s, tagged)
src/lib/db.ts         Prisma client singleton (pg driver adapter)
src/generated/prisma  generated client (git-ignored; `prisma generate`)
```

## Scripts

`dev` · `build` · `start` · `lint` · `typecheck` · `db:dev` · `db:migrate` · `db:deploy` · `db:seed` · `db:studio`
