"use client";

import { MessageScroller as MessageScrollerPrimitive } from "@shadcn/react/message-scroller";
import { ArrowDownIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

function MessageScrollerProvider(props: React.ComponentProps<typeof MessageScrollerPrimitive.Provider>) {
  return <MessageScrollerPrimitive.Provider {...props} />;
}

function MessageScroller({ className, ...props }: React.ComponentProps<typeof MessageScrollerPrimitive.Root>) {
  return (
    <MessageScrollerPrimitive.Root
      className={cn("group/message-scroller relative flex size-full min-h-0 flex-col overflow-hidden", className)}
      data-slot="message-scroller"
      {...props}
    />
  );
}

function MessageScrollerViewport({ className, ...props }: React.ComponentProps<typeof MessageScrollerPrimitive.Viewport>) {
  return (
    <MessageScrollerPrimitive.Viewport
      className={cn("size-full min-h-0 min-w-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] [scrollbar-width:thin] contain-content data-pending-scroll:invisible", className)}
      data-slot="message-scroller-viewport"
      {...props}
    />
  );
}

function MessageScrollerContent({ className, ...props }: React.ComponentProps<typeof MessageScrollerPrimitive.Content>) {
  return <MessageScrollerPrimitive.Content className={cn("flex h-max min-h-full flex-col gap-5", className)} data-slot="message-scroller-content" {...props} />;
}

function MessageScrollerItem({ className, scrollAnchor = false, ...props }: React.ComponentProps<typeof MessageScrollerPrimitive.Item>) {
  return <MessageScrollerPrimitive.Item className={cn("min-w-0 shrink-0", className)} data-slot="message-scroller-item" scrollAnchor={scrollAnchor} {...props} />;
}

function MessageScrollerButton({ direction = "end", className, children, ...props }: React.ComponentProps<typeof MessageScrollerPrimitive.Button>) {
  return (
    <MessageScrollerPrimitive.Button
      className={cn(
        "absolute left-1/2 grid size-8 -translate-x-1/2 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-[0_4px_12px_-4px_rgba(17,17,17,0.2)] transition-[translate,scale,opacity] duration-200 ease-out hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-blue-500",
        "data-[direction=end]:bottom-3 data-[direction=start]:top-3 data-[direction=start]:[&_svg]:rotate-180",
        "data-[active=false]:pointer-events-none data-[active=false]:scale-95 data-[active=false]:opacity-0 data-[active=true]:scale-100 data-[active=true]:opacity-100",
        className,
      )}
      data-direction={direction}
      data-slot="message-scroller-button"
      direction={direction}
      {...props}
    >
      {children ?? (
        <>
          <ArrowDownIcon aria-hidden="true" className="size-4" />
          <span className="sr-only">{direction === "end" ? "Scroll to latest" : "Scroll to start"}</span>
        </>
      )}
    </MessageScrollerPrimitive.Button>
  );
}

export { useMessageScroller, useMessageScrollerScrollable, useMessageScrollerVisibility } from "@shadcn/react/message-scroller";
export { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport };
