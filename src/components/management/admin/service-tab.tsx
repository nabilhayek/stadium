"use client";

import Link from "next/link";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FlagIcon } from "@/components/i18n/flag-icon";
import { currencyFlag } from "@/lib/flag-codes";
import { currencySymbol } from "@/lib/money";
import { Card } from "../ui";
import { CURRENCIES, type AdminSettings, type Edit } from "./model";
import { NumberInput, SettingList, SettingRow, TextInput, ToggleRow } from "./settings-ui";

type Props = { settings: AdminSettings; edit: Edit };

export function ServiceTab({ settings, edit }: Props) {
  const { service: sv, payments: p, notifications: n, ordering } = settings;
  const setService = (change: Partial<AdminSettings["service"]>) => edit((s) => ({ ...s, service: { ...s.service, ...change } }));
  const setPayments = (change: Partial<AdminSettings["payments"]>) => edit((s) => ({ ...s, payments: { ...s.payments, ...change } }));
  const setNotes = (change: Partial<AdminSettings["notifications"]>) => edit((s) => ({ ...s, notifications: { ...s.notifications, ...change } }));
  const methods = [p.card, p.applePay, p.googlePay, p.swish].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Shop" description="Whether fans can order, and the message they see when kitchens are busy.">
        <SettingList>
          <ToggleRow
            label="Take orders"
            description="Turn off to close the shop for every section right away."
            checked={ordering.acceptOrders}
            onChange={(v) => edit((s) => ({ ...s, ordering: { ...s.ordering, acceptOrders: v } }))}
          />
          <ToggleRow
            label="Pre-orders"
            description="Fans can order before they arrive and pick a time."
            checked={sv.preorder}
            onChange={(v) => setService({ preorder: v })}
          />
          <SettingRow label="Busy message" description="Shown in the shop when a kitchen is over capacity." htmlFor="busy-message">
            <TextInput id="busy-message" value={sv.busyMessage} onChange={(v) => setService({ busyMessage: v })} />
          </SettingRow>
        </SettingList>
      </Card>

      <Card title="Payments" description={methods ? undefined : "Turn on at least one payment method to take orders."}>
        <SettingList>
          <CurrencyRow currency={settings.currency} onChange={(currency) => edit((s) => ({ ...s, currency }))} />
          <ToggleRow label="Card" description="Visa, Mastercard and American Express." checked={p.card} onChange={(v) => setPayments({ card: v })} />
          <ToggleRow label="Apple Pay" checked={p.applePay} onChange={(v) => setPayments({ applePay: v })} />
          <ToggleRow label="Google Pay" checked={p.googlePay} onChange={(v) => setPayments({ googlePay: v })} />
          <ToggleRow label="Swish" checked={p.swish} onChange={(v) => setPayments({ swish: v })} />
          <SettingRow
            label="Auto refund"
            description="Refund orders no kitchen has accepted after this long. The open orders board applies it; a nightly job catches anything left."
            control={
              <NumberInput
                value={p.autoRefundMinutes}
                min={5}
                max={120}
                suffix="min"
                onChange={(v) => setPayments({ autoRefundMinutes: v })}
                aria-label="Auto refund after"
              />
            }
          />
        </SettingList>
        <p className="px-1 pt-3 text-[13px] text-muted">
          <Link href="/venues/data" className="font-medium text-link">
            What we store about fans
          </Link>
        </p>
      </Card>

      <Card title="Notifications">
        <SettingList>
          <ToggleRow
            label="Sound on new orders"
            description="Plays on every signed-in kitchen screen."
            checked={n.sound}
            onChange={(v) => setNotes({ sound: v })}
          />
          <SettingRow
            label="Slow order alert"
            description="Highlight orders waiting longer than this."
            control={
              <NumberInput
                value={n.slowOrderMinutes}
                min={1}
                max={120}
                suffix="min"
                onChange={(v) => setNotes({ slowOrderMinutes: v })}
                aria-label="Slow order alert"
              />
            }
          />
          <ToggleRow
            label="Low stock alerts"
            description="Warn managers before a product sells out."
            checked={n.lowStock}
            onChange={(v) => setNotes({ lowStock: v })}
          />
          <ToggleRow
            label="Match report"
            description="Sales, wait times and refunds after each match."
            checked={n.dailyReport}
            onChange={(v) => setNotes({ dailyReport: v })}
          >
            <div className="max-w-sm">
              <TextInput
                type="email"
                value={n.reportEmail}
                onChange={(v) => setNotes({ reportEmail: v })}
                placeholder="reports@example.com"
                aria-label="Report email"
              />
            </div>
          </ToggleRow>
        </SettingList>
      </Card>
    </div>
  );
}

const CURRENCY_NAMES: Record<string, string> = {
  EUR: "Euro",
  SEK: "Swedish krona",
  NOK: "Norwegian krone",
  DKK: "Danish krone",
  GBP: "Pound",
  CHF: "Swiss franc",
  USD: "US dollar",
};

function CurrencyRow({ currency, onChange }: { currency: string; onChange: (currency: string) => void }) {
  const current = currency.toUpperCase();
  const known = (CURRENCIES as readonly string[]).includes(current);
  const options = known ? CURRENCIES : [current, ...CURRENCIES];
  return (
    <SettingRow
      label="Currency"
      description="Prices, fees and payouts use this."
      control={
        <Select value={current} onValueChange={onChange}>
          <SelectTrigger aria-label="Currency" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {options.map((code) => (
              <SelectItem key={code} value={code}>
                <span className="flex items-center gap-2.5">
                  <FlagIcon code={currencyFlag(code)} className="text-[15px]" />
                  <span>
                    {code} · {CURRENCY_NAMES[code] ?? currencySymbol(code)}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}
