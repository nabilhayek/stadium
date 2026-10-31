# What to test

Work through this on your own phone and in the kitchen desk. The app is at `http://localhost:3000`. The seeded shop is `/arena`.

Do not press **Publish** or **Replace draft** on the seat map against the live database. A draft saves itself about a second after you edit. Automated Playwright runs use a throwaway test database only.

**Automated** (Vitest + Playwright under `tests/` and colocated `*.test.*`): language smoke and SEO headers, shop search/categories/QR seat, add-to-cart, checkout with fake Stripe, kitchen desk sign-in and board smoke, products create/sold-out, seat-map tools and publish dialog, assistant stub, admin tabs, axe on shop and login. What follows is still worth a human pass on a real phone, real Stripe test cards, and two live windows.

---

## 1. Language

*(Partially automated: device language and cookie persistence still need a real browser/phone pass. SEO bits in section 8 are covered by `i18n-seo.spec.ts`.)*

Swedish, Danish, and English. The first visit follows the phone or browser language. A choice you make is remembered on that device, for the shop and the kitchen.

Product names and category names stay as they were written in the menu. Checkout, order history, support, and the pages inside the desk (orders, products, seat map, admin) are still English. The menu, search, cart, kitchen navigation, and sign-in screen follow the language.

### Device language

1. In the browser, clear site data for localhost (cookies and local storage), or use a private window.
2. Set the browser or phone language to **Swedish** (`sv` or `sv-SE`). Reload `/arena`.
3. The hero should say **Beställ till din plats**. Search should say **Sök i menyn**. The category chip should say **Alla**.
4. Repeat with **Danish**. The hero should say **Bestil til din plads**.
5. Repeat with **English**. The hero should say **Order to your seat**.
6. Set the language to something else, such as Norwegian or French. The shop should fall back to English.

### Choosing a language, and remembering it

1. On the shop, open the round menu button (top right).
2. Under **Preferences** / **Inställningar** / **Indstillinger**, pick **Svenska**, **Dansk**, or **English**.
3. The menu, the hero, search, and the cart bar should switch. The page address stays `/arena`.
4. Close the tab and open `/arena` again. The same language should still be selected.
5. Open `/arena/management/login` on the same browser. Sign-in should be in that language, and the same three choices should be at the top. **Svenska** should already be selected if you picked Swedish in the shop.
6. Pick **English** there, then go back to `/arena`. The shop should be English too. One choice is shared by the shop and the kitchen on that device.
7. On a narrow window, open the kitchen desk (after signing in). The language control is a small menu in the top bar. On a wide window it is the row of three buttons above the account, at the bottom of the sidebar. Changing it should rename Overview, Orders, Products, Seat map, and Admin.

### What should not change

- Menu item names, prices, and the stadium name.
- Currency. That is a separate setting and does not follow the language.
- The **Currency** row in the shop menu. It still says coming soon.

---

## 2. Live order updates

*(Still manual. Integration covers the live hub and board mutations; Playwright kitchen is smoke-level. Two-window pay → accept → ready with a real card is not automated end-to-end.)*

The kitchen board and the fan’s order now update the moment something changes, instead of every 8–10 seconds. If the live connection drops, both fall back to checking on a timer, so nothing gets stuck.

You need two windows side by side: the kitchen board (`/arena/management/orders`, signed in) and a phone or second browser that has just placed an order (Stripe test card `4242 4242 4242 4242`, any future date, any CVC).

1. **New order reaches the kitchen.** Pay for an order on the phone. The card should appear in **New** on the board within a second or two, with the chime. The sidebar counts should go up too. No reload.
2. **Kitchen reaches the fan.** On the board, accept the order with a prep time. On the phone, the order page should switch to **Being prepared** with the new countdown, without a reload.
3. **Tracker pill.** On the phone, go back to the shop. The pill at the bottom should follow the order. Mark it **Ready** on the board. The pill should change to **On the way** or **Ready for pickup**.
4. **Decline.** Place another order and decline it on the board with a reason. The phone should show the decline and the reason.
5. **Two kitchen screens.** Open the board in two windows. Move a card in one. The other should follow within a second or two.
6. **Overview.** Leave `/arena/management` (Overview) open and place an order. The numbers should update by themselves.
7. **Connection drop.** In the phone’s browser dev tools, go offline for 20 seconds, then back online. Change the order on the board. The phone should catch up by itself.
8. **Dragging.** Start dragging a card on the board while another order comes in. The board should not jump under your finger. It should update when you let go.

---

## 3. Security headers

*(CSP / header smoke stays manual. Checkout pay is automated against fake Stripe; 3-D Secure and Apple/Google Pay still need Stripe test mode.)*

1. Open the shop, the order page, checkout, and the kitchen desk. Everything should look and work as before.
2. Pay with the test card at checkout. The card fields, Apple Pay / Google Pay buttons and 3-D Secure pop-up (card `4000 0027 6000 3184`) should all load.
3. Upload a product photo in the kitchen desk. The preview and the shop image should show.
4. In the browser dev tools console, there should be no red “Refused to load…” or “Content-Security-Policy” messages on any page.
5. On a Vercel preview link, the Vercel comment toolbar should still load.

---

## 4. Admin

*(Automated: tabs load after sign-in. Dirty/save/discard and role editing stay manual — settings are still client-only.)*

Open `/arena/management/admin` while signed in to the kitchen. This screen is saved in the page only. **Save changes** shows a toast. A refresh brings the old values back. The shop and checkout still use the currency stored for the stadium, not the one you pick here.

1. **Team.** The default roles are Admin, Manager, Kitchen, and Runner. Admin cannot be removed. Pickup is part of Kitchen, not its own role.
2. Create a role, give it a few permissions, and confirm it appears as a filter. Remove it. If people are on that role, you should be asked where to move them.
3. Open a person who is not an admin and turn on **Own permissions**. Their access should no longer follow the role. Turn it off and they follow the role again.
4. **Kitchens & routing.** The small map should highlight where a kitchen delivers. Switches should turn routing on and off.
5. **Ordering.** Seat delivery, delivery fee, free delivery over an amount, minimum order, and pickup (every kitchen, some kitchens, or off). There is no “items per order” field.
6. **Service & payments.** Change the currency (for example SEK). The money fields on **Ordering** should show that currency. Take orders, pre-orders, and the busy message are here. There are no fields for opens-before-kickoff, last call, closes-after-the-whistle, or half-time only.
7. Change something, press **Discard**, and confirm the change is gone. Change it again, press **Save changes**, see the toast, then refresh. The change should be gone. That is expected until saving is wired to the database.

---

## 5. Seat map

*(Automated on the test DB: tool rail, shortcuts, publish dialog, undo/redo via categories. Visual polish and assistant placeholder look stay manual. Do not publish on live Neon.)*

Open `/arena/management/seat-map`. Do not publish.

1. Open the objects list. Hover a section, a row, and a decoration. The canvas outline should be solid blue, including on decorations. It should clear when the pointer leaves.
2. Place or look at an assistant placeholder (the grey box). The fill, the shimmer, and the border should all be a darker grey than the canvas, and similar to each other.
3. Open the assistant from the toolbar. The star stays on that toolbar button. The drawer title should read **Assistant**, in the same style as the other drawer titles, with no star in the header.
4. The objects column, the inspector, and the issues panel should share the same header and close button.

---

## 6. Error reporting

Nothing to click in the shop. Fan phones should not feel slower.

1. Use the shop for a minute: open the menu, search, add something to the cart. The page should not load a session replay or sit on a spinner.
2. In the Sentry project **Web** (org `inseat`), new events from the shop should be errors only. Events from `/management` may include traces.
3. The browser’s network panel should send those events to this app (`/monitoring`), not straight to `sentry.io`.

---

## 7. The database sleeps when nobody orders

The kitchen board stays live while Neon is suspended. Nothing should touch the database until someone orders or changes an order. Test this on a Vercel preview or production, not locally. Locally the dev server keeps its own connections open.

1. Open the kitchen board (`/arena/management/orders`) and the Overview page, signed in. Leave both open.
2. Place no orders and change nothing for about 6 minutes.
3. In the Neon console, open the project’s **Monitoring** or **Branches** view. The compute should show as **Suspended** (idle) while the board is still open.
4. Place an order from a phone. The first one after a sleep is slower, because it waits for Neon to wake (a few seconds). The card should still reach the board without a reload.
5. Place a second order straight after. It should reach the board within a second or two.
6. Leave a fan’s order page open through the 6 quiet minutes as well. It should not wake the database either. When the kitchen changes that order, the phone should update.

If the compute never suspends, check what is still talking to it: a scheduled health check, an open Prisma Studio, or a desk tab running an old build.

---

## 8. Static shop and search engines

*(Automated: robots.txt, sitemap.xml, X-Robots-Tag on checkout, 404 for unknown stadium. OG preview in a chat app and `<html lang>` still need a human look.)*

1. Open `/arena`, `/sv/arena`, and `/da/arena`. All three should load. `/arena` should follow your language choice, as before.
2. Open `/arena?section=B&row=4&seat=9`, as a QR code would. The seat dialog should open with that seat filled in.
3. Open `/robots.txt`. It should allow the shops and disallow `/api/`, `/monitoring`, and the management, checkout, order, and orders pages.
4. Open `/sitemap.xml`. It should list the home page and each stadium, with Swedish, Danish, and English versions.
5. Paste a stadium link (`https://<your-domain>/arena`) into a chat app such as Slack or WhatsApp. The preview should show a dark card with the stadium name and city.
6. View the page source of `/arena`. The `<html lang>` should match the language you see, and there should be a `canonical` link to `/arena`.
7. The kitchen sign-in and desk pages should not appear in search: their source should contain `noindex`. Checkout, order, and order-history pages send an `X-Robots-Tag: noindex` header instead (dev tools, **Network**, the page request, **Response headers**).

---

## 9. Error and loading pages

*(Automated: `/nope` 404. Offline desk skeletons and slow-order skeletons stay manual.)*

1. Open a stadium that does not exist, such as `/nope`. You should get the app’s own not-found page, not a blank page.
2. Open a product that does not exist (`/arena/product/nope`). Same result.
3. With the kitchen desk open, go offline in the browser’s dev tools and click between Overview, Orders, and Products. You should see a grey skeleton while it waits, then a translated error with **Try again** if it fails. Go back online and press **Try again**. The page should load.
4. Open an order page (`/arena/order/<number>`) on a slow connection (dev tools, **Slow 4G**). A skeleton should show before the receipt.

---

## 10. Speed Insights

Only works on Vercel, not on `localhost`. Locally, the script returns 404, which is expected.

1. Deploy to a preview or production and open the shop and the kitchen desk on a phone for a few minutes.
2. In the Vercel dashboard, open the project and then **Speed Insights**. Data should appear within about 30 minutes, split by route (`/[locale]/[stadium]` and the management pages).
3. In the browser’s console on the deployed site, there should be no “Refused to load” message for `/_vercel/speed-insights/script.js`.
