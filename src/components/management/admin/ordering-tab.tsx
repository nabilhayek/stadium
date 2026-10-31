"use client";

import { Switch } from "@/components/ui/switch";
import { Card, FilterTabs } from "../ui";
import type { AdminSettings, Edit } from "./model";
import { MoneyInput, NumberInput, SettingList, SettingRow, ToggleRow } from "./settings-ui";

type Props = { settings: AdminSettings; edit: Edit };

const PICKUP = [
  { id: "all", label: "Every kitchen" },
  { id: "some", label: "Some kitchens" },
  { id: "off", label: "Off" },
] as const;

export function OrderingTab({ settings, edit }: Props) {
  const { currency } = settings;
  const o = settings.ordering;
  const set = (change: Partial<AdminSettings["ordering"]>) => edit((s) => ({ ...s, ordering: { ...s.ordering, ...change } }));

  return (
    <div className="flex flex-col gap-4">
      <Card title="Delivery to seats">
        <SettingList>
          <ToggleRow
            label="Seat delivery"
            description="Runners bring orders to the fan’s seat."
            checked={o.seatDelivery}
            onChange={(v) => set({ seatDelivery: v })}
          />
          <ToggleRow
            label="Delivery fee"
            description="Added to every delivered order."
            checked={o.deliveryFee}
            onChange={(v) => set({ deliveryFee: v })}
            disabled={!o.seatDelivery}
          >
            <MoneyInput cents={o.deliveryFeeCents} onChange={(c) => set({ deliveryFeeCents: c })} currency={currency} aria-label="Delivery fee" />
          </ToggleRow>
          <ToggleRow
            label="Free delivery over an amount"
            description="Skip the delivery fee on bigger orders."
            checked={o.freeDeliveryOver}
            onChange={(v) => set({ freeDeliveryOver: v })}
            disabled={!o.seatDelivery || !o.deliveryFee}
          >
            <MoneyInput
              cents={o.freeDeliveryOverCents}
              onChange={(c) => set({ freeDeliveryOverCents: c })}
              currency={currency}
              aria-label="Free delivery from"
            />
          </ToggleRow>
        </SettingList>
      </Card>

      <Card title="Pickup">
        <SettingList>
          <SettingRow
            label="Pickup at kitchens"
            description="Fans collect their order at the counter when it’s ready."
            control={<FilterTabs label="Pickup" value={o.pickup} onChange={(v) => set({ pickup: v })} options={PICKUP} />}
          >
            {o.pickup === "some" ? (
              <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200">
                {settings.kitchens.map((k) => (
                  <li key={k.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-[14px]">{k.name}</span>
                    <Switch
                      checked={k.pickup}
                      onCheckedChange={(v) => edit((s) => ({ ...s, kitchens: s.kitchens.map((x) => (x.id === k.id ? { ...x, pickup: v } : x)) }))}
                      aria-label={`Pickup at ${k.name}`}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </SettingRow>
        </SettingList>
      </Card>

      <Card title="Basket">
        <SettingList>
          <ToggleRow label="Minimum order" description="Orders below this can’t be placed." checked={o.minimumOrder} onChange={(v) => set({ minimumOrder: v })}>
            <MoneyInput cents={o.minimumOrderCents} onChange={(c) => set({ minimumOrderCents: c })} currency={currency} aria-label="Minimum order" />
          </ToggleRow>
          <ToggleRow label="Service fee" description="A percentage added on top of the basket." checked={o.serviceFee} onChange={(v) => set({ serviceFee: v })}>
            <NumberInput value={o.serviceFeePercent} min={0} max={30} suffix="%" onChange={(v) => set({ serviceFeePercent: v })} aria-label="Service fee" />
          </ToggleRow>
          <ToggleRow label="Tips" description="Offer a tip for the staff at checkout." checked={o.tips} onChange={(v) => set({ tips: v })} />
          <ToggleRow label="Order notes" description="Fans can add a short note for the kitchen." checked={o.notes} onChange={(v) => set({ notes: v })} />
        </SettingList>
      </Card>

      <Card title="Age-restricted products">
        <SettingList>
          <ToggleRow
            label="Limit per order"
            description="Caps alcoholic drinks in a single order."
            checked={o.alcoholLimit}
            onChange={(v) => set({ alcoholLimit: v })}
          >
            <NumberInput
              value={o.alcoholPerOrder}
              min={1}
              max={20}
              suffix="drinks"
              onChange={(v) => set({ alcoholPerOrder: v })}
              className="w-32"
              aria-label="Drinks per order"
            />
          </ToggleRow>
          <ToggleRow
            label="ID check on hand-over"
            description="Staff confirm the fan’s age before handing over."
            checked={o.ageCheck}
            onChange={(v) => set({ ageCheck: v })}
          />
        </SettingList>
      </Card>
    </div>
  );
}
