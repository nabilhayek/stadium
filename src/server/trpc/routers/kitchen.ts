import { z } from "zod";
import { boardSummary, kitchenOverview, listDeskOrders, RANGES, type RangeKey } from "@/lib/management/orders";
import { refundFinishedOrder, updateKitchenOrder } from "@/lib/management/update";
import { kitchenProcedure, router } from "../init";
import { kitchenChange, orderNumber, stadiumSlug } from "../schemas";

const range = z.enum(Object.keys(RANGES) as [RangeKey, ...RangeKey[]]);

export const kitchenRouter = router({
  /** Everything on the board, oldest first. */
  board: kitchenProcedure.input(z.object({ stadium: stadiumSlug })).query(({ input }) => listDeskOrders(input.stadium)),

  /** Column counts and late tickets for the sidebar. */
  summary: kitchenProcedure.input(z.object({ stadium: stadiumSlug })).query(({ input }) => boardSummary(input.stadium)),

  overview: kitchenProcedure.input(z.object({ stadium: stadiumSlug, range })).query(({ input }) => kitchenOverview(input.stadium, input.range)),

  update: kitchenProcedure.input(z.object({ stadium: stadiumSlug, orderNumber, change: kitchenChange })).mutation(({ input, ctx }) =>
    updateKitchenOrder(input.stadium, input.orderNumber, input.change, {
      userId: ctx.session.user.id,
      email: ctx.session.user.email,
    }),
  ),

  /** Refund a completed (done) order from Overview. Declines on the board already refund. */
  refund: kitchenProcedure
    .input(z.object({ stadium: stadiumSlug, orderNumber, reason: z.string().max(200).optional() }))
    .mutation(({ input, ctx }) =>
      refundFinishedOrder(input.stadium, input.orderNumber, { userId: ctx.session.user.id, email: ctx.session.user.email }, input.reason),
    ),
});
