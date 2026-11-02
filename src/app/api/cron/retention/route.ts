import { cronAuthorized } from "@/lib/cron-auth";
import { retainOldReceipts } from "@/lib/privacy/retention";

/** Nightly. A frequent database check would keep Neon awake, so this runs once a day. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) return new Response("cron not configured", { status: 503 });
  if (!cronAuthorized(request)) return new Response("unauthorized", { status: 401 });
  const summary = await retainOldReceipts();
  return Response.json(summary);
}
