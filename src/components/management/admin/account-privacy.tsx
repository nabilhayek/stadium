"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { useTRPC } from "@/lib/trpc/react";
import { useToast } from "@/components/toast/toast-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, secondaryButton } from "../ui";

const dangerButton =
  "inline-flex h-9 items-center gap-1.5 rounded-full bg-red-600! px-4 text-[14px] font-medium text-white! transition-colors duration-150 hover:bg-red-700! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:opacity-50";

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
    <Card title="Your data" description="Download the data this sign-in stores, or delete it. The only admin of a venue cannot delete themselves.">
      <div className="flex flex-wrap gap-2 p-4">
        <button type="button" className={secondaryButton} disabled={download.isPending} onClick={() => void exportData()}>
          <Download className="size-4 text-neutral-500" aria-hidden />
          {download.isPending ? "Preparing…" : "Download my data"}
        </button>
        <button type="button" className={dangerButton} onClick={() => setConfirming(true)}>
          <Trash2 className="size-4" aria-hidden />
          Delete my account
        </button>
      </div>

      <AlertDialog open={confirming} onOpenChange={(open) => !remove.isPending && setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>You will be signed out and lose access to every venue on this sign-in. This cannot be undone.</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              tone="destructive"
              disabled={remove.isPending}
              onClick={(e) => {
                // Keep the dialog open until the request settles.
                e.preventDefault();
                void deleteAccount();
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
