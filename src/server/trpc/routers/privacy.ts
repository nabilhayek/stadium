import { deleteAccount, exportAccount } from "@/lib/privacy/account";
import { kitchenProcedure, router } from "../init";

/** The signed-in person, not someone else on the team list. */
export const privacyRouter = router({
  exportAccount: kitchenProcedure.mutation(async ({ ctx }) => {
    const data = await exportAccount(ctx.session.user.id);
    if (!data) return { ok: false as const, error: "Account not found." };
    return { ok: true as const, data };
  }),

  deleteAccount: kitchenProcedure.mutation(async ({ ctx }) => deleteAccount(ctx.session.user.id)),
});
