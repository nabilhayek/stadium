"use client";

import type * as React from "react";

import { cn } from "@/lib/utils";

function MessageGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex min-w-0 flex-col gap-2", className)} data-slot="message-group" {...props} />;
}

function Message({
  className,
  align = "start",
  ...props
}: React.ComponentProps<"div"> & {
  /** The side of the conversation it sits on: `start` (theirs) or `end` (yours). */
  align?: "start" | "end";
}) {
  return (
    <div
      className={cn("group/message relative flex w-full min-w-0 gap-2 text-[13px] data-[align=end]:flex-row-reverse", className)}
      data-align={align}
      data-slot="message"
      {...props}
    />
  );
}

function MessageAvatar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex w-fit min-w-8 shrink-0 items-center justify-center self-end overflow-hidden rounded-full bg-neutral-100", className)}
      data-slot="message-avatar"
      {...props}
    />
  );
}

function MessageContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex w-full min-w-0 flex-col gap-2 wrap-break-word group-data-[align=end]/message:*:data-slot:self-end", className)}
      data-slot="message-content"
      {...props}
    />
  );
}

function MessageHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex max-w-full min-w-0 items-center px-3 text-[12px] font-medium text-neutral-500 group-has-data-[variant=ghost]/message:px-0", className)}
      data-slot="message-header"
      {...props}
    />
  );
}

function MessageFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex max-w-full min-w-0 items-center px-3 text-[12px] font-medium text-neutral-500 group-has-data-[variant=ghost]/message:px-0 group-data-[align=end]/message:justify-end",
        className,
      )}
      data-slot="message-footer"
      {...props}
    />
  );
}

export { Message, MessageAvatar, MessageContent, MessageFooter, MessageGroup, MessageHeader };
