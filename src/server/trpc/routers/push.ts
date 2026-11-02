import { z } from "zod";
import { locales } from "@/i18n/config";
import { followDesk, followOrder, unfollowDesk, unfollowOrder } from "@/lib/push/subscriptions";
import { kitchenProcedure, publicProcedure, router } from "../init";
import { orderNumber, pushSubscription, stadiumSlug } from "../schemas";

const locale = z.enum(locales);

export const pushRouter = router({
  /** Follow one order. Needs the receipt's write token. */
  followOrder: publicProcedure
    .input(z.object({ stadium: stadiumSlug, orderNumber, token: z.string().min(8).max(64), locale, subscription: pushSubscription }))
    .mutation(({ input }) => followOrder(input.stadium, input.orderNumber, input.token, input.locale, input.subscription)),

  unfollowOrder: publicProcedure.input(z.object({ orderNumber, endpoint: pushSubscription.shape.endpoint })).mutation(async ({ input }) => {
    await unfollowOrder(input.endpoint, input.orderNumber);
    return { ok: true as const };
  }),

  /** New-order alerts for the signed-in desk user on this device. */
  followDesk: kitchenProcedure
    .input(z.object({ stadium: stadiumSlug, locale, subscription: pushSubscription }))
    .mutation(({ ctx, input }) => followDesk(input.stadium, ctx.session.user.id, input.locale, input.subscription)),

  unfollowDesk: kitchenProcedure.input(z.object({ endpoint: pushSubscription.shape.endpoint })).mutation(async ({ ctx, input }) => {
    await unfollowDesk(input.endpoint, ctx.session.user.id);
    return { ok: true as const };
  }),
});
