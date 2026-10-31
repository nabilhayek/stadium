"use client";

import { useState } from "react";
import { ChevronRight, MoreHorizontal, Plus, Route, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { sectionSeatCount } from "@/lib/seatmap/geometry";
import type { SeatMapDoc } from "@/lib/seatmap/schema";
import { cn } from "@/lib/utils";
import { Badge, Card, ghostButton, secondaryButton } from "../ui";
import { kitchenColor, mapBounds, nearestRoutes, type AdminSettings, type Edit, type Kitchen } from "./model";
import { RoutingMap } from "./routing-map";
import { NumberInput, SettingList, SettingRow, ToggleRow } from "./settings-ui";

type Props = { doc: SeatMapDoc; settings: AdminSettings; edit: Edit };

export function KitchensTab({ doc, settings, edit }: Props) {
  const { kitchens, routes } = settings;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const unrouted = doc.sections.filter((s) => !kitchens.some((k) => k.id === routes[s.id]));

  const updateKitchen = (id: string, change: Partial<Kitchen>) =>
    edit((s) => ({ ...s, kitchens: s.kitchens.map((k) => (k.id === id ? { ...k, ...change } : k)) }));
  const route = (sections: string[], kitchen: string) => {
    edit((s) => ({ ...s, routes: { ...s.routes, ...Object.fromEntries(sections.map((id) => [id, kitchen])) } }));
    setSelected(new Set());
  };

  function addKitchen() {
    const b = mapBounds(doc);
    const id = `kitchen-${Date.now()}`;
    edit((s) => ({
      ...s,
      kitchens: [
        ...s.kitchens,
        {
          id,
          name: `Kitchen ${s.kitchens.length + 1}`,
          x: (b.minX + b.maxX) / 2,
          y: (b.minY + b.maxY) / 2,
          open: true,
          pickup: true,
          delivery: true,
          capacity: 20,
          prepMinutes: 8,
          overflow: false,
          overflowTo: null,
          overflowAt: 85,
          autoPause: false,
        },
      ],
    }));
    setOpenId(id);
  }

  function removeKitchen(id: string) {
    edit((s) => ({
      ...s,
      kitchens: s.kitchens.filter((k) => k.id !== id).map((k) => (k.overflowTo === id ? { ...k, overflowTo: null, overflow: false } : k)),
      routes: Object.fromEntries(Object.entries(s.routes).filter(([, k]) => k !== id)),
      members: s.members.map((m) => ({ ...m, kitchens: m.kitchens.filter((k) => k !== id) })),
    }));
  }

  const load = (k: Kitchen) => {
    const sections = doc.sections.filter((s) => routes[s.id] === k.id);
    return { sections: sections.length, seats: sections.reduce((n, s) => n + sectionSeatCount(s), 0) };
  };

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Order routing"
        description="Click sections to select them, then drag onto a kitchen. Drag a kitchen to move it."
        action={
          <button
            type="button"
            onClick={() => edit((s) => ({ ...s, routes: nearestRoutes(doc, s.kitchens) }))}
            className={ghostButton}
            disabled={!kitchens.length}
          >
            <Route className="size-3.5" aria-hidden />
            Nearest kitchen
          </button>
        }
      >
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex min-w-0 flex-col gap-2">
            <RoutingMap
              doc={doc}
              kitchens={kitchens}
              routes={routes}
              selected={selected}
              onSelect={setSelected}
              onRoute={route}
              onMoveKitchen={(id, x, y) => updateKitchen(id, { x, y })}
            />
            <div className="flex min-h-8 flex-wrap items-center gap-2 text-[13px]">
              {selected.size ? (
                <>
                  <span className="font-medium tabular-nums">
                    {selected.size} section{selected.size === 1 ? "" : "s"} selected
                  </span>
                  <span className="text-neutral-400">Send to</span>
                  {kitchens.map((k) => (
                    <button key={k.id} type="button" onClick={() => route([...selected], k.id)} className={cn(secondaryButton, "h-8 px-3 text-[13px]")}>
                      <span className="size-2.5 rounded-full" style={{ background: kitchenColor(kitchens, k.id) ?? undefined }} aria-hidden />
                      {k.name}
                    </button>
                  ))}
                  <button type="button" onClick={() => setSelected(new Set())} className={ghostButton}>
                    Clear
                  </button>
                </>
              ) : unrouted.length ? (
                <span className="text-amber-700">
                  {unrouted.length} section{unrouted.length === 1 ? " has" : "s have"} no kitchen. Orders from {unrouted.length === 1 ? "it" : "them"} go to the
                  nearest open one.
                </span>
              ) : (
                <span className="text-neutral-500">Every section sends its orders to a kitchen.</span>
              )}
            </div>
          </div>
          <ul className="flex flex-col gap-1.5">
            {kitchens.map((k, i) => {
              const l = load(k);
              return (
                <li key={k.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set(doc.sections.filter((s) => routes[s.id] === k.id).map((s) => s.id)))}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-neutral-200 px-3 py-2 text-left transition-colors duration-150 hover:bg-neutral-50"
                  >
                    <span
                      className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: kitchenColor(kitchens, k.id) ?? undefined }}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{k.name}</span>
                      <span className="block text-[12px] text-neutral-500 tabular-nums">
                        {l.sections} sections · {l.seats.toLocaleString("en")} seats
                      </span>
                    </span>
                    {!k.open ? <Badge tone="bg-neutral-500">Paused</Badge> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Card>

      <Card
        title="Kitchens"
        description="Open or pause a kitchen, choose what it handles and what happens when it gets busy."
        action={
          <button type="button" onClick={addKitchen} className={ghostButton}>
            <Plus className="size-3.5" aria-hidden />
            Add kitchen
          </button>
        }
      >
        <ul className="divide-y divide-neutral-200">
          {kitchens.map((k, i) => {
            const open = openId === k.id;
            const others = kitchens.filter((o) => o.id !== k.id);
            return (
              <li key={k.id}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : k.id)}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500"
                  >
                    <ChevronRight className={cn("size-4 shrink-0 text-neutral-400 transition-transform duration-150", open && "rotate-90")} aria-hidden />
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white"
                      style={{ background: kitchenColor(kitchens, k.id) ?? undefined }}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{k.name}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-neutral-500">
                        {[k.delivery ? "Seat delivery" : null, k.pickup ? "Pickup" : null].filter(Boolean).join(" · ") || "No orders"} · up to {k.capacity}{" "}
                        orders at once
                        {k.overflow && k.overflowTo ? ` · overflow to ${kitchens.find((o) => o.id === k.overflowTo)?.name}` : ""}
                      </span>
                    </span>
                  </button>
                  <label className="flex shrink-0 items-center gap-2 text-[12px] text-neutral-500">
                    <span className="hidden sm:inline">{k.open ? "Open" : "Paused"}</span>
                    <Switch checked={k.open} onCheckedChange={(v) => updateKitchen(k.id, { open: v })} aria-label={`${k.name} open`} />
                  </label>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`More actions for ${k.name}`}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-neutral-500 transition-colors duration-150 hover:bg-neutral-200/60! hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500 data-[state=open]:bg-neutral-200/60!"
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem variant="destructive" onSelect={() => removeKitchen(k.id)} disabled={kitchens.length <= 1}>
                        <Trash2 />
                        Remove kitchen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {open ? (
                  <div className="mx-4 mb-4 rounded-xl border border-neutral-200">
                    <SettingList>
                      <SettingRow
                        label="Name"
                        htmlFor={`kitchen-name-${k.id}`}
                        control={
                          <input
                            id={`kitchen-name-${k.id}`}
                            value={k.name}
                            maxLength={40}
                            onChange={(e) => updateKitchen(k.id, { name: e.target.value })}
                            className="h-9 w-52 rounded-lg border border-neutral-200 bg-white px-3 text-[14px] outline-none transition-[border-color,box-shadow] focus-visible:border-blue-500 focus-visible:ring-3 focus-visible:ring-blue-500/15"
                          />
                        }
                      />
                      <ToggleRow
                        label="Seat delivery"
                        description="Runners collect orders here and bring them to seats."
                        checked={k.delivery}
                        onChange={(v) => updateKitchen(k.id, { delivery: v })}
                      />
                      <ToggleRow
                        label="Pickup"
                        description="Fans can collect their order at this kitchen’s counter."
                        checked={k.pickup}
                        onChange={(v) => updateKitchen(k.id, { pickup: v })}
                      />
                      <SettingRow
                        label="Capacity"
                        description="Orders in progress before the kitchen counts as full."
                        control={
                          <NumberInput
                            value={k.capacity}
                            min={1}
                            max={500}
                            suffix="orders"
                            onChange={(v) => updateKitchen(k.id, { capacity: v })}
                            className="w-32"
                            aria-label="Capacity"
                          />
                        }
                      />
                      <SettingRow
                        label="Prep time"
                        description="Typical time per order, used for the wait shown to fans."
                        control={
                          <NumberInput
                            value={k.prepMinutes}
                            min={1}
                            max={120}
                            suffix="min"
                            onChange={(v) => updateKitchen(k.id, { prepMinutes: v })}
                            aria-label="Prep time"
                          />
                        }
                      />
                      <ToggleRow
                        label="Share load"
                        description="When this kitchen is busy, new orders go to another one."
                        checked={k.overflow}
                        onChange={(v) => updateKitchen(k.id, { overflow: v, overflowTo: k.overflowTo ?? others[0]?.id ?? null })}
                        disabled={!others.length}
                      >
                        <div className="flex flex-wrap items-center gap-2 text-[13px] text-neutral-600">
                          Send to
                          <Select value={k.overflowTo ?? ""} onValueChange={(v) => updateKitchen(k.id, { overflowTo: v })}>
                            <SelectTrigger size="sm" aria-label="Overflow kitchen" className="w-44">
                              <SelectValue placeholder="Pick a kitchen" />
                            </SelectTrigger>
                            <SelectContent align="start">
                              {others.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {o.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          when it reaches
                          <NumberInput
                            value={k.overflowAt}
                            min={10}
                            max={100}
                            suffix="%"
                            onChange={(v) => updateKitchen(k.id, { overflowAt: v })}
                            className="w-24"
                            aria-label="Overflow threshold"
                          />
                          of capacity
                        </div>
                      </ToggleRow>
                      <ToggleRow
                        label="Pause when full"
                        description="Stop taking orders for this kitchen’s sections until it catches up."
                        checked={k.autoPause}
                        onChange={(v) => updateKitchen(k.id, { autoPause: v })}
                      />
                    </SettingList>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
