"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, CircleDot, ListChecks, Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { groupRule, type OptionSelection } from "@/lib/menu/options";
import { currencySymbol } from "@/lib/money";
import { cn } from "@/lib/utils";
import { newGroup, newOption, type DraftErrors, type GroupDraft, type OptionDraft } from "./draft";

type Props = {
  groups: GroupDraft[];
  currency: string;
  errors: DraftErrors;
  onChange: (groups: GroupDraft[]) => void;
};

const PRESETS: { selection: OptionSelection; label: string; hint: string; icon: typeof CircleDot }[] = [
  { selection: "SINGLE", label: "Pick one", hint: "Radio buttons, e.g. a drink or fries", icon: CircleDot },
  { selection: "MULTIPLE", label: "Pick any", hint: "Checkboxes, e.g. sauces or extras", icon: ListChecks },
];

export function OptionGroups({ groups, currency, errors, onChange }: Props) {
  function update(index: number, next: GroupDraft) {
    onChange(groups.map((g, i) => (i === index ? next : g)));
  }

  function move(index: number, by: -1 | 1) {
    const next = [...groups];
    const [g] = next.splice(index, 1);
    next.splice(index + by, 0, g);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group, gi) => (
        <GroupCard
          key={group.key}
          group={group}
          index={gi}
          count={groups.length}
          currency={currency}
          errors={errors}
          onChange={(next) => update(gi, next)}
          onMove={(by) => move(gi, by)}
          onRemove={() => onChange(groups.filter((_, i) => i !== gi))}
        />
      ))}

      <div className={cn("grid gap-2 sm:grid-cols-2", groups.length === 0 && "rounded-xl border border-dashed border-neutral-300 p-3")}>
        {groups.length === 0 ? (
          <p className="text-[13px] leading-snug text-neutral-500 sm:col-span-2">
            No options. Customers add it to the cart in one tap. Add a group to let them choose sauces, sides or a drink.
          </p>
        ) : null}
        {PRESETS.map((preset) => (
          <button
            key={preset.selection}
            type="button"
            onClick={() => onChange([...groups, newGroup(preset.selection)])}
            className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white! px-3 py-2.5 text-left transition-colors duration-150 hover:bg-neutral-50! focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-700">
              <preset.icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-[14px] font-medium">
                <Plus className="size-3.5" aria-hidden />
                {preset.label} group
              </span>
              <span className="block text-[12px] text-neutral-500">{preset.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function GroupCard({
  group,
  index,
  count,
  currency,
  errors,
  onChange,
  onMove,
  onRemove,
}: {
  group: GroupDraft;
  index: number;
  count: number;
  currency: string;
  errors: DraftErrors;
  onChange: (g: GroupDraft) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const path = `optionGroups.${index}`;
  const single = group.selection === "SINGLE";
  const groupError = errors[`${path}.options`] ?? errors[`${path}.maxSelect`];
  const max = group.maxSelect.trim() ? Number(group.maxSelect) : null;
  const rule = groupRule({ selection: group.selection, required: group.required, maxSelect: Number.isFinite(max) ? max : null });

  function setOption(oi: number, next: OptionDraft) {
    let options = group.options.map((o, i) => (i === oi ? next : o));
    if (single && next.isDefault) options = options.map((o, i) => (i === oi ? o : { ...o, isDefault: false }));
    onChange({ ...group, options });
  }

  function setSelection(selection: OptionSelection) {
    let options = group.options;
    if (selection === "SINGLE") {
      const first = options.findIndex((o) => o.isDefault);
      options = options.map((o, i) => ({ ...o, isDefault: i === first }));
    }
    onChange({ ...group, selection, options, maxSelect: selection === "SINGLE" ? "" : group.maxSelect });
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white" aria-label={group.name || `Option group ${index + 1}`}>
      <div className="flex items-start gap-2 border-b border-neutral-200 p-3">
        <div className="min-w-0 flex-1">
          <Input
            value={group.name}
            onChange={(e) => onChange({ ...group, name: e.target.value })}
            placeholder={single ? "e.g. Choose a drink" : "e.g. Sauces"}
            aria-label="Group name"
            aria-invalid={Boolean(errors[`${path}.name`])}
            className="font-medium aria-invalid:border-red-500"
          />
          {errors[`${path}.name`] ? <p className="mt-1 text-[12px] text-red-600">{errors[`${path}.name`]}</p> : null}
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton label="Move group up" onClick={() => onMove(-1)} disabled={index === 0}>
            <ArrowUp className="size-4" />
          </IconButton>
          <IconButton label="Move group down" onClick={() => onMove(1)} disabled={index === count - 1}>
            <ArrowDown className="size-4" />
          </IconButton>
          <IconButton label="Delete group" onClick={onRemove} danger>
            <Trash2 className="size-4" />
          </IconButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-200 px-3 py-2.5">
        <div role="radiogroup" aria-label="How many can be picked" className="flex rounded-lg bg-neutral-100 p-0.5">
          {(["SINGLE", "MULTIPLE"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={group.selection === s}
              onClick={() => setSelection(s)}
              className={cn(
                "h-7 rounded-md px-2.5 text-[13px] font-medium transition-colors duration-150",
                group.selection === s ? "bg-white! text-neutral-900 shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-neutral-500 hover:text-neutral-900",
              )}
            >
              {s === "SINGLE" ? "Pick one" : "Pick any"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[13px] font-medium">
          <Switch checked={group.required} onCheckedChange={(required) => onChange({ ...group, required })} />
          Required
        </label>
        {!single ? (
          <label className="flex items-center gap-2 text-[13px] font-medium">
            Max
            <Input
              inputMode="numeric"
              value={group.maxSelect}
              onChange={(e) => onChange({ ...group, maxSelect: e.target.value.replace(/\D/g, "").slice(0, 2) })}
              placeholder="Any"
              aria-label="Most options a customer can pick"
              className="h-8 w-16 text-center tabular-nums"
            />
          </label>
        ) : null}
        <span className="ml-auto text-[12px] text-neutral-500">Shop shows “{rule}”</span>
      </div>

      <div className="px-3 pt-2 pb-3">
        <div className="hidden grid-cols-[1fr_7.5rem_4.5rem_4.5rem_2rem] gap-2 px-0.5 pb-1.5 text-[12px] font-medium text-neutral-500 sm:grid">
          <span>Option</span>
          <span>Price change</span>
          <span className="text-center">{single ? "Default" : "Pre-ticked"}</span>
          <span className="text-center">Sold out</span>
          <span />
        </div>
        <ul className="flex flex-col gap-2">
          {group.options.map((option, oi) => {
            const opath = `${path}.options.${oi}`;
            const nameError = errors[`${opath}.name`];
            const priceError = errors[`${opath}.priceCents`];
            return (
              <li key={option.key} className="grid grid-cols-[1fr_7.5rem_2rem] items-start gap-2 sm:grid-cols-[1fr_7.5rem_4.5rem_4.5rem_2rem]">
                <div className="min-w-0">
                  <Input
                    value={option.name}
                    onChange={(e) => setOption(oi, { ...option, name: e.target.value })}
                    placeholder={single ? "e.g. Cola" : "e.g. Extra patty"}
                    aria-label={`Option ${oi + 1} name`}
                    aria-invalid={Boolean(nameError)}
                    className={cn("aria-invalid:border-red-500", option.isSoldOut && "text-neutral-400 line-through")}
                  />
                  {nameError ? <p className="mt-1 text-[12px] text-red-600">{nameError}</p> : null}
                </div>
                <div>
                  <PriceDelta
                    value={option.price}
                    currency={currency}
                    invalid={Boolean(priceError)}
                    onChange={(price) => setOption(oi, { ...option, price })}
                    label={`Price change for option ${oi + 1}`}
                  />
                  {priceError ? <p className="mt-1 text-[12px] text-red-600">{priceError}</p> : null}
                </div>
                <label className="col-start-1 flex h-9 items-center gap-2 text-[13px] text-neutral-600 sm:col-start-auto sm:justify-center">
                  <input
                    type={single ? "radio" : "checkbox"}
                    name={`default-${group.key}`}
                    checked={option.isDefault}
                    onChange={(e) => setOption(oi, { ...option, isDefault: e.target.checked })}
                    onClick={() => {
                      if (single && option.isDefault) setOption(oi, { ...option, isDefault: false });
                    }}
                    className="size-4 accent-neutral-900"
                    aria-label={`${single ? "Default" : "Pre-ticked"}: option ${oi + 1}`}
                  />
                  <span className="sm:sr-only">{single ? "Default" : "Pre-ticked"}</span>
                </label>
                <label className="flex h-9 items-center gap-2 text-[13px] text-neutral-600 sm:justify-center">
                  <Switch
                    checked={option.isSoldOut}
                    onCheckedChange={(isSoldOut) => setOption(oi, { ...option, isSoldOut })}
                    aria-label={`Sold out: option ${oi + 1}`}
                  />
                  <span className="sm:sr-only">Sold out</span>
                </label>
                <IconButton
                  label={`Remove option ${oi + 1}`}
                  onClick={() => onChange({ ...group, options: group.options.filter((_, i) => i !== oi) })}
                  disabled={group.options.length === 1}
                  className="row-start-1 col-start-3 sm:row-start-auto sm:col-start-auto"
                >
                  <X className="size-4" />
                </IconButton>
              </li>
            );
          })}
        </ul>
        {groupError ? (
          <p role="alert" className="mt-2 text-[12px] text-red-600">
            {groupError}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => onChange({ ...group, options: [...group.options, newOption()] })}
          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-neutral-700 transition-colors duration-150 hover:bg-neutral-100! hover:text-neutral-900"
        >
          <Plus className="size-3.5" aria-hidden />
          Add option
        </button>
      </div>
    </section>
  );
}

/** Signed amount. Empty means no change; a minus lowers the price. */
function PriceDelta({
  value,
  currency,
  invalid,
  label,
  onChange,
}: {
  value: string;
  currency: string;
  invalid: boolean;
  label: string;
  onChange: (v: string) => void;
}) {
  const negative = value.trim().startsWith("-");
  return (
    <div
      className={cn(
        "flex h-9 items-center rounded-lg border bg-white text-[14px] transition-[border-color,box-shadow] duration-150 focus-within:border-blue-500 focus-within:ring-3 focus-within:ring-blue-500/15",
        invalid ? "border-red-500" : "border-neutral-200",
      )}
    >
      <button
        type="button"
        onClick={() => onChange(negative ? value.trim().slice(1) : `-${value.trim().replace(/^\+/, "")}`)}
        aria-label={negative ? "Make it add to the price" : "Make it lower the price"}
        title={negative ? "Lowers the price" : "Adds to the price"}
        className={cn(
          "ml-0.5 grid h-7 w-6 shrink-0 place-items-center rounded-md text-[14px] font-semibold transition-colors duration-150 hover:bg-neutral-100!",
          negative ? "text-orange-600" : "text-emerald-600",
        )}
      >
        {negative ? "−" : "+"}
      </button>
      <span className="text-neutral-400">{currencySymbol(currency)}</span>
      <input
        inputMode="decimal"
        value={value.replace(/^[+-]/, "")}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d.,]/g, "");
          onChange(negative && digits ? `-${digits}` : digits);
        }}
        placeholder="0.00"
        aria-label={label}
        aria-invalid={invalid}
        className="min-w-0 flex-1 bg-transparent px-1.5 text-right tabular-nums outline-none placeholder:text-neutral-400"
      />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg text-neutral-500 transition-colors duration-150 hover:bg-neutral-100! disabled:pointer-events-none disabled:opacity-30",
        danger ? "hover:text-red-600" : "hover:text-neutral-900",
        className,
      )}
    >
      {children}
    </button>
  );
}
