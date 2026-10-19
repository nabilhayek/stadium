"use client";

import * as React from "react";
import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn("text-[16px] font-semibold", className)} {...props} />;
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description data-slot="sheet-description" className={cn("text-[13px] text-neutral-500", className)} {...props} />
  );
}

/** Right-hand panel on desktop, full screen on phones. */
/** `onClose` replaces the built-in close, e.g. to ask before discarding edits. */
function SheetContent({
  className,
  children,
  closeLabel = "Close",
  onClose,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { closeLabel?: string; onClose?: () => void }) {
  const closeClass =
    "absolute top-3 right-3 grid size-8 place-items-center rounded-lg text-neutral-500 transition-colors duration-150 hover:bg-neutral-100! hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-blue-500";
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-neutral-950/30 data-[state=closed]:animate-[fade-out_150ms_ease-in] data-[state=open]:animate-[fade-in_200ms_ease-out]"
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white text-neutral-900 outline-none sm:max-w-[640px] sm:border-l sm:border-neutral-200",
          "shadow-[-24px_0_48px_-24px_rgba(17,17,17,0.18)]",
          "data-[state=closed]:animate-[sheet-out_180ms_cubic-bezier(0.4,0,1,1)] data-[state=open]:animate-[sheet-in_260ms_cubic-bezier(0.16,1,0.3,1)]",
          className,
        )}
        {...props}
      >
        {children}
        {onClose ? (
          <button type="button" aria-label={closeLabel} onClick={onClose} className={closeClass}>
            <XIcon className="size-4" />
          </button>
        ) : (
          <SheetPrimitive.Close aria-label={closeLabel} className={closeClass}>
            <XIcon className="size-4" />
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export { Sheet, SheetContent, SheetDescription, SheetTitle };
