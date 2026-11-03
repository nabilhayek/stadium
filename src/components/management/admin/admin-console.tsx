"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/components/toast/toast-provider";
import { useTRPC } from "@/lib/trpc/react";
import type { SeatMapDoc } from "@/lib/seatmap/schema";
import { FilterTabs, PageHeader, primaryButton, secondaryButton } from "../ui";
import { KitchensTab } from "./kitchens-tab";
import type { AdminSettings, Edit, Member } from "./model";
import { OrderingTab } from "./ordering-tab";
import { ServiceTab } from "./service-tab";
import { AuditTab } from "./audit-tab";
import { TeamTab } from "./team-tab";

type Tab = "team" | "kitchens" | "ordering" | "service" | "activity";

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "team", label: "Team" },
  { id: "kitchens", label: "Kitchens & routing" },
  { id: "ordering", label: "Ordering" },
  { id: "service", label: "Service & payments" },
  { id: "activity", label: "Activity" },
];

type Props = { stadiumSlug: string; stadiumName: string; doc: SeatMapDoc; settings: AdminSettings };

export function AdminConsole({ stadiumSlug, stadiumName, doc, settings: loaded }: Props) {
  const [saved, setSaved] = useState(loaded);
  const [settings, setSettings] = useState(loaded);
  // Fresh settings from the server (navigating back, a refresh) replace the screen, unless there are unsaved edits.
  const [source, setSource] = useState(loaded);
  if (loaded !== source) {
    setSource(loaded);
    if (settings === saved) {
      setSaved(loaded);
      setSettings(loaded);
    }
  }
  const [tab, setTab] = useState<Tab>("team");
  const { toast } = useToast();
  const trpc = useTRPC();
  const save = useMutation(trpc.admin.save.mutationOptions());
  const dirty = settings !== saved;
  const edit: Edit = (change) => setSettings((s) => change(s));
  const addMember = (member: Member) => {
    const append = (current: AdminSettings) =>
      current.members.some((existing) => existing.id === member.id) ? current : { ...current, members: [...current.members, member] };
    setSettings(append);
    setSaved(append);
  };

  return (
    <div className="pb-24">
      <PageHeader title="Admin" description={`Staff, kitchens and how ordering works at ${stadiumName}.`} />
      <div className="mt-5">
        <FilterTabs label="Admin sections" value={tab} onChange={setTab} options={TABS} />
      </div>

      <div className="mt-4">
        {tab === "team" ? <TeamTab stadiumSlug={stadiumSlug} settings={settings} edit={edit} onMemberAdded={addMember} /> : null}
        {tab === "kitchens" ? <KitchensTab doc={doc} settings={settings} edit={edit} /> : null}
        {tab === "ordering" ? <OrderingTab settings={settings} edit={edit} /> : null}
        {tab === "service" ? <ServiceTab settings={settings} edit={edit} /> : null}
        {tab === "activity" ? <AuditTab stadiumSlug={stadiumSlug} /> : null}
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
              disabled={save.isPending}
              onClick={() => {
                save.mutate(
                  { stadium: stadiumSlug, settings },
                  {
                    onSuccess: (result) => {
                      if (!result.ok) {
                        toast({ message: result.error, status: "error" });
                        return;
                      }
                      setSaved(result.settings);
                      setSettings(result.settings);
                      toast({
                        message: result.invitesSent > 0 ? "Settings saved. The invite email is on its way." : "Settings saved",
                        status: "success",
                      });
                    },
                    onError: () => toast({ message: "Could not save. Try again.", status: "error" }),
                  },
                );
              }}
              className={primaryButton}
            >
              {save.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
