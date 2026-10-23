import { getRun } from "workflow/api";
import { kitchenSession } from "@/lib/management/session";

/** Stop: the run keeps going on the server after the browser lets go, so cancel it there too. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  if (!(await kitchenSession())) return Response.json({ error: "Sign in to use the assistant." }, { status: 401 });
  const { runId } = await params;
  try {
    await getRun(runId).cancel({ cancelReason: "Stopped from the seat map" });
    return Response.json({ cancelled: true });
  } catch {
    return Response.json({ cancelled: false });
  }
}
