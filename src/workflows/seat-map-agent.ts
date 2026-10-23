import { WorkflowAgent, type ModelCallStreamPart } from "@ai-sdk/workflow";
import { convertToModelMessages, isStepCount, type UIMessage } from "ai";
import { getWritable } from "workflow";
import type { SeatMapPatch } from "../lib/seatmap/agent/patch";
import { createSeatMapTools, instructionsFor } from "../lib/seatmap/agent/tools";
import type { SeatMapDoc } from "../lib/seatmap/schema";

/** Tool rounds per turn. A full stadium takes about eight. */
const MAX_STEPS = 18;

export async function seatMapAgent(messages: UIMessage[], doc: SeatMapDoc, model: string) {
  "use workflow";

  const state = { doc };
  const agent = new WorkflowAgent({
    model,
    instructions: instructionsFor(doc),
    tools: createSeatMapTools(state, publishPatch),
    toolCallConcurrency: 1,
    temperature: 0.2,
    maxOutputTokens: 6000,
  });

  try {
    const result = await agent.stream({
      messages: await convertToModelMessages(messages),
      writable: getWritable<ModelCallStreamPart>(),
      stopWhen: isStepCount(MAX_STEPS),
    });
    if (result.finishReason === "length" && !result.steps.at(-1)?.text.trim()) {
      await publishError("The assistant ran out of room before answering. Try again, or split the request into smaller steps.");
    }
  } catch (error) {
    await publishError(error instanceof Error ? error.message : String(error));
  }
}

async function publishPatch(patch: SeatMapPatch) {
  "use step";
  const writer = getWritable<{ type: "data-seatmap"; data: SeatMapPatch; transient: true }>().getWriter();
  try {
    await writer.write({ type: "data-seatmap", data: patch, transient: true });
  } finally {
    writer.releaseLock();
  }
}

async function publishError(message: string) {
  "use step";
  const writer = getWritable<{ type: "error"; error: string }>().getWriter();
  try {
    await writer.write({ type: "error", error: message.slice(0, 300) });
  } finally {
    writer.releaseLock();
  }
}
