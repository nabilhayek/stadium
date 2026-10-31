"use client";

import { useState } from "react";
import { useToast } from "@/components/toast/toast-provider";
import type { SeatMapDoc } from "@/lib/seatmap/schema";
import { FilterTabs, PageHeader, primaryButton, secondaryButton } from "../ui";
import { KitchensTab } from "./kitchens-tab";
import { initialSettings, type AdminSettings, type Edit } from "./model";
import { OrderingTab } from "./ordering-tab";
import { ServiceTab } from "./service-tab";
import { TeamTab } from "./team-tab";

type Tab = "team" | "kitchens" | "ordering" | "service";

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "team", label: "Team" },
  { id: "kitchens", label: "Kitchens & routing" },
  { id: "ordering", label: "Ordering" },
  { id: "service", label: "Service & payments" },
];

type Props = { stadiumName: string; currency: string; doc: SeatMapDoc };

export function AdminConsole({ stadiumName, currency, doc }: Props) {
  const [saved, setSaved] = useState<AdminSettings>(() => initialSettings(doc, currency));
  const [settings, setSettings] = useState(saved);
  const [tab, setTab] = useState<Tab>("team");
  const { toast } = useToast();
  const dirty = settings !== saved;
  const edit: Edit = (change) => setSettings((s) => change(s));

  return (
    <div className="pb-24">
      <PageHeader title="Admin" description={`Staff, kitchens and how ordering works at ${stadiumName}.`} />
      <div className="mt-5">
        <FilterTabs label="Admin sections" value={tab} onChange={setTab} options={TABS} />
      </div>

      <div className="mt-4">
        {tab === "team" ? <TeamTab settings={settings} edit={edit} /> : null}
        {tab === "kitchens" ? <KitchensTab doc={doc} settings={settings} edit={edit} /> : null}
        {tab === "ordering" ? <OrderingTab settings={settings} edit={edit} /> : null}
        {tab === "service" ? <ServiceTab settings={settings} edit={edit} /> : null}
      </div>

      {dirty ? (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 lg:pl-60">
          <div
            role="status"
            className="flex items-center gap-3 rounded-full border border-neutral-200 bg-white py-1.5 pr-1.5 pl-4 shadow-[0_16px_40px_-12px_rgba(17,17,17,0.25)]"
          >
            <span className="text-[13px] font-medium">Unsaved changes</span>
            <button type="button" onClick={() => setSettings(saved)} className={secondaryButton}>
              Discard
            </button>
            <button
              type="button"
              onClick={() => {
                setSaved(settings);
                toast({ message: "Settings saved", status: "success" });
              }}
              className={primaryButton}
            >
              Save changes
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
