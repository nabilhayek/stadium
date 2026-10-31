import { z } from "zod";
import { getVenueAdmin, resendStaffInvite, saveVenueAdmin } from "@/lib/management/admin";
import { requestLocale } from "@/lib/email/receipt";
import { kitchenProcedure, router } from "../init";
import { stadiumSlug } from "../schemas";

/** Desk admin. Reads and writes stay behind the kitchen session; the document is checked before it is stored. */
export const adminRouter = router({
  get: kitchenProcedure.input(z.object({ stadium: stadiumSlug })).query(({ input }) => getVenueAdmin(input.stadium)),

  save: kitchenProcedure.input(z.object({ stadium: stadiumSlug, settings: z.unknown() })).mutation(async ({ input }) => {
    return saveVenueAdmin(input.stadium, input.settings, await requestLocale());
  }),

  resendInvite: kitchenProcedure.input(z.object({ stadium: stadiumSlug, memberId: z.string().min(1).max(40) })).mutation(async ({ input }) => {
    return resendStaffInvite(input.stadium, input.memberId, await requestLocale());
  }),
});
