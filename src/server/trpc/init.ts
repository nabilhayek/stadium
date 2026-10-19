import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import { kitchenSession } from "@/lib/management/session";

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

/** Desk staff only. Puts the Better Auth session on the context. */
export const kitchenProcedure = t.procedure.use(async ({ ctx, next }) => {
  const session = await kitchenSession();
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in required." });
  return next({ ctx: { ...ctx, session } });
});
