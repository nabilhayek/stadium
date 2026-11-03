import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getVenueAdmin, inviteStaff, resendStaffInvite, saveVenueAdmin } from "@/lib/management/admin";
import { adminChangePermissions, adminSaveSchema } from "@/lib/management/admin-settings";
import type { VenueAccess } from "@/lib/management/access";
import { listAudit } from "@/lib/management/audit";
import { requestLocale } from "@/lib/email/receipt";
import { resetTwoFactor } from "@/lib/management/two-factor";
import { assertCan, guarded, router } from "../init";

/** Anyone who can change some part of the Admin screen may open it. */
const admin = () => guarded("settings.edit", "team.manage", "kitchens.pause");

/** Giving out, changing, or taking away the Admin role is for Admins (and the owner) only: no self-promotion. */
function assertAdmin(access: VenueAccess) {
  if (!access.owner && access.roleId !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only an admin can change who is an admin." });
}

/** Desk admin. Each save is checked against what it changes; the document is validated before it is stored. */
export const adminRouter = router({
  get: admin().query(({ input }) => getVenueAdmin(input.stadium)),

  save: admin()
    .input(z.object({ settings: z.unknown() }))
    .mutation(async ({ ctx, input }) => {
      const parsed = adminSaveSchema.safeParse(input.settings);
      const current = parsed.success ? await getVenueAdmin(input.stadium) : null;
      if (parsed.success && current) {
        const change = adminChangePermissions(current, parsed.data);
        for (const permission of change.permissions) assertCan(ctx.access, permission);
        if (change.touchesAdmins) assertAdmin(ctx.access);
      }
      // An unreadable document is rejected inside with the form's own message.
      return saveVenueAdmin(input.stadium, input.settings, await requestLocale());
    }),

  invite: guarded("team.manage")
    .input(
      z.object({
        name: z.string().max(80),
        email: z.string().max(200),
        role: z.string().max(40),
        kitchens: z.array(z.string().max(40)).max(40),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { stadium, ...member } = input;
      if (member.role === "admin") assertAdmin(ctx.access);
      return inviteStaff(stadium, member, await requestLocale());
    }),

  resendInvite: guarded("team.manage")
    .input(z.object({ memberId: z.string().min(1).max(40) }))
    .mutation(async ({ input }) => resendStaffInvite(input.stadium, input.memberId, await requestLocale())),

  /** Lost phone: an admin removes someone's authenticator so they can set it up again. */
  resetTwoFactor: guarded("team.manage")
    .input(z.object({ memberId: z.string().min(1).max(40) }))
    .mutation(({ input, ctx }) => resetTwoFactor(input.stadium, input.memberId, { userId: ctx.session.user.id, email: ctx.session.user.email })),

  /** Who accepted, declined, refunded, changed a price, or published the map. */
  audit: guarded("settings.edit", "team.manage")
    .input(
      z.object({
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
