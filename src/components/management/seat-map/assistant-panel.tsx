"use client";

import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@ai-sdk/workflow/client";
import type { UIMessage } from "ai";
import { ArrowUp, Check, CircleAlert, RotateCcw, Sparkles, Square, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { Message, MessageContent } from "@/components/ui/message";
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import { applyPatch, type SeatMapPatch } from "@/lib/seatmap/agent/patch";
import { ringNumbers } from "@/lib/seatmap/build";
import { seatMapSchema, type SeatMapDoc } from "@/lib/seatmap/schema";
import { cn } from "@/lib/utils";

type Props = {
  doc: SeatMapDoc;
  /** Key of the newest undo step; while it is this turn's key, nothing was edited since. */
  lastKey: string | null;
  open: boolean;
  /** Commits with the same key undo together. */
  onApply: (doc: SeatMapDoc, key: string) => void;
  onBusyChange: (busy: boolean) => void;
  /** True while the assistant may still change the map. Turns false once it starts its closing reply. */
  onBuildingChange: (building: boolean) => void;
  onUndo: () => void;
  onClose: () => void;
};

const API = "/api/seat-map/agent";

/** Reconnects through `{API}/{runId}/stream` when a long run outlives one response. */
const lastRun: { id: string | null } = { id: null };
const transport = new WorkflowChatTransport({
  api: API,
  maxConsecutiveErrors: 4,
  onChatSendMessage: (response) => {
    lastRun.id = response.headers.get("x-workflow-run-id");
  },
});

const STARTERS = [
  "A football stadium with 3 rings: 5,000 seats inside, 7,500 in the middle (7 sections, every other one 100 seats fewer) and stairs between every section of the outer ring",
  "An arena with a stage at the north end, 3,000 floor seats and two tiers around",
  "A 20,000 seat football stadium with straight stands on all four sides",
];
function suggestionsFor(doc: SeatMapDoc): string[] {
  if (!doc.sections.length) return STARTERS;
  const rings = ringNumbers(doc);
  const entrances = doc.pois.some((p) => p.kind === "entrance") ? "Add 4 kitchens behind the outer ring" : "Add 8 entrances around the outside";
  if (!rings.length) return ["Add a ring of 8,000 seats in 16 sections around the field", "Add stairs between the sections", entrances];
  const outer = rings[rings.length - 1];
  return [
    `Add a new ring of 10,000 seats outside ring ${outer}`,
    `Make every other section in ring ${outer} ${doc.categories[2]?.label ?? "Upper tier"}`,
    doc.pois.some((p) => p.kind === "stairs") ? entrances : `Add stairs between every section in ring ${outer}`,
  ];
}

const TOOL_LABEL: Record<string, (input: Record<string, unknown>) => string> = {
  get_map: () => "Reading the map",
  check_map: () => "Checking the map",
  clear_map: () => "Clearing the map",
  set_field: (i) => `Setting the field${i.kind ? `: ${String(i.kind).replace("_", " ")}` : ""}`,
  add_ring: (i) => (i.replace_ring ? `Rebuilding ring ${i.replace_ring}` : `Building a ring${i.sections ? ` of ${i.sections} sections` : ""}`),
  add_stand: (i) => `Building the ${i.side ?? ""} stand`,
  add_floor: () => "Seating the floor",
  add_section: (i) => `Adding a section${i.seats ? ` of ${i.seats} seats` : ""}`,
  add_stairs: () => "Adding stairs",
  add_points: (i) => `Adding ${i.kind ?? "point"}s`,
  add_shape: (i) => `Adding ${i.kind ?? "a shape"}`,
  update_sections: () => "Updating sections",
  move_sections: () => "Moving sections",
  remove: () => "Removing",
  set_category: (i) => `Category ${i.name ?? ""}`.trim(),
};

type ToolPart = { type: string; toolCallId: string; state: string; input?: unknown; output?: unknown; errorText?: string };

/** True once the assistant has written something after its last tool call. */
function replyStarted(parts: UIMessage["parts"] | undefined) {
  if (!parts) return false;
  let tool = -1;
  parts.forEach((part, i) => {
    if (part.type.startsWith("tool-")) tool = i;
  });
  if (tool < 0) return false;
  return parts.slice(tool + 1).some((part) => part.type === "text" && part.text.trim() !== "");
}

function isToolPart(part: UIMessage["parts"][number]): part is UIMessage["parts"][number] & ToolPart {
  return part.type.startsWith("tool-");
}

/** The route answers errors as JSON; the transport wraps them in its own message. */
function readError(error: Error | undefined): string {
  if (!error) return "";
  const json = /\{[\s\S]*\}$/.exec(error.message)?.[0];
  if (json) {
    try {
      const parsed = JSON.parse(json) as { error?: string };
      if (parsed.error) return parsed.error;
    } catch {}
  }
  if (/fetch|network/i.test(error.message)) return "Couldn’t reach the assistant. Check the connection and try again.";
  return "The assistant ran into a problem. Try again.";
}

export function AssistantPanel({ doc, lastKey, open, onApply, onBusyChange, onBuildingChange, onUndo, onClose }: Props) {
  const docRef = useRef(doc);
  useLayoutEffect(() => {
    docRef.current = doc;
  }, [doc]);
  const turnKey = useRef("ai");
  const [turn, setTurn] = useState<{ key: string; messageId: string } | null>(null);
  const [rejected, setRejected] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status, stop, error, regenerate, setMessages, clearError } = useChat({
    transport,
    onData: (part) => {
      if (part.type !== "data-seatmap") return;
      const next = applyPatch(docRef.current, part.data as SeatMapPatch);
      const parsed = next && seatMapSchema.safeParse(next);
      if (!parsed?.success) {
        setRejected(true);
        return;
      }
      docRef.current = parsed.data;
      onApply(parsed.data, turnKey.current);
    },
    onFinish: ({ message }) => setTurn({ key: turnKey.current, messageId: message.id }),
  });

  const busy = status === "submitted" || status === "streaming";
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  // Text before the first tool is the plan, not the end. The reveal starts at the first word after the last tool.
  const tail = messages[messages.length - 1];
  const building = busy && !replyStarted(tail?.role === "assistant" ? tail.parts : undefined);
  useEffect(() => onBuildingChange(building), [building, onBuildingChange]);
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const send = useCallback(
    (text: string) => {
      const value = text.trim();
      if (!value || busy) return;
      turnKey.current = `ai:${Date.now()}`;
      setTurn(null);
      setRejected(false);
      clearError();
      setDraft("");
      void sendMessage({ text: value }, { body: { doc: docRef.current } });
    },
    [busy, clearError, sendMessage],
  );

  const halt = useCallback(() => {
    const id = lastRun.id;
    void stop();
    if (id) void fetch(`${API}/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }, [stop]);

  useEffect(() => {
    if (!open || !busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") halt();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, halt, open]);

  const canUndoTurn = !busy && turn !== null && lastKey === turn.key;
  const empty = messages.length === 0;
  const suggestions = suggestionsFor(doc);

  return (
    <aside aria-label="Assistant" hidden={!open} className="flex w-[360px] shrink-0 flex-col border-l border-neutral-200 bg-white">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-neutral-200 pr-1.5 pl-4">
        <Sparkles className="size-4 text-neutral-500" aria-hidden />
        <p className="text-[13px] font-semibold">Assistant</p>
        <div className="ml-auto flex items-center">
          {!empty ? (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setTurn(null);
                clearError();
              }}
              disabled={busy}
              title="New conversation"
              aria-label="New conversation"
              className="grid size-8 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100! hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-35"
            >
              <RotateCcw className="size-4" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            title="Close assistant"
            aria-label="Close assistant"
            className="grid size-8 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100! hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <MessageScrollerProvider autoScroll defaultScrollPosition="end">
        <MessageScroller className="flex-1">
          <MessageScrollerViewport aria-label="Conversation">
            <MessageScrollerContent className="px-4 py-4">
              {empty ? (
                <div className="flex flex-col gap-4 pt-2">
                  <div className="flex flex-col gap-1.5">
                    <h2 className="text-[15px] font-semibold text-balance">Describe the venue you want</h2>
                    <p className="text-[13px] leading-relaxed text-pretty text-neutral-600">
                      The assistant builds it on the map as you watch. Seat counts are exact, and one undo reverts the whole change.
                    </p>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {suggestions.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          onClick={() => send(s)}
                          className="w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-left text-[13px] leading-snug text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50! focus-visible:outline-2 focus-visible:outline-blue-500"
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                messages.map((message, mi) => (
                  <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={message.role === "user"}>
                    {message.role === "user" ? (
                      <Message align="end">
                        <MessageContent>
                          <Bubble align="end">
                            <BubbleContent className="whitespace-pre-wrap">{message.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}</BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    ) : (
                      <AssistantMessage
                        message={message}
                        live={busy && mi === messages.length - 1}
                        footer={
                          canUndoTurn && turn?.messageId === message.id ? (
                            <button
                              type="button"
                              onClick={() => {
                                onUndo();
                                setTurn(null);
                              }}
                              className="inline-flex h-7 items-center gap-1.5 self-start rounded-full border border-neutral-200 px-2.5 text-[12px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50! focus-visible:outline-2 focus-visible:outline-blue-500"
                            >
                              <Undo2 className="size-3.5" aria-hidden />
                              Undo these changes
                            </button>
                          ) : null
                        }
                      />
                    )}
                  </MessageScrollerItem>
                ))
              )}
              {busy && messages[messages.length - 1]?.role === "user" ? <Working label="Thinking…" /> : null}
              {error ? (
                <div role="alert" className="flex flex-col items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
                  <p>{readError(error)}</p>
                  <button type="button" onClick={() => void regenerate({ body: { doc: docRef.current } })} className="font-medium underline underline-offset-2">
                    Try again
                  </button>
                </div>
              ) : null}
              {rejected ? (
                <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
                  One change didn’t match the map and was skipped. Ask again to rebuild it.
                </p>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <form
        className="shrink-0 px-3 pt-1 pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <InputGroup>
          <InputGroupTextarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(draft);
              }
            }}
            placeholder={doc.sections.length ? "Ask for a change…" : "Describe a stadium or arena…"}
            aria-label="Message the assistant"
            maxLength={4000}
            rows={2}
          />
          <InputGroupAddon className="justify-between pl-3.5">
            <span className="text-[12px] text-neutral-400">{busy ? "Esc to stop" : "Enter to send · Shift+Enter for a new line"}</span>
            {busy ? (
              <button
                type="button"
                onClick={halt}
                aria-label="Stop"
                title="Stop"
                className="grid size-8 place-items-center rounded-full bg-neutral-900! text-white transition-colors hover:bg-neutral-700! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                <Square className="size-3 fill-current" aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="Send"
                title="Send"
                className="grid size-8 place-items-center rounded-full bg-neutral-900! text-white transition-[background-color,opacity] hover:bg-neutral-700! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-25"
              >
                <ArrowUp className="size-4" aria-hidden />
              </button>
            )}
          </InputGroupAddon>
        </InputGroup>
      </form>
    </aside>
  );
}

function AssistantMessage({ message, live, footer }: { message: UIMessage; live: boolean; footer: ReactNode }) {
  const parts = message.parts;
  const last = parts[parts.length - 1];
  const thinking = live && (!last || last.type === "step-start" || (last.type === "reasoning" && last.state === "streaming"));
  return (
    <Message>
      <MessageContent className="gap-2.5">
        {parts.map((part, i) => {
          if (part.type === "text" && part.text.trim()) {
            return (
              <Bubble key={i} variant="ghost">
                <BubbleContent className="leading-relaxed whitespace-pre-wrap">{part.text.replace(/\*\*(.+?)\*\*/g, "$1")}</BubbleContent>
              </Bubble>
            );
          }
          if (isToolPart(part)) return <ToolRow key={part.toolCallId} part={part} />;
          return null;
        })}
        {thinking ? <Working label="Thinking…" /> : null}
        {footer}
      </MessageContent>
    </Message>
  );
}

function ToolRow({ part }: { part: ToolPart }) {
  const name = part.type.slice(5);
  const input = (part.input ?? {}) as Record<string, unknown>;
  const label = (TOOL_LABEL[name] ?? (() => name.replace(/_/g, " ")))(input);
  const output = typeof part.output === "string" ? part.output : "";
  const failed = part.state === "output-error" || part.state === "input-error" || output.startsWith("Error:");
  const done = part.state === "output-available" && !failed;
  const detail = failed ? (part.errorText ?? output.replace(/^Error:\s*/, "")) : done ? output : "";
  return (
    <div className="flex items-start gap-2.5 text-[13px] leading-snug" title={detail || undefined}>
      <span className="mt-px grid size-4 shrink-0 place-items-center">
        {failed ? (
          <CircleAlert className="size-4 text-amber-600" aria-hidden />
        ) : done ? (
          <Check className="size-4 text-emerald-600" aria-hidden />
        ) : (
          <Spinner className="size-3.5 text-neutral-400" aria-label={`${label}…`} />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={cn("font-medium", done || failed ? "text-neutral-800" : "text-neutral-500")}>{label}</span>
        {detail ? <span className={cn("line-clamp-2", failed ? "text-amber-800" : "text-neutral-500")}>{detail}</span> : null}
      </span>
    </div>
  );
}

function Working({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2.5 text-[13px] text-neutral-500" role="status">
      <Spinner className="size-3.5" aria-hidden />
      {label}
    </p>
  );
}
