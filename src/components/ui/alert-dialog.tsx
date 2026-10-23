"use client";

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function AlertDialog(props: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogContent({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-neutral-950/30 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-[60] w-[calc(100%-2rem)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-200 bg-white p-5 text-neutral-900 shadow-[0_24px_48px_-16px_rgba(17,17,17,0.25)] outline-none",
          "data-[state=open]:animate-[pop-in_180ms_cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:animate-[pop-out_140ms_ease-in]",
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return <AlertDialogPrimitive.Title className={cn("text-[16px] font-semibold", className)} {...props} />;
}

function AlertDialogDescription({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return <AlertDialogPrimitive.Description className={cn("mt-1.5 text-[14px] leading-snug text-neutral-600", className)} {...props} />;
}

const button =
  "inline-flex h-9 items-center justify-center rounded-full px-4 text-[14px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50";

function AlertDialogCancel({ className, ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(button, "border border-neutral-200 bg-white! text-neutral-900 hover:bg-neutral-50!", className)}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  tone = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & { tone?: "default" | "destructive" }) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(
        button,
        tone === "destructive" ? "bg-red-600! text-white! hover:bg-red-700!" : "bg-neutral-900! text-white! hover:bg-neutral-700!",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-5 flex justify-end gap-2", className)} {...props} />;
}

export { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle };
