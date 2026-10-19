import { createTRPCClient, httpBatchLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import type { AppRouter } from "@/server/trpc/root";

const url = "/api/trpc";

/** Browsers reject keepalive requests whose body exceeds 64 KB. */
const KEEPALIVE_LIMIT = 60_000;

/**
 * Browser tRPC client. Queries batch; mutations go one per request with
 * `keepalive` so a receipt push survives the page being closed.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.type === "mutation",
      true: httpLink({
        url,
        fetch: (input, init) => {
          const body = init?.body;
          const keepalive = typeof body !== "string" || new Blob([body]).size < KEEPALIVE_LIMIT;
          return fetch(input, { ...init, keepalive, cache: "no-store" });
        },
      }),
      false: httpBatchLink({ url, fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) }),
    }),
  ],
});

/** HTTP status of a failed call, or null when the request never got an answer. */
export function httpStatus(error: unknown): number | null {
  if (!(error instanceof TRPCClientError)) return null;
  const status = (error.data as { httpStatus?: number } | undefined)?.httpStatus;
  return typeof status === "number" ? status : null;
}
