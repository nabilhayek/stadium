import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "@/server/trpc/init";
import { appRouter } from "@/server/trpc/root";

export const runtime = "nodejs";

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
    responseMeta: () => ({ headers: new Headers({ "Cache-Control": "no-store" }) }),
    onError({ path, error }) {
      if (error.code === "INTERNAL_SERVER_ERROR") console.error(`tRPC ${path ?? "?"} failed`, error);
    },
  });
}

export { handler as GET, handler as POST };
