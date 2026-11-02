import { z } from "zod";
import { renewSubscription } from "@/lib/push/subscriptions";
import { pushSubscription } from "@/server/trpc/schemas";

const body = z.object({ oldEndpoint: pushSubscription.shape.endpoint, subscription: pushSubscription });

/** Called by the service worker on `pushsubscriptionchange`, which has no page or session to go through. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response("bad request", { status: 400 });
  const renewed = await renewSubscription(parsed.data.oldEndpoint, parsed.data.subscription);
  return new Response(null, { status: renewed ? 204 : 404 });
}
