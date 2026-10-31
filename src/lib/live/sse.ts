import "server-only";

const HEARTBEAT_MS = 20_000;

type Send = (event: string, data: unknown) => void;
/** Sets the id EventSource sends back as `Last-Event-ID` when it reconnects. */
type Mark = (id: string) => void;

/**
 * A Server-Sent Events response. `start` wires up the stream and returns its
 * cleanup. The stream ends before the function time limit; EventSource reconnects.
 */
export function sseResponse(signal: AbortSignal, lifetimeMs: number, start: (send: Send, mark: Mark) => Promise<() => void> | (() => void)) {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        timers.forEach(clearTimeout);
        timers = [];
        cleanup?.();
        try {
          controller.close();
        } catch {}
      };
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };
      const send: Send = (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const mark: Mark = (id) => write(`id: ${id.replace(/[\r\n]/g, "")}\n\n`);

      signal.addEventListener("abort", close);
      write("retry: 3000\n\n");
      cleanup = await start(send, mark);
      if (signal.aborted) return close();

      const beat = () => {
        write(": ping\n\n");
        timers.push(setTimeout(beat, HEARTBEAT_MS));
      };
      timers.push(setTimeout(beat, HEARTBEAT_MS));
      timers.push(setTimeout(close, lifetimeMs));
    },
    cancel() {
      timers.forEach(clearTimeout);
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
