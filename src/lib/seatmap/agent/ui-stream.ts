import { toUIMessageChunk, type ModelCallStreamPart } from "@ai-sdk/workflow";
import type { ToolSet, UIMessageChunk } from "ai";

/**
 * The agent's raw stream as UI chunks. Unlike the stock transform it keeps our
 * `data-*` parts (live map changes). `uiStartIndex` skips chunks the client
 * already has when it reconnects; the source must be replayed from index 0.
 */
export function toSeatMapUIStream(uiStartIndex = 0): TransformStream<ModelCallStreamPart<ToolSet>, UIMessageChunk> {
  let index = 0;
  const enqueue = (controller: TransformStreamDefaultController<UIMessageChunk>, chunk: UIMessageChunk) => {
    if (index++ >= uiStartIndex) controller.enqueue(chunk);
  };
  return new TransformStream({
    start: (controller) => {
      enqueue(controller, { type: "start" });
      enqueue(controller, { type: "start-step" });
    },
    flush: (controller) => {
      enqueue(controller, { type: "finish-step" });
      enqueue(controller, { type: "finish" });
    },
    transform: (part, controller) => {
      const type = (part as { type: string }).type;
      if (type.startsWith("data-")) return enqueue(controller, part as unknown as UIMessageChunk);
      const chunk = toUIMessageChunk(part);
      if (chunk) enqueue(controller, chunk);
    },
  });
}
