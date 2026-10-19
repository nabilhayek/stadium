import { z } from "zod";
import { boardSummary, kitchenOverview, listDeskOrders, RANGES, type RangeKey } from "@/lib/management/orders";
import { updateKitchenOrder } from "@/lib/management/update";
import { kitchenProcedure, router } from "../init";
import { kitchenChange, orderNumber, stadiumSlug } from "../schemas";

const range = z.enum(Object.keys(RANGES) as [RangeKey, ...RangeKey[]]);

export const kitchenRouter = router({
  /** Everything on the board, oldest first. */
  board: kitchenProcedure.input(z.object({ stadium: stadiumSlug })).query(({ input }) => listDeskOrders(input.stadium)),

  /** Column counts and late tickets for the sidebar. */
  summary: kitchenProcedure.input(z.object({ stadium: stadiumSlug })).query(({ input }) => boardSummary(input.stadium)),

  overview: kitchenProcedure
    .input(z.object({ stadium: stadiumSlug, range }))
    .query(({ input }) => kitchenOverview(input.stadium, input.range)),

  update: kitchenProcedure
    .input(z.object({ stadium: stadiumSlug, orderNumber, change: kitchenChange }))
    .mutation(({ input }) => updateKitchenOrder(input.stadium, input.orderNumber, input.change)),
});
