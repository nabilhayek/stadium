"use client";

import type * as React from "react";
import { cn } from "@/lib/utils";

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "group/input-group relative flex w-full min-w-0 flex-col rounded-2xl border border-neutral-200 bg-white transition-[border-color,box-shadow]",
        "has-[[data-slot=input-group-control]:focus-visible]:border-blue-500 has-[[data-slot=input-group-control]:focus-visible]:ring-3 has-[[data-slot=input-group-control]:focus-visible]:ring-blue-500/15",
        "has-disabled:bg-neutral-50",
        className,
      )}
      data-slot="input-group"
      role="group"
      {...props}
    />
  );
}

function InputGroupTextarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "field-sizing-content max-h-40 min-h-11 w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-[14px] leading-snug text-neutral-900 outline-none placeholder:text-neutral-400 disabled:cursor-not-allowed",
        className,
      )}
      data-slot="input-group-control"
      {...props}
    />
  );
}

function InputGroupAddon({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-1 px-2 pb-2", className)} data-slot="input-group-addon" {...props} />;
}

export { InputGroup, InputGroupAddon, InputGroupTextarea };
