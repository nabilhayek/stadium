import { createUIMessageStreamResponse } from "ai";
import { getRun } from "workflow/api";
import { kitchenSession } from "@/lib/management/session";
import { toSeatMapUIStream } from "@/lib/seatmap/agent/ui-stream";

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  if (!(await kitchenSession())) return Response.json({ error: "Sign in to use the assistant." }, { status: 401 });
  const { runId } = await params;
  const startIndex = Number(new URL(request.url).searchParams.get("startIndex") ?? "0");
  if (!Number.isSafeInteger(startIndex) || startIndex < 0) return Response.json({ error: "startIndex must be a non-negative integer." }, { status: 400 });

  try {
    const run = getRun(runId);
    return createUIMessageStreamResponse({
      stream: run.getReadable({ startIndex: 0 }).pipeThrough(toSeatMapUIStream(startIndex)),
      headers: { "x-workflow-run-id": runId },
    });
  } catch {
    return Response.json({ error: "That run no longer exists." }, { status: 404 });
  }
}
