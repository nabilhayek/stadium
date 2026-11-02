"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { signOut } from "@/lib/auth-client";
import { useTRPC } from "@/lib/trpc/react";
import { useToast } from "@/components/toast/toast-provider";
import { Card, secondaryButton } from "../ui";

/** Download or delete the signed-in staff account. Fans have no account. */
export function AccountPrivacy({ stadiumSlug }: { stadiumSlug: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const download = useMutation(trpc.privacy.exportAccount.mutationOptions());
  const remove = useMutation(trpc.privacy.deleteAccount.mutationOptions());

  async function exportData() {
    const result = await download.mutateAsync();
    if (!result.ok) {
      toast({ message: result.error, status: "error" });
      return;
    }
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "seatize-account.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    const result = await remove.mutateAsync();
    if (!result.ok) {
      toast({ message: result.error, status: "error" });
      setConfirming(false);
      return;
    }
    await signOut();
    router.replace(`/${stadiumSlug}/management/login`);
  }

  return (
    <Card title="Your account" description="Download the data this sign-in stores, or delete it. The only admin of a venue cannot delete themselves.">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} disabled={download.isPending} onClick={() => void exportData()}>
          Download my data
        </button>
        {confirming ? (
          <button type="button" className={secondaryButton} disabled={remove.isPending} onClick={() => void deleteAccount()}>
            Confirm delete
          </button>
        ) : (
          <button type="button" className={secondaryButton} onClick={() => setConfirming(true)}>
            Delete my account
          </button>
        )}
      </div>
    </Card>
  );
}
