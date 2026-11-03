import { createUIMessageStreamResponse, validateUIMessages } from "ai";
import { start } from "workflow/api";
import { z } from "zod";
import { promptMessages, takeTurn } from "@/lib/seatmap/agent/guard";
import { toSeatMapUIStream } from "@/lib/seatmap/agent/ui-stream";
import { venueRouteAccess } from "@/lib/management/session";
import { seatMapSchema } from "@/lib/seatmap/schema";
import { seatMapAgent } from "@/workflows/seat-map-agent";

const MODEL = process.env.SEATMAP_AI_MODEL || "nvidia/nemotron-3.5-lightning-free";
const MAX_BODY = 12 * 1024 * 1024;

const bodySchema = z.object({
  stadium: z.string().min(1).max(80),
  messages: z.array(z.unknown()).min(1).max(400),
  doc: seatMapSchema,
});

const problem = (status: number, error: string, headers?: HeadersInit) => Response.json({ error }, { status, headers });

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) return problem(413, "This map is too large to send to the assistant.");

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return problem(400, "The map or the conversation could not be read.");
  }

  // Runs cost money, so only people who may edit this venue's seat map start them.
  const guard = await venueRouteAccess(body.stadium, "seatmap.edit");
  if (!guard.ok) return guard.response;
  const turn = takeTurn(guard.session.user.id);
  if (!turn.ok) return problem(429, `Too many requests. Try again in ${Math.ceil(turn.retryAfter / 60)} min.`, { "Retry-After": String(turn.retryAfter) });
  let messages;
  try {
    messages = promptMessages(await validateUIMessages({ messages: body.messages }));
  } catch {
    return problem(400, "The conversation could not be read.");
  }
  if (messages[messages.length - 1]?.role !== "user") return problem(400, "Send a message first.");

  const run = await start(seatMapAgent, [messages, body.doc, MODEL]);
  return createUIMessageStreamResponse({
    stream: run.readable.pipeThrough(toSeatMapUIStream()),
    headers: { "x-workflow-run-id": run.runId },
  });
}
