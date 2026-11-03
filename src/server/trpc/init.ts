import { initTRPC, TRPCError } from "@trpc/server";
import { z, ZodError } from "zod";
import type { Permission } from "@/components/management/admin/model";
import { can, venueAccess, type VenueAccess } from "@/lib/management/access";
import { kitchenSession } from "@/lib/management/session";
import { twoFactorRequired } from "@/lib/management/two-factor";
import { stadiumSlug } from "./schemas";

/**
 * Deliberately empty: reading headers here would make every public page that
 * uses the server caller dynamic. Procedures that need the session ask for it.
 */
export async function createContext() {
  return {};
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: { ...shape.data, zodError: error.cause instanceof ZodError ? error.cause.flatten() : null },
    };
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/**
 * Guard 1, signed in: any desk account, for things about the account itself (export, delete, push opt-out).
 * Puts the Better Auth session on the context. Never use it for venue data; use {@link venueProcedure}.
 */
export const kitchenProcedure = t.procedure.use(async ({ ctx, next }) => {
  const session = await kitchenSession();
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in required." });
  // Admins and Managers use the desk only after two-factor is on. The check skips the database once it is.
  if (await twoFactorRequired(session.user)) throw new TRPCError({ code: "FORBIDDEN", message: "Set up two-factor sign-in first." });
  return next({ ctx: { ...ctx, session } });
});

const FORBIDDEN_MESSAGE = "Your role doesn't allow this. Ask an admin.";

/** Throws FORBIDDEN unless `access` has one of `permissions`. For handlers whose permission depends on the input. */
export function assertCan(access: VenueAccess, ...permissions: Permission[]) {
  if (!can(access, ...permissions)) throw new TRPCError({ code: "FORBIDDEN", message: FORBIDDEN_MESSAGE });
}

/**
 * Guard 2, venue team: signed in AND on the team of `input.stadium` (or the owner). Every procedure built on it
 * takes `stadium` in its input and gets `ctx.access`. Unknown venues and outsiders get the same NOT_FOUND, so the
 * API doesn't reveal which venues exist.
 */
export const venueProcedure = kitchenProcedure.input(z.object({ stadium: stadiumSlug })).use(async ({ ctx, input, next }) => {
  const access = await venueAccess(input.stadium, ctx.session.user);
  if (!access) throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found." });
  return next({ ctx: { ...ctx, access } });
});

/**
 * Guard 3, permission: a venue procedure that also needs one of `permissions` from the person's role.
 *
 *   guarded("menu.edit").input(z.object({ id })).mutation(({ ctx, input }) => …)
 */
export function guarded(...permissions: [Permission, ...Permission[]]) {
  return venueProcedure.use(({ ctx, next }) => {
    assertCan(ctx.access, ...permissions);
    return next();
  });
}
