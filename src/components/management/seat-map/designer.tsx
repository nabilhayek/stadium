"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMutation } from "@tanstack/react-query";
import { CircleAlert, Eye, EyeOff, Loader2, Magnet, Redo2, Sparkles, Trash2, Undo2, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SeatMapView } from "@/components/seatmap/seat-map-view";
import { useToast } from "@/components/toast/toast-provider";
import type { SeatMapState, VenueSection } from "@/lib/management/seat-map";
import { rowNeedsRenumber, translation } from "@/lib/seatmap/geometry";
import type { SeatMapDoc } from "@/lib/seatmap/schema";
import { validateSeatMap, type SeatMapIssue } from "@/lib/seatmap/validate";
import { useTRPC } from "@/lib/trpc/react";
import { cn } from "@/lib/utils";
import { AssistantPanel } from "./assistant-panel";
import { DesignerCanvas, type CanvasApi } from "./designer-canvas";
import { CategoriesDialog, ClearMapDialog, PublishDialog } from "./dialogs";
import { Inspector } from "./inspector";
import { deleteSelection, duplicateSelection, findRow, groupRowsAsSection, keyOf, renumberRows, seatKey, splitSelection, transformSelection } from "./ops";
import { allLoose, SelectionBar } from "./selection-bar";
import { groupOf, TOOL_HINT, ToolRail } from "./tool-rail";
import type { AssistChip, ToolId } from "./tools";
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
const ANGLE_CHOICES = [5, 10, 15, 30, 45, 90];

function magnetLabel(step: number, angle: number) {
  const dist = step ? (SNAP_CHOICES.find((c) => c.step === step)?.label ?? `${step / 10} m`) : null;
  const turn = angle ? `${angle}°` : null;
  return [dist, turn].filter(Boolean).join(" · ") || "Off";
}

const SHORTCUTS: Record<string, ToolId> = {
  v: "select",
  h: "hand",
  s: "section",
  S: "rect-section",
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
  const { doc, commit, undo, redo, canUndo, canRedo, lastKey } = useHistory(initial.draft);
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [tool, setTool] = useState<ToolId>("select");
  const [lastInGroup, setLastInGroup] = useState<Record<string, ToolId>>({});
  const [snapStep, setSnapStep] = useState(10);
  const [snapAngle, setSnapAngle] = useState(0);
  const [assist, setAssist] = useState<AssistChip[]>([]);
  const [preview, setPreview] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [dialog, setDialog] = useState<"categories" | "publish" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [liveSections, setLiveSections] = useState<VenueSection[]>(initial.sections);
  const [publishedAt, setPublishedAt] = useState(initial.publishedAt);
  const [savedDoc, setSavedDoc] = useState(initial.draft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiBuilding, setAiBuilding] = useState(false);
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
      for (const r of s.rows) {
        ids.add(keyOf("r", r.id));
        const gone = new Set(r.removed);
        for (let i = 0; i < r.seats; i++) if (!gone.has(i)) ids.add(seatKey(r.id, i));
      }
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
    const parts = splitSelection(liveSelection);
    const next = deleteSelection(doc, liveSelection);
    const onlySeats = parts.seats.length > 0 && !parts.sections.size && !parts.rows.size && !parts.decorations.size && !parts.pois.size;
    if (onlySeats) {
      const rowIds = new Set(parts.seats.map((s) => s.rowId));
      const still = new Set<string>();
      for (const section of next.sections) for (const row of section.rows) if (rowIds.has(row.id)) still.add(keyOf("r", row.id));
      setSelection(still);
    } else setSelection(new Set());
    commit(next);
  }, [commit, doc, liveSelection]);

  const groupSelected = useCallback(() => {
    const parts = splitSelection(liveSelection);
    if (!parts.rows.size || !allLoose(doc, parts.rows)) return;
    const grouped = groupRowsAsSection(doc, parts.rows);
    if (!grouped) return;
    commit(grouped.doc, "group");
    setSelection(new Set([keyOf("s", grouped.sectionId)]));
    toast({ message: "Grouped as a new section", status: "success" });
  }, [commit, doc, liveSelection, toast]);

  const canGroupSelected = useMemo(() => {
    const parts = splitSelection(liveSelection);
    return parts.rows.size > 0 && allLoose(doc, parts.rows);
  }, [doc, liveSelection]);

  const renumberSelected = useCallback(() => {
    const parts = splitSelection(liveSelection);
    const ids = new Set(parts.rows);
    for (const seat of parts.seats) ids.add(seat.rowId);
    if (!ids.size) return;
    commit(renumberRows(doc, ids));
  }, [commit, doc, liveSelection]);

  const canRenumber = useMemo(() => {
    const parts = splitSelection(liveSelection);
    const ids = new Set(parts.rows);
    for (const seat of parts.seats) ids.add(seat.rowId);
    for (const id of ids) {
      const found = findRow(doc, id);
      if (found && rowNeedsRenumber(found.row)) return true;
    }
    return false;
  }, [doc, liveSelection]);

  const duplicateSelected = useCallback(() => {
    if (!liveSelection.size) return;
    const parts = splitSelection(liveSelection);
    if (!parts.sections.size && !parts.rows.size && !parts.decorations.size && !parts.pois.size) return;
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

  const applyAssistant = useCallback(
    (next: SeatMapDoc, key: string) => {
      commit(next, key, true);
      setSelection(new Set());
      const hasContent = next.sections.length > 0 || next.decorations.length > 0 || next.pois.length > 0;
      if (hasContent) requestAnimationFrame(() => canvasApi.current?.reveal());
    },
    [commit],
  );

  useEffect(() => {
    if (preview || !wide || aiBusy) return;
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
      if ((k === "g" || k === "G") && canGroupSelected) {
        e.preventDefault();
        groupSelected();
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
  }, [aiBusy, canGroupSelected, commit, doc, duplicateSelected, groupSelected, liveSelection, pickTool, preview, redo, removeSelected, tool, undo, wide]);

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
          <IconButton label="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo || preview || aiBusy}>
            <Undo2 className="size-4" aria-hidden />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo || preview || aiBusy}>
            <Redo2 className="size-4" aria-hidden />
          </IconButton>
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={preview}
              aria-label={`Snap ${magnetLabel(snapStep, snapAngle)}. Hold Alt to bypass`}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-full px-2 text-[13px] font-medium text-neutral-600 transition-colors duration-150 hover:bg-neutral-100! hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-35",
                (snapStep > 0 || snapAngle > 0) && "bg-neutral-100! text-neutral-900",
              )}
            >
              <Magnet className="size-4" aria-hidden />
              <span className="tabular-nums">{magnetLabel(snapStep, snapAngle)}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="flex w-auto items-stretch p-1">
              <div className="flex w-36 flex-col">
                <p className="px-2 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-neutral-400 uppercase">Grid</p>
                <DropdownMenuItem onSelect={() => setSnapStep(0)}>
                  <span className="flex-1">Off</span>
                  {snapStep === 0 ? <span className="text-[12px] text-neutral-400">On</span> : null}
                </DropdownMenuItem>
                {SNAP_CHOICES.map((choice) => (
                  <DropdownMenuItem key={choice.step} onSelect={() => setSnapStep(choice.step)}>
                    <span className="flex-1">{choice.label}</span>
                    {snapStep === choice.step ? <span className="text-[12px] text-neutral-400">On</span> : null}
                  </DropdownMenuItem>
                ))}
              </div>
              <div className="mx-1 w-px shrink-0 self-stretch bg-neutral-300" aria-hidden />
              <div className="flex w-28 flex-col">
                <p className="px-2 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-neutral-400 uppercase">Angle</p>
                <DropdownMenuItem onSelect={() => setSnapAngle(0)}>
                  <span className="flex-1">Off</span>
                  {snapAngle === 0 ? <span className="text-[12px] text-neutral-400">On</span> : null}
                </DropdownMenuItem>
                {ANGLE_CHOICES.map((deg) => (
                  <DropdownMenuItem key={deg} onSelect={() => setSnapAngle(deg)}>
                    <span className="flex-1 tabular-nums">{deg}°</span>
                    {snapAngle === deg ? <span className="text-[12px] text-neutral-400">On</span> : null}
                  </DropdownMenuItem>
                ))}
              </div>
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
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={preview || aiBusy || (doc.sections.length === 0 && doc.decorations.length === 0 && doc.pois.length === 0)}
            className={secondary}
          >
            <Trash2 className="size-4" aria-hidden />
            Clear
          </button>
          <span className="mx-1 h-5 w-px bg-neutral-200" aria-hidden />
          <button
            type="button"
            onClick={() => setAssistantOpen((v) => !v)}
            disabled={preview}
            aria-pressed={assistantOpen}
            className={cn(secondary, assistantOpen && "border-neutral-300 bg-neutral-100! hover:bg-neutral-200/70!")}
          >
            <Sparkles className="size-4" aria-hidden />
            Assistant
          </button>
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            disabled={aiBusy}
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
            disabled={blocked || aiBusy}
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
            <div inert={aiBusy} className={cn("flex", aiBusy && "opacity-40")}>
              <ToolRail
                tool={tool}
                onTool={pickTool}
                lastInGroup={lastInGroup}
                onPickInGroup={(group, t) => {
                  setLastInGroup((m) => ({ ...m, [group]: t }));
                  setTool(t);
                }}
              />
            </div>
            <div className="relative flex min-w-0 flex-1 flex-col">
              <DesignerCanvas
                doc={doc}
                selection={liveSelection}
                tool={tool}
                snapStep={snapStep}
                snapAngle={snapAngle}
                defaultCategory={defaultCategory}
                onCommit={onCommit}
                onSelect={setSelection}
                onTool={pickTool}
                onNotify={notify}
                onAssist={setAssist}
                apiRef={canvasApi}
                crafting={aiBuilding}
              />
              {TOOL_HINT[tool] && !aiBusy ? (
                <p className="pointer-events-none absolute top-3 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded-full bg-white/95 px-3 py-1 text-[12px] text-neutral-600 shadow-[0_2px_8px_-2px_rgba(17,17,17,0.15)]">
                  {TOOL_HINT[tool]}
                </p>
              ) : null}
              <SelectionBar
                selection={liveSelection}
                canGroup={canGroupSelected}
                canRenumber={canRenumber}
                hints={assist}
                onGroup={groupSelected}
                onRenumber={renumberSelected}
                onDuplicate={duplicateSelected}
                onDelete={removeSelected}
                onFocus={() => canvasApi.current?.focusSelection(liveSelection)}
              />
              {aiBusy ? (
                <div className="absolute inset-0 z-10 cursor-progress">
                  <p role="status" className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-neutral-900 px-3 py-1 text-[12px] font-medium text-white shadow-lg">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    The assistant is editing the map
                  </p>
                </div>
              ) : null}
            </div>
            {assistantOpen ? null : <Inspector
              doc={doc}
              selection={liveSelection}
              issues={issues}
              onChange={(next, key) => commit(next, key)}
              onSelect={setSelection}
              onDelete={removeSelected}
              onDuplicate={duplicateSelected}
              onFocus={() => canvasApi.current?.focusSelection(liveSelection)}
              onManageCategories={() => setDialog("categories")}
              onNotify={(message) => toast({ message })}
            />}
          </>
        )}
        <AssistantPanel
          doc={doc}
          lastKey={lastKey}
          open={assistantOpen && !preview}
          onApply={applyAssistant}
          onBusyChange={setAiBusy}
          onBuildingChange={setAiBuilding}
          onUndo={undo}
          onClose={() => setAssistantOpen(false)}
        />
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
      <ClearMapDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        onConfirm={() => {
          commit({ ...doc, sections: [], decorations: [], pois: [] });
          setSelection(new Set());
          setConfirmClear(false);
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

function formatWhen(ms: number) {
  const minutes = Math.round((Date.now() - ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ms).toLocaleDateString("en", {
    day: "numeric",
    month: "short",
  });
}
