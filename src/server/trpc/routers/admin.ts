import { z } from "zod";
import { getVenueAdmin, inviteStaff, resendStaffInvite, saveVenueAdmin } from "@/lib/management/admin";
import { listAudit } from "@/lib/management/audit";
import { requestLocale } from "@/lib/email/receipt";
import { resetTwoFactor } from "@/lib/management/two-factor";
import { kitchenProcedure, router } from "../init";
import { stadiumSlug } from "../schemas";

/** Desk admin. Reads and writes stay behind the kitchen session; the document is checked before it is stored. */
export const adminRouter = router({
  get: kitchenProcedure.input(z.object({ stadium: stadiumSlug })).query(({ input }) => getVenueAdmin(input.stadium)),

  save: kitchenProcedure.input(z.object({ stadium: stadiumSlug, settings: z.unknown() })).mutation(async ({ input }) => {
    return saveVenueAdmin(input.stadium, input.settings, await requestLocale());
  }),

  invite: kitchenProcedure
    .input(
      z.object({
        stadium: stadiumSlug,
        name: z.string().max(80),
        email: z.string().max(200),
        role: z.string().max(40),
        kitchens: z.array(z.string().max(40)).max(40),
      }),
    )
    .mutation(async ({ input }) => {
      const { stadium, ...member } = input;
      return inviteStaff(stadium, member, await requestLocale());
    }),

  resendInvite: kitchenProcedure.input(z.object({ stadium: stadiumSlug, memberId: z.string().min(1).max(40) })).mutation(async ({ input }) => {
    return resendStaffInvite(input.stadium, input.memberId, await requestLocale());
  }),

  /** Lost phone: an admin removes someone's authenticator so they can set it up again. */
  resetTwoFactor: kitchenProcedure
    .input(z.object({ stadium: stadiumSlug, memberId: z.string().min(1).max(40) }))
    .mutation(({ input, ctx }) => resetTwoFactor(input.stadium, input.memberId, { userId: ctx.session.user.id, email: ctx.session.user.email })),

  /** Who accepted, declined, refunded, changed a price, or published the map. */
  audit: kitchenProcedure
    .input(
      z.object({
        stadium: stadiumSlug,
        actorEmail: z.string().max(200).optional(),
        action: z.string().max(60).optional(),
        day: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      }),
    )
    .query(({ input }) => listAudit(input.stadium, { actorEmail: input.actorEmail, day: input.day, action: input.action })),
});
