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

- [ ] In the browser, clear site data for localhost (cookies and local storage), or use a private window.
- [ ] Set the browser or phone language to **Swedish** (`sv` or `sv-SE`). Reload `/arena`.
- [ ] The hero says **Beställ till din plats**. Search says **Sök i menyn**. The category chip says **Alla**.
- [ ] Repeat with **Danish**. The hero says **Bestil til din plads**.
- [ ] Repeat with **English**. The hero says **Order to your seat**.
- [ ] Set the language to something else, such as Norwegian or French. The shop falls back to English.

### Choosing a language, and remembering it

- [ ] On the shop, open the round menu button (top right).
- [ ] Under **Preferences** / **Inställningar** / **Indstillinger**, pick **Svenska**, **Dansk**, or **English**.
- [ ] The menu, the hero, search, and the cart bar switch. The page address stays `/arena`.
- [ ] Close the tab and open `/arena` again. The same language is still selected.
- [ ] Open `/arena/management/login` on the same browser. Sign-in is in that language, and the same three choices are at the top. **Svenska** is already selected if you picked Swedish in the shop.
- [ ] Pick **English** there, then go back to `/arena`. The shop is English too. One choice is shared by the shop and the kitchen on that device.
- [ ] On a narrow window, open the kitchen desk (after signing in). The language control is a small menu in the top bar. On a wide window it is the row of three buttons above the account, at the bottom of the sidebar. Changing it renames Overview, Orders, Products, Seat map, and Admin.

### What should not change

- [ ] Menu item names, prices, and the stadium name stay as written.
- [ ] Currency does not follow the language. It follows the admin setting (section 4).
- [ ] The **Currency** row in the shop menu still says coming soon.

---

## 2. Live order updates

*(Still manual. Integration covers the live hub and board mutations; Playwright kitchen is smoke-level. Two-window pay → accept → ready with a real card is not automated end-to-end.)*

The kitchen board and the fan’s order update the moment something changes, instead of every 8–10 seconds. If the live connection drops, both fall back to checking on a timer, so nothing gets stuck.

You need two windows side by side: the kitchen board (`/arena/management/orders`, signed in) and a phone or second browser that has just placed an order (Stripe test card `4242 4242 4242 4242`, any future date, any CVC).

- [ ] **New order reaches the kitchen.** Pay for an order on the phone. The card appears in **New** on the board within a second or two, with the chime. The sidebar counts go up too. No reload.
- [ ] **Kitchen reaches the fan.** On the board, accept the order with a prep time. On the phone, the order page switches to **Being prepared** with the new countdown, without a reload.
- [ ] **Tracker pill.** On the phone, go back to the shop. The pill at the bottom follows the order. Mark it **Ready** on the board. The pill changes to **On the way** or **Ready for pickup**.
- [ ] **Decline.** Place another order and decline it on the board with a reason. The phone shows the decline and the reason.
- [ ] **Two kitchen screens.** Open the board in two windows. Move a card in one. The other follows within a second or two.
- [ ] **Overview.** Leave `/arena/management` (Overview) open and place an order. The numbers update by themselves.
- [ ] **Connection drop.** In the phone’s browser dev tools, go offline for 20 seconds, then back online. Change the order on the board. The phone catches up by itself.
- [ ] **Dragging.** Start dragging a card on the board while another order comes in. The board does not jump under your finger. It updates when you let go.

---

## 3. Security headers

*(CSP / header smoke stays manual. Checkout pay is automated against fake Stripe; 3-D Secure and Apple/Google Pay still need Stripe test mode.)*

- [ ] Open the shop, the order page, checkout, and the kitchen desk. Everything looks and works as before.
- [ ] Pay with the test card at checkout. The card fields, Apple Pay / Google Pay buttons and 3-D Secure pop-up (card `4000 0027 6000 3184`) all load.
- [ ] Upload a product photo in the kitchen desk. The preview and the shop image show.
- [ ] In the browser dev tools console, there are no red “Refused to load…” or “Content-Security-Policy” messages on any page.
- [ ] On a Vercel preview link, the Vercel comment toolbar still loads.

---

## 4. Admin

*(Automated: tabs load after sign-in, and a save round-trips through the test database. The live desk still needs a human pass. Do this on the dev database, then put the switches back.)*

Open `/arena/management/admin` while signed in to the kitchen. **Save changes** writes to the database. A refresh keeps what you saved.

- [ ] **Team.** The default roles are Admin, Manager, Kitchen, and Runner. Admin cannot be removed. Pickup is part of Kitchen, not its own role.
- [ ] Create a role, give it a few permissions, and confirm it appears as a filter. Remove it. If people are on that role, you are asked where to move them.
- [ ] Open a person who is not an admin and turn on **Own permissions**. Their access no longer follows the role. Turn it off and they follow the role again.
- [ ] **Kitchens & routing.** The small map highlights where a kitchen delivers. Switches turn routing on and off.
- [ ] **Ordering.** Seat delivery, delivery fee, free delivery over an amount, minimum order, and pickup (every kitchen, some kitchens, or off). There is no “items per order” field.
- [ ] **Service & payments.** Change the currency (for example SEK). The money fields on **Ordering** show that currency. Take orders, pre-orders, and the busy message are here. There are no fields for opens-before-kickoff, last call, closes-after-the-whistle, or half-time only.
- [ ] Change something, press **Discard**, and confirm the change is gone.
- [ ] Change it again, press **Save changes**, see the toast, then refresh. The change is still there.
- [ ] After a currency change, reload `/arena`. Prices use the new currency. Set the currency back to **EUR** and save before you stop.
- [ ] Turn **Take orders** off and save. Open checkout. It says **Ordering is paused** and there is no pay button. Turn **Take orders** back on, save, and confirm checkout shows the pay button again.

---

## 5. Seat map

*(Automated on the test DB: tool rail, shortcuts, publish dialog, undo/redo via categories. Visual polish and assistant placeholder look stay manual. Do not publish on live Neon.)*

Open `/arena/management/seat-map`. Do not publish.

- [ ] Open the objects list. Hover a section, a row, and a decoration. The canvas outline is solid blue, including on decorations. It clears when the pointer leaves.
- [ ] Place or look at an assistant placeholder (the grey box). The fill, the shimmer, and the border are a darker grey than the canvas, and similar to each other.
- [ ] Open the assistant from the toolbar. The star stays on that toolbar button. The drawer title reads **Assistant**, in the same style as the other drawer titles, with no star in the header.
- [ ] The objects column, the inspector, and the issues panel share the same header and close button.

---

## 6. Error reporting

Nothing to click in the shop. Fan phones should not feel slower.

- [ ] Use the shop for a minute: open the menu, search, add something to the cart. The page does not load a session replay or sit on a spinner.
- [ ] In the Sentry project **Web** (org `inseat`), new events from the shop are errors only. Events from `/management` may include traces.
- [ ] The browser’s network panel sends those events to this app (`/monitoring`), not straight to `sentry.io`.

---

## 7. The database sleeps when nobody orders

The kitchen board stays live while Neon is suspended. Nothing should touch the database until someone orders or changes an order. Test this on a Vercel preview or production, not locally. Locally the dev server keeps its own connections open.

- [ ] Open the kitchen board (`/arena/management/orders`) and the Overview page, signed in. Leave both open.
- [ ] Place no orders and change nothing for about 6 minutes.
- [ ] In the Neon console, open the project’s **Monitoring** or **Branches** view. The compute shows as **Suspended** (idle) while the board is still open.
- [ ] Place an order from a phone. The first one after a sleep is slower, because it waits for Neon to wake (a few seconds). The card still reaches the board without a reload.
- [ ] Place a second order straight after. It reaches the board within a second or two.
- [ ] Leave a fan’s order page open through the 6 quiet minutes as well. It does not wake the database either. When the kitchen changes that order, the phone updates.

If the compute never suspends, check what is still talking to it: a scheduled health check, an open Prisma Studio, or a desk tab running an old build.

---

## 8. Static shop and search engines

*(Automated: robots.txt, sitemap.xml, X-Robots-Tag on checkout, 404 for unknown stadium. OG preview in a chat app and `<html lang>` still need a human look.)*

- [ ] Open `/arena`, `/sv/arena`, and `/da/arena`. All three load. `/arena` follows your language choice, as before.
- [ ] Open `/arena?section=B&row=4&seat=9`, as a QR code would. The seat dialog opens with that seat filled in.
- [ ] Open `/robots.txt`. It allows the shops and disallows `/api/`, `/monitoring`, and the management, checkout, order, and orders pages.
- [ ] Open `/sitemap.xml`. It lists the home page and each stadium, with Swedish, Danish, and English versions.
- [ ] Paste a stadium link (`https://<your-domain>/arena`) into a chat app such as Slack or WhatsApp. The preview shows a dark card with the stadium name and city.
- [ ] View the page source of `/arena`. The `<html lang>` matches the language you see, and there is a `canonical` link to `/arena`.
- [ ] The kitchen sign-in and desk pages do not appear in search: their source contains `noindex`. Checkout, order, and order-history pages send an `X-Robots-Tag: noindex` header instead (dev tools, **Network**, the page request, **Response headers**).

---

## 9. Error and loading pages

*(Automated: `/nope` 404. Offline desk skeletons and slow-order skeletons stay manual.)*

- [ ] Open a stadium that does not exist, such as `/nope`. You get the app’s own not-found page, not a blank page.
- [ ] Open a product that does not exist (`/arena/product/nope`). Same result.
- [ ] With the kitchen desk open, go offline in the browser’s dev tools and click between Overview, Orders, and Products. You see a grey skeleton while it waits, then a translated error with **Try again** if it fails. Go back online and press **Try again**. The page loads.
- [ ] Open an order page (`/arena/order/<number>`) on a slow connection (dev tools, **Slow 4G**). A skeleton shows before the receipt.

---

## 10. Speed Insights

Only works on Vercel, not on `localhost`. Locally, the script returns 404, which is expected.

- [ ] Deploy to a preview or production and open the shop and the kitchen desk on a phone for a few minutes.
- [ ] In the Vercel dashboard, open the project and then **Speed Insights**. Data appears within about 30 minutes, split by route (`/[locale]/[stadium]` and the management pages).
- [ ] In the browser’s console on the deployed site, there is no “Refused to load” message for `/_vercel/speed-insights/script.js`.

---

## 11. Email

Needs `RESEND_API_KEY` on the machine or deployment you are using, and a real inbox you can open. Mail follows the language selected in the shop or on the desk (Swedish, Danish, or English). Use your own address.

- [ ] On `/arena/management/login`, choose a language, then **Forgot password?** and submit the kitchen email. The toast says the link is on its way. The mail is in that language and the link opens a page where you set a new password. Sign in with the new password, then set it back if you need the old one.
- [ ] In **Admin → Team**, add yourself with a role and save. The toast says the invite is on its way. The mail is in the desk’s language and the link lets you set a password. After that, that address can sign in to the desk.
- [ ] Place an order, open its page, and save an email for the receipt. A receipt arrives in the shop’s language, with the order code and the seat. Save the same address again: no second mail. Change the address and save: a new receipt goes to the new address.
