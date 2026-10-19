import { z } from "zod";
import { isOrderNumber } from "@/lib/orders/receipt";
import { toReceipt } from "@/lib/orders/shape";

/** Unknown slugs resolve to "not found" in the lookup, so any string is accepted here. */
export const stadiumSlug = z.string();

export const orderNumber = z
  .string()
  .transform((s) => s.toUpperCase())
  .refine(isOrderNumber, "Not an order number.");

export const deviceId = z.string().regex(/^[a-z0-9-]{8,64}$/i);

export const seat = z
  .object({ sectionCode: z.string(), sectionName: z.string(), row: z.string(), number: z.string() })
  .nullable();

export const quoteLine = z.object({
  productId: z.string(),
  qty: z.number(),
  note: z.string().optional(),
  options: z.array(z.string()).optional(),
});

/** Receipts keep their own hand-written parser; zod only decides whether it accepted the document. */
export const receipt = z.unknown().transform((value, ctx) => {
  const parsed = toReceipt(value);
  if (!parsed) {
    ctx.addIssue({ code: "custom", message: "Not a receipt." });
    return z.NEVER;
  }
  return parsed;
});

export const kitchenChange = z.discriminatedUnion("to", [
  z.object({ to: z.literal("new") }),
  z.object({ to: z.literal("accepted"), prepMinutes: z.number().optional() }),
  z.object({ to: z.literal("ready") }),
  z.object({ to: z.literal("done") }),
  z.object({ to: z.literal("declined"), reason: z.string() }),
]);
