import { z } from "zod";
import type { Permission } from "@/components/management/admin/model";
import { boardSummary, kitchenOverview, listDeskOrders, RANGES, type RangeKey } from "@/lib/management/orders";
import { refundFinishedOrder, updateKitchenOrder } from "@/lib/management/update";
import { assertCan, guarded, router, venueProcedure } from "../init";
import { kitchenChange, orderNumber } from "../schemas";

const range = z.enum(Object.keys(RANGES) as [RangeKey, ...RangeKey[]]);

/** Handing an order over is the runner's job; every other move on the board is the kitchen's. */
function permissionFor(to: z.infer<typeof kitchenChange>["to"]): Permission {
  return to === "done" ? "orders.deliver" : "orders.update";
}

export const kitchenRouter = router({
  /** Everything on the board, oldest first. */
  board: guarded("orders.view").query(({ input }) => listDeskOrders(input.stadium)),

  /** Column counts and late tickets for the sidebar. Every team member sees the sidebar. */
  summary: venueProcedure.query(({ input }) => boardSummary(input.stadium)),

  overview: guarded("orders.view")
    .input(z.object({ range }))
    .query(({ input }) => kitchenOverview(input.stadium, input.range)),

  update: guarded("orders.update", "orders.deliver")
    .input(z.object({ orderNumber, change: kitchenChange }))
    .mutation(({ input, ctx }) => {
      assertCan(ctx.access, permissionFor(input.change.to));
      return updateKitchenOrder(input.stadium, input.orderNumber, input.change, { userId: ctx.session.user.id, email: ctx.session.user.email });
    }),

  /** Refund a completed (done) order from Overview. Declines on the board already refund. */
  refund: guarded("orders.refund")
    .input(z.object({ orderNumber, reason: z.string().max(200).optional() }))
    .mutation(({ input, ctx }) =>
      refundFinishedOrder(input.stadium, input.orderNumber, { userId: ctx.session.user.id, email: ctx.session.user.email }, input.reason),
    ),
});
