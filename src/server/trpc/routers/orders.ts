import { z } from "zod";
import { getReceipt, listReceipts, putReceipt } from "@/lib/orders/server";
import { publicProcedure, router } from "../init";
import { deviceId, orderNumber, receipt, stadiumSlug } from "../schemas";

export const ordersRouter = router({
  /** The public copy of one receipt. Null when the server has never seen it. */
  get: publicProcedure
    .input(z.object({ stadium: stadiumSlug, orderNumber }))
    .query(({ input }) => getReceipt(input.stadium, input.orderNumber)),

  /** History for one install, secrets included. */
  history: publicProcedure
    .input(z.object({ stadium: stadiumSlug, device: deviceId }))
    .query(({ input }) => listReceipts(input.stadium, input.device)),

  /** The phone pushes its receipt; the document must carry the write token. */
  put: publicProcedure.input(receipt).mutation(async ({ input }) => ({ result: await putReceipt(input) })),
});
