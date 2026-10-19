"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMutation } from "@tanstack/react-query";
import { CircleAlert, Eye, EyeOff, LayoutTemplate, Loader2, Magnet, Redo2, Undo2, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SeatMapView } from "@/components/seatmap/seat-map-view";
import { useToast } from "@/components/toast/toast-provider";
import type { SeatMapState, VenueSection } from "@/lib/management/seat-map";
import { translation } from "@/lib/seatmap/geometry";
import type { SeatMapDoc } from "@/lib/seatmap/schema";
import { validateSeatMap, type SeatMapIssue } from "@/lib/seatmap/validate";
import { useTRPC } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { DesignerCanvas, type CanvasApi } from "./designer-canvas";
import { CategoriesDialog, PublishDialog, TemplateDialog } from "./dialogs";
import { Inspector } from "./inspector";
import { deleteSelection, duplicateSelection, keyOf, splitSelection, transformSelection } from "./ops";
import { groupOf, TOOL_HINT, ToolRail } from "./tool-rail";
import type { ToolId } from "./tools";
import { useHistory } from "./use-history";

type Props = { stadiumSlug: string; initial: SeatMapState };

const AUTOSAVE_MS = 1200;
const SNAP_CHOICES = [
  { step: 1, label: "10 cm" },
  { step: 2.5, label: "25 cm" },
  { step: 5, label: "50 cm" },
  { step: 10, label: "1 m" },
  { step: 20, label: "2 m" },
  { step: 50, label: "5 m" },
];

const SHORTCUTS: Record<string, ToolId> = {
  v: "select",
  h: "hand",
  s: "section",
  S: "rect-section",
  f: "focal",
  r: "row",
  c: "curved-row",
  b: "row-block",
  t: "text",
};

function useWideScreen() {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia("(min-width: 1024px)");
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true,
  );
}

export function SeatMapDesigner({ stadiumSlug, initial }: Props) {
  const { doc, commit, undo, redo, canUndo, canRedo } = useHistory(initial.draft);
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [tool, setTool] = useState<ToolId>("select");
  const [lastInGroup, setLastInGroup] = useState<Record<string, ToolId>>({});
  const [snapStep, setSnapStep] = useState(10);
  const [preview, setPreview] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [dialog, setDialog] = useState<"categories" | "template" | "publish" | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [liveSections, setLiveSections] = useState<VenueSection[]>(initial.sections);
  const [publishedAt, setPublishedAt] = useState(initial.publishedAt);
  const [savedDoc, setSavedDoc] = useState(initial.draft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const wide = useWideScreen();
  const canvasApi = useRef<CanvasApi>(null);
  const { toast } = useToast();

  const trpc = useTRPC();
  const saveDraft = useMutation(trpc.seatMap.saveDraft.mutationOptions());
  const publish = useMutation(trpc.seatMap.publish.mutationOptions());

  const issues = useMemo(() => validateSeatMap(doc), [doc]);
  const errorCount = issues.filter((i) => i.level === "error").length;

  // Undo can remove objects that are still selected.
  const liveSelection = useMemo(() => {
    const ids = new Set<string>();
    for (const s of doc.sections) {
      ids.add(keyOf("s", s.id));
      for (const r of s.rows) ids.add(keyOf("r", r.id));
    }
    for (const d of doc.decorations) ids.add(keyOf("d", d.id));
    for (const p of doc.pois) ids.add(keyOf("p", p.id));
    const kept = [...selection].filter((k) => ids.has(k));
    return kept.length === selection.size ? selection : new Set(kept);
  }, [doc, selection]);

  /* ---------- autosave ---------- */

  const revision = useRef(initial.revision);
  const docRef = useRef(doc);
  const savedRef = useRef(initial.draft);
  const inFlight = useRef(false);
  const blockedRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushRef = useRef<() => Promise<void>>(async () => {});
  const mutateDraft = saveDraft.mutateAsync;

  useEffect(() => {
    flushRef.current = async () => {
      if (inFlight.current || blockedRef.current) return;
      const target = docRef.current;
      if (target === savedRef.current) return;
      inFlight.current = true;
      setSaving(true);
      try {
        const result = await mutateDraft({
          stadium: stadiumSlug,
          revision: revision.current,
          doc: target,
        });
        if (!result.ok) {
          blockedRef.current = true;
          setBlocked(true);
          setSaveError(result.error);
          return;
        }
        revision.current = result.revision;
        savedRef.current = target;
        setSavedDoc(target);
        setSaveError(null);
      } catch {
        setSaveError("Couldn’t save the draft. Retrying…");
      } finally {
        inFlight.current = false;
        setSaving(false);
        if (!blockedRef.current && docRef.current !== savedRef.current) {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void flushRef.current(), AUTOSAVE_MS * 2);
        }
      }
    };
  }, [mutateDraft, stadiumSlug]);

  useEffect(() => {
    docRef.current = doc;
    if (doc === savedRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), AUTOSAVE_MS);
  }, [doc]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const dirty = doc !== savedDoc;
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  /* ---------- editing ---------- */

  const onCommit = useCallback(
    (next: SeatMapDoc, sel?: Set<string>) => {
      commit(next);
      if (sel) setSelection(sel);
    },
    [commit],
  );

  const pickTool = useCallback((t: ToolId) => {
    setTool(t);
    const group = groupOf(t);
    if (group) setLastInGroup((m) => (m[group] === t ? m : { ...m, [group]: t }));
  }, []);

  const removeSelected = useCallback(() => {
    if (!liveSelection.size) return;
    commit(deleteSelection(doc, liveSelection));
    setSelection(new Set());
  }, [commit, doc, liveSelection]);

  const duplicateSelected = useCallback(() => {
    if (!liveSelection.size) return;
    const result = duplicateSelection(doc, liveSelection);
    commit(result.doc);
    setSelection(result.selection);
  }, [commit, doc, liveSelection]);

  const defaultCategory = useMemo(() => {
    const parts = splitSelection(liveSelection);
    const selected = doc.sections.find((s) => parts.sections.has(s.id));
    return selected?.categoryId ?? doc.categories[0]?.id ?? null;
  }, [doc, liveSelection]);

  const notify = useCallback((message: string) => toast({ message, status: "warning" }), [toast]);

  useEffect(() => {
    if (preview || !wide) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=alertdialog], [role=menu], [role=listbox]")) return;
      if (document.querySelector("[role=alertdialog]")) return;
      if (canvasApi.current?.key(e)) {
        e.preventDefault();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key;
      if (mod && k.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && k.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && k.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (mod && k.toLowerCase() === "a") {
        e.preventDefault();
        setSelection(new Set(doc.sections.map((s) => keyOf("s", s.id))));
        return;
      }
      if (mod || e.altKey) return;
      if (k === "Delete" || k === "Backspace") {
        e.preventDefault();
        removeSelected();
        return;
      }
      if (k === "Escape") {
        if (tool !== "select") pickTool("select");
        else setSelection(new Set());
        return;
      }
      if (k.startsWith("Arrow") && liveSelection.size) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0;
        const dy = k === "ArrowUp" ? -step : k === "ArrowDown" ? step : 0;
        commit(transformSelection(doc, liveSelection, translation(dx, dy)), "nudge");
        return;
      }
      if (k === "+" || k === "=") return canvasApi.current?.zoomBy(1.4);
      if (k === "-") return canvasApi.current?.zoomBy(1 / 1.4);
      if (k === "0" || (e.shiftKey && k === "!")) return canvasApi.current?.fit();
      const shortcut = SHORTCUTS[e.shiftKey && k.toLowerCase() === "s" ? "S" : k.toLowerCase()];
      if (shortcut) pickTool(shortcut);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit, doc, duplicateSelected, liveSelection, pickTool, preview, redo, removeSelected, tool, undo, wide]);

  function focusIssue(issue: SeatMapIssue) {
    if (!issue.target) return;
    const sel = new Set([issue.target]);
    setSelection(sel);
    setPreview(false);
    requestAnimationFrame(() => canvasApi.current?.focusSelection(sel));
  }

  async function runPublish() {
    setPublishError(null);
    // Publishing writes the draft too, so a pending autosave is no longer needed.
    if (timer.current) clearTimeout(timer.current);
    try {
      const target = doc;
      const result = await publish.mutateAsync({
        stadium: stadiumSlug,
        revision: revision.current,
        doc: target,
      });
      if (!result.ok) {
        setPublishError(result.error);
        return;
      }
      revision.current = result.revision;
      savedRef.current = target;
      setSavedDoc(target);
      setLiveSections(result.sections);
      setPublishedAt(result.publishedAt);
      setDialog(null);
      toast({
        message: result.kept.length
          ? `Published. Kept ${result.kept.join(", ")} because past orders use ${result.kept.length === 1 ? "it" : "them"}.`
          : "Seat map published",
        status: "success",
      });
    } catch {
      setPublishError("Couldn’t publish. Check the connection and try again.");
    }
  }

  const status = blocked ? saveError : saveError ? saveError : saving ? "Saving draft…" : dirty ? "Unsaved changes" : "Draft saved";

  if (!wide) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
        <p className="border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[13px] text-neutral-600">
          Editing the seat map needs a wider screen. This is the current draft.
        </p>
        <SeatMapView doc={doc} className="flex-1" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-3">
        <div className="flex min-w-0 items-center gap-2.5 pr-2">
          <h1 className="text-[14px] font-semibold">Seat map</h1>
          <span
            role="status"
            className={cn("flex min-w-0 items-center gap-1.5 truncate text-[13px]", blocked || saveError ? "text-red-600" : "text-neutral-500")}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            <span className="truncate">{status}</span>
            {blocked ? (
              <button type="button" onClick={() => window.location.reload()} className="font-medium text-red-700 underline">
                Reload
              </button>
            ) : null}
          </span>
          <span className="hidden text-[13px] text-neutral-400 xl:inline">·</span>
          <span className="hidden truncate text-[13px] text-neutral-500 xl:inline">
            {publishedAt ? `Published ${formatWhen(publishedAt)}` : "Not published yet"}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo || preview}>
            <Undo2 className="size-4" aria-hidden />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo || preview}>
            <Redo2 className="size-4" aria-hidden />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={preview}
              aria-label={snapStep ? `Snap to ${SNAP_CHOICES.find((c) => c.step === snapStep)?.label ?? `${snapStep / 10} m`}. Hold Alt to bypass` : "Snap to grid: off"}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-full px-2 text-[13px] font-medium text-neutral-600 transition-colors duration-150 hover:bg-neutral-100! hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-35",
                snapStep > 0 && "bg-neutral-100! text-neutral-900",
              )}
            >
              <Magnet className="size-4" aria-hidden />
              <span className="tabular-nums">{snapStep ? (SNAP_CHOICES.find((c) => c.step === snapStep)?.label ?? `${snapStep / 10} m`) : "Off"}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setSnapStep(0)}>
                <span className="flex-1">Snap off</span>
              </DropdownMenuItem>
              {SNAP_CHOICES.map((choice) => (
                <DropdownMenuItem key={choice.step} onSelect={() => setSnapStep(choice.step)}>
                  <span className="flex-1">{choice.label}</span>
                  {snapStep === choice.step ? <span className="text-[12px] text-neutral-400">On</span> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={() => setShowIssues((v) => !v)}
            aria-pressed={showIssues}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors duration-150",
              errorCount
                ? "bg-red-50! text-red-700 hover:bg-red-100!"
                : issues.length
                  ? "bg-amber-50! text-amber-800 hover:bg-amber-100!"
                  : "text-neutral-600 hover:bg-neutral-100!",
            )}
          >
            <CircleAlert className="size-4" aria-hidden />
            {issues.length ? `${issues.length} issue${issues.length === 1 ? "" : "s"}` : "No issues"}
          </button>
          <span className="mx-1 h-5 w-px bg-neutral-200" aria-hidden />
          <button type="button" onClick={() => setDialog("template")} disabled={preview} className={secondary}>
            <LayoutTemplate className="size-4" aria-hidden />
            Template
          </button>
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            aria-pressed={preview}
            className={cn(secondary, preview && "border-neutral-900 bg-neutral-900! text-white! hover:bg-neutral-800!")}
          >
            {preview ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            {preview ? "Exit preview" : "Preview"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPublishError(null);
              setDialog("publish");
            }}
            disabled={blocked}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-neutral-900! px-3.5 text-[13px] font-medium text-white! transition-colors duration-150 hover:bg-neutral-700! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
          >
            Publish
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {preview ? (
          <div className="relative flex min-w-0 flex-1 flex-col">
            <SeatMapView doc={doc} className="flex-1" />
            <p className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900 px-3 py-1 text-[12px] font-medium text-white shadow-lg">
              Preview: what visitors see. Hover a seat or section.
            </p>
          </div>
        ) : (
          <>
            <ToolRail
              tool={tool}
              onTool={pickTool}
              lastInGroup={lastInGroup}
              onPickInGroup={(group, t) => {
                setLastInGroup((m) => ({ ...m, [group]: t }));
                setTool(t);
              }}
            />
            <div className="relative flex min-w-0 flex-1 flex-col">
              <DesignerCanvas
                doc={doc}
                selection={liveSelection}
                tool={tool}
                snapStep={snapStep}
                defaultCategory={defaultCategory}
                onCommit={onCommit}
                onSelect={setSelection}
                onTool={pickTool}
                onNotify={notify}
                apiRef={canvasApi}
              />
              {TOOL_HINT[tool] ? (
                <p className="pointer-events-none absolute top-3 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded-full bg-white/95 px-3 py-1 text-[12px] text-neutral-600 shadow-[0_2px_8px_-2px_rgba(17,17,17,0.15)]">
                  {TOOL_HINT[tool]}
                </p>
              ) : null}
              {!doc.sections.length && !doc.decorations.length ? (
                <EmptyState onTemplate={() => setDialog("template")} onDraw={() => pickTool("section")} />
              ) : null}
            </div>
            <Inspector
              doc={doc}
              selection={liveSelection}
              issues={issues}
              onChange={(next, key) => commit(next, key)}
              onSelect={setSelection}
              onDelete={removeSelected}
              onDuplicate={duplicateSelected}
              onFocus={() => canvasApi.current?.focusSelection(liveSelection)}
              onManageCategories={() => setDialog("categories")}
              onPlaceFocal={() => pickTool("focal")}
            />
          </>
        )}
        {showIssues ? <IssuesPanel issues={issues} onPick={focusIssue} onClose={() => setShowIssues(false)} /> : null}
      </div>

      <CategoriesDialog
        open={dialog === "categories"}
        doc={doc}
        onOpenChange={(o) => setDialog(o ? "categories" : null)}
        onSave={(next) => {
          commit(next);
          setDialog(null);
        }}
      />
      <TemplateDialog
        open={dialog === "template"}
        doc={doc}
        onOpenChange={(o) => setDialog(o ? "template" : null)}
        onApply={(next) => {
          commit(next);
          setSelection(new Set());
          setDialog(null);
          requestAnimationFrame(() => canvasApi.current?.fit());
        }}
      />
      <PublishDialog
        open={dialog === "publish"}
        doc={doc}
        live={liveSections}
        issues={issues}
        publishing={publish.isPending}
        error={publishError}
        onOpenChange={(o) => setDialog(o ? "publish" : null)}
        onPublish={() => void runPublish()}
      />
    </div>
  );
}

const secondary =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-neutral-200 bg-white! px-3 text-[13px] font-medium text-neutral-800 transition-colors duration-150 hover:bg-neutral-50! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50";

function IconButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn(
        "grid size-8 place-items-center rounded-full text-neutral-600 transition-colors duration-150 hover:bg-neutral-100! hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:pointer-events-none disabled:opacity-35",
        pressed && "bg-neutral-100! text-neutral-900",
      )}
    >
      {children}
    </button>
  );
}

function IssuesPanel({ issues, onPick, onClose }: { issues: SeatMapIssue[]; onPick: (issue: SeatMapIssue) => void; onClose: () => void }) {
  return (
    <div className="absolute bottom-4 left-16 z-20 flex max-h-[45vh] w-[340px] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_16px_40px_-12px_rgba(17,17,17,0.25)]">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-neutral-200 pr-1.5 pl-3.5">
        <p className="text-[13px] font-semibold">Issues</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close issues"
          className="grid size-7 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100! hover:text-neutral-900"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {issues.length ? (
        <ul className="overflow-y-auto p-1.5">
          {issues.map((issue, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onPick(issue)}
                disabled={!issue.target}
                className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] leading-snug hover:bg-neutral-50! disabled:cursor-default"
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", issue.level === "error" ? "bg-red-500" : "bg-amber-500")} aria-hidden />
                <span className="text-neutral-700">{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3.5 py-4 text-[13px] text-neutral-500">Nothing to fix. Sections, rows and seat numbers are consistent.</p>
      )}
    </div>
  );
}

function EmptyState({ onTemplate, onDraw }: { onTemplate: () => void; onDraw: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
      <div className="pointer-events-auto w-full max-w-[380px] rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-[0_16px_40px_-16px_rgba(17,17,17,0.2)]">
        <h2 className="text-[16px] font-semibold">Draw your venue</h2>
        <p className="mt-1.5 text-[14px] leading-snug text-neutral-600">Generate a stadium bowl to start from, or draw sections and rows by hand.</p>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={onDraw} className={secondary}>
            Draw a section
          </button>
          <button
            type="button"
            onClick={onTemplate}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-neutral-900! px-3.5 text-[13px] font-medium text-white! hover:bg-neutral-700!"
          >
            <LayoutTemplate className="size-4" aria-hidden />
            Stadium template
          </button>
        </div>
      </div>
    </div>
  );
}

function formatWhen(ms: number) {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ms).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}
