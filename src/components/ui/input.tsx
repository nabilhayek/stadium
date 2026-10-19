import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-neutral-200 bg-white px-3 text-[14px] text-neutral-900 outline-none transition-[border-color,box-shadow] placeholder:text-neutral-400",
        "focus-visible:border-blue-500 focus-visible:ring-3 focus-visible:ring-blue-500/15",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
