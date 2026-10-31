"use client";

import type { ReactNode } from "react";
import {
  ChefHat,
  Circle,
  CircleDot,
  DoorOpen,
  Footprints,
  RectangleHorizontal,
  Grip,
  GripHorizontal,
  Hand,
  LogOut,
  MousePointer2,
  Pentagon,
  Presentation,
  Shapes,
  ShoppingBag,
  Spline,
  Square,
  SquareRoundCorner,
  Type,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ToolId } from "./tools";

type ToolDef = { id: ToolId; label: string; icon: ReactNode; shortcut?: string };
type Group = { label: string; tools: ToolDef[]; divide?: boolean };

const icon = "size-[18px]";

export const TOOL_GROUPS: Group[] = [
  { label: "Select", tools: [{ id: "select", label: "Select and move", icon: <MousePointer2 className={icon} />, shortcut: "V" }] },
  { label: "Pan", tools: [{ id: "hand", label: "Pan", icon: <Hand className={icon} />, shortcut: "H" }] },
  {
    label: "Sections",
    divide: true,
    tools: [
      { id: "section", label: "Section (polygon)", icon: <Pentagon className={icon} />, shortcut: "S" },
      { id: "rect-section", label: "Section (rectangle)", icon: <Square className={icon} />, shortcut: "Shift S" },
      { id: "loge", label: "Loge", icon: <RectangleHorizontal className={icon} /> },
    ],
  },
  {
    label: "Rows",
    tools: [
      { id: "row", label: "Row", icon: <GripHorizontal className={icon} />, shortcut: "R" },
      { id: "curved-row", label: "Curved row", icon: <Spline className={icon} />, shortcut: "C" },
      { id: "row-block", label: "Block of rows", icon: <Grip className={icon} />, shortcut: "B" },
    ],
  },
  {
    label: "Tables",
    tools: [
      { id: "table-round", label: "Round table", icon: <CircleDot className={icon} /> },
      { id: "table-rect", label: "Rectangle table", icon: <RectangleHorizontal className={icon} /> },
    ],
  },
  {
    label: "Venue",
    divide: true,
    tools: [
      { id: "shape:venue", label: "Venue shape", icon: <SquareRoundCorner className={icon} /> },
      { id: "shape:stage", label: "Stage", icon: <Presentation className={icon} /> },
    ],
  },
  {
    label: "Shapes",
    tools: [
      { id: "shape:wall", label: "Rectangle", icon: <Square className={icon} /> },
      { id: "shape:column", label: "Circle", icon: <Circle className={icon} /> },
      { id: "shape:rect", label: "Labeled area", icon: <Shapes className={icon} /> },
      { id: "shape:ellipse", label: "Labeled ellipse", icon: <Circle className={icon} /> },
    ],
  },
  { label: "Text", tools: [{ id: "text", label: "Text", icon: <Type className={icon} />, shortcut: "T" }] },
  {
    label: "Places",
    divide: true,
    tools: [
      { id: "poi:entrance", label: "Entrance", icon: <DoorOpen className={icon} /> },
      { id: "poi:exit", label: "Exit", icon: <LogOut className={icon} /> },
      { id: "poi:stairs", label: "Stairs", icon: <Footprints className={icon} /> },
      { id: "poi:kitchen", label: "Kitchen", icon: <ChefHat className={icon} /> },
      { id: "poi:pickup", label: "Pickup point", icon: <ShoppingBag className={icon} /> },
    ],
  },
];

const buttonBase =
  "relative grid size-9 place-items-center rounded-lg text-neutral-600 transition-colors duration-150 hover:bg-neutral-200/70! hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500";
const active = "bg-neutral-900! text-white! hover:bg-neutral-800!";

export function ToolRail({
  tool,
  onTool,
  lastInGroup,
  onPickInGroup,
}: {
  tool: ToolId;
  onTool: (t: ToolId) => void;
  lastInGroup: Record<string, ToolId>;
  onPickInGroup: (group: string, t: ToolId) => void;
}) {
  return (
    <nav aria-label="Tools" className="flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-neutral-200 bg-white py-2">
      {TOOL_GROUPS.map((group) => {
        const shown = group.tools.find((t) => t.id === (lastInGroup[group.label] ?? group.tools[0].id)) ?? group.tools[0];
        const isActive = group.tools.some((t) => t.id === tool);
        const current = group.tools.find((t) => t.id === tool) ?? shown;
        const separator = group.divide ? <span className="my-1 h-px w-6 bg-neutral-200" aria-hidden /> : null;

        if (group.tools.length === 1) {
          return (
            <div key={group.label} className="contents">
              {separator}
              <button
                type="button"
                onClick={() => onTool(shown.id)}
                aria-pressed={isActive}
                aria-label={shown.label}
                title={shown.shortcut ? `${shown.label} (${shown.shortcut})` : shown.label}
                className={cn(buttonBase, isActive && active)}
              >
                {shown.icon}
              </button>
            </div>
          );
        }

        return (
          <div key={group.label} className="contents">
            {separator}
            <DropdownMenu modal={false}>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => onTool(current.id)}
                  aria-pressed={isActive}
                  aria-label={current.label}
                  title={current.shortcut ? `${current.label} (${current.shortcut})` : current.label}
                  className={cn(buttonBase, isActive && active)}
                >
                  {current.icon}
                </button>
                <DropdownMenuTrigger
                  aria-label={`More ${group.label.toLowerCase()} tools`}
                  className={cn(
                    "absolute right-0.5 bottom-0.5 grid size-3.5 place-items-center rounded-[4px] text-neutral-500 hover:bg-neutral-200/80 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500",
                    isActive && "text-white hover:bg-white/15 hover:text-white",
                  )}
                >
                  <svg viewBox="0 0 6 6" className="size-2" aria-hidden>
                    <path d="M0 6 L6 6 L6 0 Z" fill="currentColor" />
                  </svg>
                </DropdownMenuTrigger>
              </div>
              <DropdownMenuContent side="right" align="start" sideOffset={10}>
                <p className="px-2.5 pt-1.5 pb-1 text-[12px] font-medium text-neutral-500">{group.label}</p>
                {group.tools.map((t) => (
                  <DropdownMenuItem key={t.id} onSelect={() => onPickInGroup(group.label, t.id)}>
                    {t.icon}
                    <span className="flex-1">{t.label}</span>
                    {t.shortcut ? <kbd className="text-[11px] text-neutral-400">{t.shortcut}</kbd> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </nav>
  );
}

export function groupOf(tool: ToolId): string | undefined {
  return TOOL_GROUPS.find((g) => g.tools.some((t) => t.id === tool))?.label;
}
